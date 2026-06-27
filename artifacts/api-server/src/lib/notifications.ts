import {
  db,
  usersTable,
  leadsTable,
  tasksTable,
  meetingsTable,
  activityLogsTable,
  kpiReportsTable,
  userGoalsTable,
} from "@workspace/db";
import { eq, and, gte, lte, lt, ne, notInArray, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendEmail } from "./mail";
import { logger } from "./logger";

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
const isManager = (role: string) => MANAGER_ROLES.includes(role);
const CLOSED_LEAD_STAGES: ("closed_won" | "closed_lost")[] = ["closed_won", "closed_lost"];
const DONE_TASK_STATUSES: ("completed" | "cancelled")[] = ["completed", "cancelled"];

export type Alert = {
  type: "stale_lead" | "overdue_task" | "assigned_task" | "meeting_today" | "stuck_deal";
  severity: "info" | "warning" | "danger";
  message: string;
  entityType?: string;
  entityId?: number;
};

function dayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Compute "smart alerts" for a user. Managers see alerts across the whole team;
 * everyone else only sees alerts for the records they own / are assigned.
 */
export async function computeAlerts(userId: number, role: string): Promise<Alert[]> {
  const manager = isManager(role);
  const alerts: Alert[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const { start: todayStart, end: todayEnd } = dayBounds(now);

  // --- Stale open leads (no activity in 7+ days) ---
  const openLeads = await db
    .select({ id: leadsTable.id, name: leadsTable.name, stage: leadsTable.stage, createdAt: leadsTable.createdAt, ownerId: leadsTable.ownerId })
    .from(leadsTable)
    .where(
      manager
        ? notInArray(leadsTable.stage, CLOSED_LEAD_STAGES)
        : and(notInArray(leadsTable.stage, CLOSED_LEAD_STAGES), eq(leadsTable.ownerId, userId)),
    );

  if (openLeads.length) {
    const latest = await db
      .select({ entityId: activityLogsTable.entityId, last: sql<string>`max(${activityLogsTable.createdAt})` })
      .from(activityLogsTable)
      .where(eq(activityLogsTable.entityType, "lead"))
      .groupBy(activityLogsTable.entityId);
    const lastMap = new Map(latest.map((r) => [r.entityId, new Date(r.last)]));
    for (const l of openLeads) {
      const last = lastMap.get(l.id) ?? l.createdAt;
      if (last < sevenDaysAgo) {
        const days = Math.floor((now.getTime() - last.getTime()) / 86400000);
        alerts.push({
          type: "stale_lead",
          severity: "warning",
          message: `Lead "${l.name}" has had no activity for ${days} days`,
          entityType: "lead",
          entityId: l.id,
        });
      }
    }
  }

  // --- Overdue tasks ---
  const overdueTasks = await db
    .select({ id: tasksTable.id, title: tasksTable.title })
    .from(tasksTable)
    .where(
      manager
        ? and(lt(tasksTable.dueDate, now), notInArray(tasksTable.status, DONE_TASK_STATUSES))
        : and(lt(tasksTable.dueDate, now), notInArray(tasksTable.status, DONE_TASK_STATUSES), eq(tasksTable.assigneeId, userId)),
    );
  for (const t of overdueTasks) {
    alerts.push({ type: "overdue_task", severity: "danger", message: `Task "${t.title}" is overdue`, entityType: "task", entityId: t.id });
  }

  // --- Meetings happening today ---
  const meetingsToday = await db
    .select({ id: meetingsTable.id, title: meetingsTable.title, startTime: meetingsTable.startTime })
    .from(meetingsTable)
    .where(
      manager
        ? and(gte(meetingsTable.startTime, todayStart), lte(meetingsTable.startTime, todayEnd), ne(meetingsTable.status, "cancelled"))
        : and(gte(meetingsTable.startTime, todayStart), lte(meetingsTable.startTime, todayEnd), ne(meetingsTable.status, "cancelled"), eq(meetingsTable.ownerId, userId)),
    );
  for (const m of meetingsToday) {
    const time = new Date(m.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    alerts.push({ type: "meeting_today", severity: "info", message: `Meeting "${m.title}" today at ${time}`, entityType: "meeting", entityId: m.id });
  }

  // --- Open tasks assigned to me (so the user knows work is waiting on them) ---
  // Always scoped to the current user, regardless of role. Overdue ones are
  // skipped here because they already surface above as "overdue_task".
  const myOpenTasks = await db
    .select({ id: tasksTable.id, title: tasksTable.title, dueDate: tasksTable.dueDate })
    .from(tasksTable)
    .where(and(eq(tasksTable.assigneeId, userId), notInArray(tasksTable.status, DONE_TASK_STATUSES)));
  for (const t of myOpenTasks) {
    if (t.dueDate && t.dueDate < now) continue;
    alerts.push({ type: "assigned_task", severity: "info", message: `You have a task: "${t.title}"`, entityType: "task", entityId: t.id });
  }

  return alerts;
}

type ReminderBundle = {
  meetingsToday: { title: string; time: string }[];
  overdueTasks: { title: string }[];
  dueTodayTasks: { title: string }[];
};

async function getUserReminders(userId: number): Promise<ReminderBundle> {
  const now = new Date();
  const { start: todayStart, end: todayEnd } = dayBounds(now);

  const meetings = await db
    .select({ title: meetingsTable.title, startTime: meetingsTable.startTime })
    .from(meetingsTable)
    .where(and(eq(meetingsTable.ownerId, userId), gte(meetingsTable.startTime, todayStart), lte(meetingsTable.startTime, todayEnd), ne(meetingsTable.status, "cancelled")))
    .orderBy(meetingsTable.startTime);

  const overdue = await db
    .select({ title: tasksTable.title })
    .from(tasksTable)
    .where(and(eq(tasksTable.assigneeId, userId), lt(tasksTable.dueDate, todayStart), notInArray(tasksTable.status, DONE_TASK_STATUSES)));

  const dueToday = await db
    .select({ title: tasksTable.title })
    .from(tasksTable)
    .where(and(eq(tasksTable.assigneeId, userId), gte(tasksTable.dueDate, todayStart), lte(tasksTable.dueDate, todayEnd), notInArray(tasksTable.status, DONE_TASK_STATUSES)));

  return {
    meetingsToday: meetings.map((m) => ({ title: m.title, time: new Date(m.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) })),
    overdueTasks: overdue,
    dueTodayTasks: dueToday,
  };
}

function reminderHtml(name: string, b: ReminderBundle): string {
  const li = (s: string) => `<li style="margin:4px 0;">${s}</li>`;
  const section = (title: string, items: string[]) =>
    items.length ? `<h3 style="margin:16px 0 4px;color:#111;">${title}</h3><ul style="padding-left:20px;color:#333;">${items.join("")}</ul>` : "";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#111;">Good morning, ${name} 👋</h2>
      <p style="color:#555;">Here's what's on your plate today at Topping Courier.</p>
      ${section("📅 Meetings today", b.meetingsToday.map((m) => li(`${m.time} — ${m.title}`)))}
      ${section("⚠️ Overdue tasks", b.overdueTasks.map((t) => li(t.title)))}
      ${section("✅ Tasks due today", b.dueTodayTasks.map((t) => li(t.title)))}
      <p style="color:#999;font-size:12px;margin-top:24px;">Topping CRM · automated reminder</p>
    </div>`;
}

/**
 * Send daily reminder emails to every active user who has something on their plate.
 * Returns the number of emails actually sent.
 */
export async function runDailyReminders(): Promise<number> {
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  let sent = 0;
  for (const u of users) {
    if (!u.email) continue;
    try {
      const bundle = await getUserReminders(u.id);
      const hasContent = bundle.meetingsToday.length || bundle.overdueTasks.length || bundle.dueTodayTasks.length;
      if (!hasContent) continue;
      await sendEmail({ to: u.email, subject: "☀️ Your Topping CRM daily reminders", html: reminderHtml(u.name, bundle) });
      sent++;
    } catch (err) {
      logger.error({ err, userId: u.id }, "Failed to send daily reminder");
    }
  }
  return sent;
}

type SummaryContext = {
  userName: string;
  role: string;
  yesterday: { callsMade: number; meetingsBooked: number; meetingsCompleted: number; dealsWon: number; revenue: number };
  monthToDate: { revenue: number; dealsWon: number; meetingsBooked: number; callsMade: number };
  goal: { targetRevenue: number; targetDealsWon: number; targetMeetingsBooked: number; targetCallsMade: number } | null;
  openLeads: number;
  alerts: Alert[];
};

async function buildSummaryContext(user: { id: number; name: string; role: string }): Promise<SummaryContext> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const yKey = yesterday.toISOString().split("T")[0];
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const periodStart = new Date(year, month - 1, 1).toISOString().split("T")[0];
  const periodEnd = new Date(year, month, 0).toISOString().split("T")[0];

  const [yRow] = await db
    .select()
    .from(kpiReportsTable)
    .where(and(eq(kpiReportsTable.userId, user.id), eq(kpiReportsTable.reportDate, yKey)));

  const [mtd] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${kpiReportsTable.revenue}::numeric), 0)::float`,
      dealsWon: sql<number>`coalesce(sum(${kpiReportsTable.dealsWon}), 0)::int`,
      meetingsBooked: sql<number>`coalesce(sum(${kpiReportsTable.meetingsBooked}), 0)::int`,
      callsMade: sql<number>`coalesce(sum(${kpiReportsTable.callsMade}), 0)::int`,
    })
    .from(kpiReportsTable)
    .where(and(eq(kpiReportsTable.userId, user.id), gte(kpiReportsTable.reportDate, periodStart), lte(kpiReportsTable.reportDate, periodEnd)));

  const [g] = await db
    .select()
    .from(userGoalsTable)
    .where(and(eq(userGoalsTable.userId, user.id), eq(userGoalsTable.month, month), eq(userGoalsTable.year, year)));

  const [openLeadsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(and(eq(leadsTable.ownerId, user.id), notInArray(leadsTable.stage, CLOSED_LEAD_STAGES)));

  const alerts = await computeAlerts(user.id, user.role);

  return {
    userName: user.name,
    role: user.role,
    yesterday: {
      callsMade: yRow?.callsMade || 0,
      meetingsBooked: yRow?.meetingsBooked || 0,
      meetingsCompleted: yRow?.meetingsCompleted || 0,
      dealsWon: yRow?.dealsWon || 0,
      revenue: parseFloat(yRow?.revenue || "0"),
    },
    monthToDate: {
      revenue: mtd?.revenue || 0,
      dealsWon: mtd?.dealsWon || 0,
      meetingsBooked: mtd?.meetingsBooked || 0,
      callsMade: mtd?.callsMade || 0,
    },
    goal: g
      ? {
          targetRevenue: Number(g.targetRevenue),
          targetDealsWon: g.targetDealsWon,
          targetMeetingsBooked: g.targetMeetingsBooked,
          targetCallsMade: g.targetCallsMade,
        }
      : null,
    openLeads: openLeadsRow?.count || 0,
    alerts,
  };
}

async function generateSummaryText(ctx: SummaryContext): Promise<string> {
  const goalLine = ctx.goal
    ? `Monthly goal: $${ctx.goal.targetRevenue} revenue, ${ctx.goal.targetDealsWon} deals, ${ctx.goal.targetMeetingsBooked} meetings, ${ctx.goal.targetCallsMade} calls.`
    : "No monthly goal set.";
  const prompt = `You are a friendly sales coach at Topping Courier Inc., a same-day delivery company in Toronto. Write a short, motivating daily summary (3-4 sentences max) for a team member. Be specific with the numbers, point out one thing to celebrate and one priority for today. Plain text, no markdown headings.

Team member: ${ctx.userName} (${ctx.role})

Yesterday: ${ctx.yesterday.callsMade} calls, ${ctx.yesterday.meetingsBooked} meetings booked, ${ctx.yesterday.meetingsCompleted} meetings completed, ${ctx.yesterday.dealsWon} deals won, $${ctx.yesterday.revenue.toFixed(2)} revenue.
Month to date: $${ctx.monthToDate.revenue.toFixed(2)} revenue, ${ctx.monthToDate.dealsWon} deals, ${ctx.monthToDate.meetingsBooked} meetings, ${ctx.monthToDate.callsMade} calls.
${goalLine}
Open leads: ${ctx.openLeads}.
Active alerts: ${ctx.alerts.length ? ctx.alerts.map((a) => a.message).join("; ") : "none"}.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(`Empty AI response (finish_reason: ${response.choices[0]?.finish_reason})`);
    }
    return content;
  } catch (err) {
    logger.error({ err }, "AI daily summary generation failed");
    return `Good morning, ${ctx.userName}! Yesterday you made ${ctx.yesterday.callsMade} calls and booked ${ctx.yesterday.meetingsBooked} meetings. Month to date you're at $${ctx.monthToDate.revenue.toFixed(2)} in revenue. Keep pushing on your ${ctx.openLeads} open leads today.`;
  }
}

