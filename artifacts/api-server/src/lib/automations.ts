import {
  db,
  usersTable,
  leadsTable,
  tasksTable,
  dealsTable,
  activityLogsTable,
  kpiReportsTable,
  automationRunsTable,
} from "@workspace/db";
import type { AutomationRun } from "@workspace/db";
import { eq, and, lt, gte, isNull, isNotNull, notInArray, inArray, desc, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendEmail } from "./mail";
import { logActivity } from "./activity";
import { logger } from "./logger";
import { scoreLeadById } from "./scoring";

const MANAGER_ROLES: ("CEO" | "Admin" | "Marketing_Manager")[] = ["CEO", "Admin", "Marketing_Manager"];
const CLOSED_LEAD_STAGES: ("closed_won" | "closed_lost")[] = ["closed_won", "closed_lost"];
const CLOSED_DEAL_STAGES: ("closed_won" | "closed_lost")[] = ["closed_won", "closed_lost"];
const DONE_TASK_STATUSES: ("completed" | "cancelled")[] = ["completed", "cancelled"];

const FOLLOWUP_STALE_DAYS = 3;
const DEAL_STALE_DAYS = 7;
const KPI_DROP_THRESHOLD = 0.8; // flag when current < 80% of previous
const AUTO_SCORE_BATCH = 20;

const DAY_MS = 86_400_000;
const dateKey = (d: Date) => d.toISOString().split("T")[0];

export type AutomationRunResult = { message: string; itemsAffected: number };

export type AutomationDef = {
  key: string;
  name: string;
  description: string;
  trigger: "schedule" | "event";
  schedule: string; // human-readable cadence
  cron?: string; // cron expression for scheduled automations
  run?: () => Promise<AutomationRunResult>;
};

// ── Shared helpers ──────────────────────────────────────────────────

/** Map entityId -> most recent activity timestamp for a given entity type. */
async function lastActivityMap(entityType: "lead" | "deal"): Promise<Map<number, Date>> {
  const rows = await db
    .select({ entityId: activityLogsTable.entityId, last: sql<string>`max(${activityLogsTable.createdAt})` })
    .from(activityLogsTable)
    .where(eq(activityLogsTable.entityType, entityType))
    .groupBy(activityLogsTable.entityId);
  return new Map(rows.map((r) => [r.entityId, new Date(r.last)]));
}