function summaryHtml(ctx: SummaryContext, aiText: string): string {
  const alertItems = ctx.alerts.length
    ? `<ul style="padding-left:20px;color:#333;">${ctx.alerts.map((a) => `<li style="margin:4px 0;">${a.message}</li>`).join("")}</ul>`
    : `<p style="color:#16a34a;">No alerts — you're all caught up! 🎉</p>`;
  const pct = (actual: number, target: number) => (target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null);
  const goalRow = ctx.goal
    ? `<h3 style="margin:16px 0 4px;color:#111;">🎯 Goal progress (this month)</h3>
       <ul style="padding-left:20px;color:#333;">
         <li>Revenue: $${ctx.monthToDate.revenue.toFixed(0)} / $${ctx.goal.targetRevenue} ${pct(ctx.monthToDate.revenue, ctx.goal.targetRevenue) !== null ? `(${pct(ctx.monthToDate.revenue, ctx.goal.targetRevenue)}%)` : ""}</li>
         <li>Deals: ${ctx.monthToDate.dealsWon} / ${ctx.goal.targetDealsWon}</li>
         <li>Meetings: ${ctx.monthToDate.meetingsBooked} / ${ctx.goal.targetMeetingsBooked}</li>
         <li>Calls: ${ctx.monthToDate.callsMade} / ${ctx.goal.targetCallsMade}</li>
       </ul>`
    : "";
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#111;">Your daily summary ☀️</h2>
      <p style="color:#333;line-height:1.5;">${aiText.replace(/\n/g, "<br/>")}</p>
      ${goalRow}
      <h3 style="margin:16px 0 4px;color:#111;">🔔 Smart alerts</h3>
      ${alertItems}
      <p style="color:#999;font-size:12px;margin-top:24px;">Topping CRM · automated daily summary</p>
    </div>`;
}

/**
 * Build + (optionally) email a daily summary for one user. Returns the AI text and alerts
 * so the same data can be shown in-app via the API.
 */
export async function buildAndMaybeSendSummary(
  user: { id: number; name: string; role: string; email: string | null },
  send: boolean,
): Promise<{ summary: string; alerts: Alert[] }> {
  const ctx = await buildSummaryContext(user);
  const aiText = await generateSummaryText(ctx);
  if (send && user.email) {
    await sendEmail({ to: user.email, subject: "📊 Your Topping CRM daily summary", html: summaryHtml(ctx, aiText) });
  }
  return { summary: aiText, alerts: ctx.alerts };
}

/** Send daily summary emails to all active users. Returns count sent. */
export async function runDailySummaries(): Promise<number> {
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));
  let sent = 0;
  for (const u of users) {
    if (!u.email) continue;
    try {
      await buildAndMaybeSendSummary(u, true);
      sent++;
    } catch (err) {
      logger.error({ err, userId: u.id }, "Failed to send daily summary");
    }
  }
  return sent;
}