async function sumKpi(where: ReturnType<typeof gte>): Promise<{ revenue: number; dealsWon: number; meetingsBooked: number; callsMade: number }> {
  const [row] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${kpiReportsTable.revenue}::numeric), 0)::float`,
      dealsWon: sql<number>`coalesce(sum(${kpiReportsTable.dealsWon}), 0)::int`,
      meetingsBooked: sql<number>`coalesce(sum(${kpiReportsTable.meetingsBooked}), 0)::int`,
      callsMade: sql<number>`coalesce(sum(${kpiReportsTable.callsMade}), 0)::int`,
    })
    .from(kpiReportsTable)
    .where(where);
  return { revenue: row?.revenue ?? 0, dealsWon: row?.dealsWon ?? 0, meetingsBooked: row?.meetingsBooked ?? 0, callsMade: row?.callsMade ?? 0 };
}

async function activeManagers() {
  return db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, MANAGER_ROLES)));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 1. Stale lead follow-up tasks ───────────────────────────────────

async function runStaleLeadFollowups(): Promise<AutomationRunResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - FOLLOWUP_STALE_DAYS * DAY_MS);

  const openLeads = await db
    .select({
      id: leadsTable.id, name: leadsTable.name, createdAt: leadsTable.createdAt,
      ownerId: leadsTable.ownerId, priority: leadsTable.priority, aiNextAction: leadsTable.aiNextAction,
    })
    .from(leadsTable)
    .where(and(notInArray(leadsTable.stage, CLOSED_LEAD_STAGES), isNotNull(leadsTable.ownerId)));
  if (!openLeads.length) return { message: "No open leads to check", itemsAffected: 0 };

  const lastMap = await lastActivityMap("lead");

  // Dedup: skip leads that already have an open follow-up task linked to them.
  const openTasks = await db
    .select({ leadId: tasksTable.leadId })
    .from(tasksTable)
    .where(and(isNotNull(tasksTable.leadId), notInArray(tasksTable.status, DONE_TASK_STATUSES)));
  const alreadyHasTask = new Set(openTasks.map((t) => t.leadId));

  let created = 0;
  for (const l of openLeads) {
    if (alreadyHasTask.has(l.id)) continue;
    const last = lastMap.get(l.id) ?? l.createdAt;
    if (last >= cutoff) continue;
    const days = Math.floor((now.getTime() - last.getTime()) / DAY_MS);
    const priority: "low" | "medium" | "high" =
      l.priority === "HOT" ? "high" : l.priority === "COLD" ? "low" : "medium";
    const description = `No activity for ${days} days.${l.aiNextAction ? ` Suggested next action: ${l.aiNextAction}` : ""}`;
    const [task] = await db
      .insert(tasksTable)
      .values({ title: `Follow up with ${l.name}`, description, priority, status: "pending", dueDate: now, assigneeId: l.ownerId, leadId: l.id })
      .returning();
    await logActivity({ entityType: "lead", entityId: l.id, action: "followup_task_created", description: `Auto follow-up task created (stale ${days} days)`, userId: null, metadata: { taskId: task.id } });
    created++;
  }
  return {
    message: created ? `Created ${created} follow-up task(s) for stale leads` : "No stale leads needed a follow-up task",
    itemsAffected: created,
  };
}

// ── 2. Manager alerts (stalled deals / KPI drops) ───────────────────

async function runManagerAlerts(): Promise<AutomationRunResult> {
  const now = new Date();
  const dealCutoff = new Date(now.getTime() - DEAL_STALE_DAYS * DAY_MS);

  // Stalled deals: active deals with no activity in DEAL_STALE_DAYS days.
  const activeDeals = await db
    .select({ id: dealsTable.id, title: dealsTable.title, stage: dealsTable.stage, createdAt: dealsTable.createdAt })
    .from(dealsTable)
    .where(notInArray(dealsTable.stage, CLOSED_DEAL_STAGES));
  const dealLastMap = activeDeals.length ? await lastActivityMap("deal") : new Map<number, Date>();
  const stalled: { title: string; stage: string; days: number }[] = [];
  for (const d of activeDeals) {
    const last = dealLastMap.get(d.id) ?? d.createdAt;
    if (last < dealCutoff) {
      stalled.push({ title: d.title, stage: d.stage, days: Math.floor((now.getTime() - last.getTime()) / DAY_MS) });
    }
  }

  // KPI drop: team totals for the last 7 days vs the prior 7 days.
  const sevenKey = dateKey(new Date(now.getTime() - 7 * DAY_MS));
  const fourteenKey = dateKey(new Date(now.getTime() - 14 * DAY_MS));
  const thisWeek = await sumKpi(gte(kpiReportsTable.reportDate, sevenKey));
  const lastWeek = await sumKpi(and(gte(kpiReportsTable.reportDate, fourteenKey), lt(kpiReportsTable.reportDate, sevenKey))!);
  const drops: string[] = [];
  const checkDrop = (label: string, cur: number, prev: number) => {
    if (prev > 0 && cur < prev * KPI_DROP_THRESHOLD) drops.push(`${label} dropped from ${prev} to ${cur} week-over-week`);
  };
  checkDrop("Meetings booked", thisWeek.meetingsBooked, lastWeek.meetingsBooked);
  checkDrop("Deals won", thisWeek.dealsWon, lastWeek.dealsWon);
  checkDrop("Calls made", thisWeek.callsMade, lastWeek.callsMade);

  const issues = stalled.length + drops.length;
  if (!issues) return { message: "No stalled deals or KPI drops detected", itemsAffected: 0 };

  const stalledHtml = stalled.length
    ? `<h3 style="margin:16px 0 4px;color:#111;">🐌 Stalled deals (${stalled.length})</h3><ul style="padding-left:20px;color:#333;">${stalled.map((s) => `<li style="margin:4px 0;">${esc(s.title)} — ${esc(s.stage)}, no activity for ${s.days} days</li>`).join("")}</ul>`
    : "";
  const dropsHtml = drops.length
    ? `<h3 style="margin:16px 0 4px;color:#111;">📉 KPI drops (${drops.length})</h3><ul style="padding-left:20px;color:#333;">${drops.map((d) => `<li style="margin:4px 0;">${esc(d)}</li>`).join("")}</ul>`
    : "";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#111;">⚠️ Manager alert — attention needed</h2>
      <p style="color:#555;">The automation engine flagged the following issues across the team.</p>
      ${stalledHtml}
      ${dropsHtml}
      <p style="color:#999;font-size:12px;margin-top:24px;">Topping CRM · automated manager alert</p>
    </div>`;

  const managers = await activeManagers();
  let emailed = 0;
  for (const m of managers) {
    if (!m.email) continue;
    try {
      await sendEmail({ to: m.email, subject: "⚠️ Topping CRM — Manager Alert", html });
      emailed++;
    } catch (err) {
      logger.error({ err }, "Manager alert email failed");
    }
  }
  return {
    message: `${stalled.length} stalled deal(s), ${drops.length} KPI drop(s) — alerted ${emailed} manager(s)`,
    itemsAffected: issues,
  };
}

// ── 3. Auto AI lead scoring ─────────────────────────────────────────

async function runAutoLeadScoring(): Promise<AutomationRunResult> {
  const leads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(isNull(leadsTable.aiScore), notInArray(leadsTable.stage, CLOSED_LEAD_STAGES)))
    .limit(AUTO_SCORE_BATCH);
  if (!leads.length) return { message: "No unscored leads", itemsAffected: 0 };

  let scored = 0;
  let failed = 0;
  for (const l of leads) {
    try {
      await scoreLeadById(l.id, null);
      scored++;
    } catch (err) {
      failed++;
      logger.error({ err, leadId: l.id }, "Auto lead scoring failed for one lead");
    }
  }
  // If every attempt failed (e.g. AI provider outage), surface it as an error
  // so the run is recorded with status "error" instead of a misleading success.
  if (scored === 0 && failed > 0) {
    throw new Error(`AI lead scoring failed for all ${failed} lead(s)`);
  }
  const suffix = failed ? ` (${failed} failed)` : "";
  return { message: `AI-scored ${scored} lead(s)${suffix}`, itemsAffected: scored };
}

// ── 4. Sales growth report ──────────────────────────────────────────

async function runSalesGrowthReport(): Promise<AutomationRunResult> {
  const now = new Date();
  const sevenKey = dateKey(new Date(now.getTime() - 7 * DAY_MS));
  const fourteenKey = dateKey(new Date(now.getTime() - 14 * DAY_MS));
  const monthStart = dateKey(new Date(now.getFullYear(), now.getMonth(), 1));

  const thisWeek = await sumKpi(gte(kpiReportsTable.reportDate, sevenKey));
  const lastWeek = await sumKpi(and(gte(kpiReportsTable.reportDate, fourteenKey), lt(kpiReportsTable.reportDate, sevenKey))!);
  const monthToDate = await sumKpi(gte(kpiReportsTable.reportDate, monthStart));

  const [openLeads] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(notInArray(leadsTable.stage, CLOSED_LEAD_STAGES));
  const [hotLeads] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(and(notInArray(leadsTable.stage, CLOSED_LEAD_STAGES), eq(leadsTable.priority, "HOT")));

  const data = {
    thisWeek,
    lastWeek,
    monthToDate,
    openLeads: openLeads?.count ?? 0,
    hotLeads: hotLeads?.count ?? 0,
  };

  const systemPrompt = `You are the sales growth analyst for Topping Courier Inc., a same-day B2B delivery company in the Greater Toronto Area.
Write a concise sales growth report in ENGLISH ONLY (never Farsi), 5 to 8 sentences.
Structure:
1. Week-over-week growth — compare this week vs last week (revenue, deals won, meetings booked, calls made). State the trend clearly (growth or decline, with rough %).
2. Month-to-date progress.
3. Pipeline health — open leads and hot leads.
4. One specific, actionable recommendation to grow sales over the next 7 days.
Finish with a final line starting with "Growth priority:" naming one concrete action.
Be direct and professional. Do not invent data that is not provided.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 3000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Sales data:\n${JSON.stringify(data, null, 2)}` },
    ],
  });
  const report = response.choices[0]?.message?.content?.trim();
  if (!report) {
    throw new Error(`Empty AI response (finish_reason: ${response.choices[0]?.finish_reason})`);
  }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
    <h2 style="color:#111;">📈 Sales Growth Report</h2>
    <div style="font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;">${esc(report)}</div>
    <p style="color:#999;font-size:12px;margin-top:24px;">Topping CRM · automated sales growth report</p>
  </div>`;

  const managers = await activeManagers();
  let emailed = 0;
  for (const m of managers) {
    if (!m.email) continue;
    try {
      await sendEmail({ to: m.email, subject: "📈 Topping CRM — Sales Growth Report", html });
      emailed++;
    } catch (err) {
      logger.error({ err }, "Sales growth report email failed");
    }
  }
  return { message: `Sales growth report emailed to ${emailed} manager(s)`, itemsAffected: emailed };
}

// ── Registry ────────────────────────────────────────────────────────

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: "stale_lead_followups",
    name: "Stale Lead Follow-ups",
    description: `Creates a follow-up task for each open lead with no activity for ${FOLLOWUP_STALE_DAYS}+ days, assigned to its owner.`,
    trigger: "schedule",
    schedule: "Daily · 8:15 AM",
    cron: "15 8 * * *",
    run: runStaleLeadFollowups,
  },
  {
    key: "manager_alerts",
    name: "Manager Alerts",
    description: `Emails managers when deals stall (${DEAL_STALE_DAYS}+ days idle) or key KPIs drop week-over-week.`,
    trigger: "schedule",
    schedule: "Daily · 8:30 AM",
    cron: "30 8 * * *",
    run: runManagerAlerts,
  },
  {
    key: "auto_lead_scoring",
    name: "AI Lead Scoring",
    description: "Automatically AI-scores new, unscored leads and sets their priority and next action.",
    trigger: "schedule",
    schedule: "Daily · 6:00 AM",
    cron: "0 6 * * *",
    run: runAutoLeadScoring,
  },
  {
    key: "sales_growth_report",
    name: "Sales Growth Report",
    description: "Generates an AI sales-growth report (week-over-week trends + recommendations) and emails it to managers.",
    trigger: "schedule",
    schedule: "Weekly · Monday 7:45 AM",
    cron: "45 7 * * 1",
    run: runSalesGrowthReport,
  },
  {
    key: "pipeline_stage_tasks",
    name: "Pipeline Stage Tasks",
    description: "When a deal moves to a new pipeline stage, automatically creates the right next-step task for its owner.",
    trigger: "event",
    schedule: "Automatic · on deal stage change",
  },
];

// ── Runner & listing ────────────────────────────────────────────────

/** Run an automation by key, recording the outcome to automation_runs. */
export async function runAutomation(key: string): Promise<AutomationRun> {
  const def = AUTOMATIONS.find((a) => a.key === key);
  if (!def) throw new Error("UNKNOWN_AUTOMATION");
  if (!def.run) throw new Error("EVENT_TRIGGERED");

  try {
    const { message, itemsAffected } = await def.run();
    const [row] = await db
      .insert(automationRunsTable)
      .values({ key, status: "success", message, itemsAffected })
      .returning();
    logger.info({ key, itemsAffected }, "Automation completed");
    return row;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, key }, "Automation failed");
    const [row] = await db
      .insert(automationRunsTable)
      .values({ key, status: "error", message, itemsAffected: 0 })
      .returning();
    return row;
  }
}

export type AutomationListItem = {
  key: string;
  name: string;
  description: string;
  trigger: "schedule" | "event";
  schedule: string;
  lastRun: AutomationRun | null;
};

/** List all automations with their most recent run. */
export async function listAutomations(): Promise<AutomationListItem[]> {
  const runs = await db.select().from(automationRunsTable).orderBy(desc(automationRunsTable.ranAt));
  const lastByKey = new Map<string, AutomationRun>();
  for (const r of runs) if (!lastByKey.has(r.key)) lastByKey.set(r.key, r);
  return AUTOMATIONS.map((a) => ({
    key: a.key,
    name: a.name,
    description: a.description,
    trigger: a.trigger,
    schedule: a.schedule,
    lastRun: lastByKey.get(a.key) ?? null,
  }));
}
