import { Router } from "express";
import { db } from "@workspace/db";
import {
  leadsTable, companiesTable, usersTable, activityLogsTable,
  meetingsTable, meetingAttendeesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, isAdmin } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import { sendEmail } from "../lib/mail";
import { openai } from "@workspace/integrations-openai-ai-server";
import { scoreLeadById } from "../lib/scoring";

const router = Router();

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
const MONTHLY_TARGET = 5;

function isManager(role: string) {
  return MANAGER_ROLES.includes(role);
}

// Leads are read-only ONLY for Marketing_Manager (pure observer).
// CEO/Admin retain full write access (per the role matrix).
function isLeadObserver(role: string) {
  return role === "Marketing_Manager";
}

// Ownership scope for write/detail lookups: admins reach any lead, others only their own.
function leadOwnerWhere(idStr: string | string[], userId: number, role: string) {
  const byId = eq(leadsTable.id, Number(idStr));
  return isAdmin(role) ? byId : and(byId, eq(leadsTable.ownerId, userId));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

router.get("/leads", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const query = db
    .select({
      id: leadsTable.id, name: leadsTable.name, email: leadsTable.email,
      phone: leadsTable.phone, companyId: leadsTable.companyId,
      companyName: companiesTable.name, stage: leadsTable.stage,
      source: leadsTable.source, ownerId: leadsTable.ownerId,
      ownerName: usersTable.name, value: leadsTable.value,
      notes: leadsTable.notes,
      linkedinUrl: leadsTable.linkedinUrl, industry: leadsTable.industry,
      status: leadsTable.status, aiScore: leadsTable.aiScore,
      scoreReason: leadsTable.scoreReason, priority: leadsTable.priority,
      aiNextAction: leadsTable.aiNextAction, gtaNode: leadsTable.gtaNode,
      activityType: leadsTable.activityType,
      nextActionDate: leadsTable.nextActionDate, meetingDate: leadsTable.meetingDate,
      emailsSent: leadsTable.emailsSent, emailsReceived: leadsTable.emailsReceived,
      createdAt: leadsTable.createdAt,
    })
    .from(leadsTable)
    .leftJoin(companiesTable, eq(leadsTable.companyId, companiesTable.id))
    .leftJoin(usersTable, eq(leadsTable.ownerId, usersTable.id));

  const leads = isManager(role)
    ? await query.orderBy(leadsTable.createdAt)
    : await query.where(eq(leadsTable.ownerId, userId)).orderBy(leadsTable.createdAt);

  res.json(leads);
});

// ─── MARKETING KPI / REPORT (registered before /leads/:id) ──────────────────

type KpiRow = {
  status: string; source: string | null; value: string | null;
  aiScore: number | null; emailsSent: number; emailsReceived: number;
  createdAt: Date;
};

function computeKpi(rows: KpiRow[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let emailsSent = 0, emailsReceived = 0, scoreSum = 0, scoreCount = 0;
  let pipelineValue = 0, closedWonValue = 0;
  let hot = 0, warm = 0, cold = 0;
  let meetingsScheduled = 0, meetingsDone = 0, proposalsSent = 0;
  let closedWon = 0, closedLost = 0, newLeads = 0, monthlyClosedWon = 0;
  const sources = new Map<string, number>();

  for (const r of rows) {
    emailsSent += r.emailsSent ?? 0;
    emailsReceived += r.emailsReceived ?? 0;
    if (r.aiScore != null) { scoreSum += r.aiScore; scoreCount += 1; }

    const score = r.aiScore ?? 0;
    if (r.aiScore != null && score >= 70) hot += 1;
    else if (r.aiScore != null && score >= 40) warm += 1;
    else cold += 1;

    const val = num(r.value);
    if (r.status === "closed_won") { closedWon += 1; closedWonValue += val; }
    else if (r.status === "closed_lost") closedLost += 1;
    else pipelineValue += val;

    if (r.status === "meeting_scheduled") meetingsScheduled += 1;
    if (r.status === "meeting_done") meetingsDone += 1;
    if (r.status === "proposal_sent") proposalsSent += 1;

    if (r.createdAt >= monthStart) {
      newLeads += 1;
      if (r.status === "closed_won") monthlyClosedWon += 1;
    }

    const src = r.source && r.source.trim() ? r.source : "Unknown";
    sources.set(src, (sources.get(src) ?? 0) + 1);
  }

  const total = rows.length;
  const replyRate = emailsSent > 0 ? Math.round((emailsReceived / emailsSent) * 1000) / 10 : 0;
  const conversionRate = total > 0 ? Math.round((closedWon / total) * 1000) / 10 : 0;
  const avgScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 0;

  return {
    totalLeads: total,
    newLeads,
    hotLeads: hot,
    warmLeads: warm,
    coldLeads: cold,
    replyRate,
    conversionRate,
    meetingsScheduled,
    meetingsDone,
    proposalsSent,
    closedWon,
    closedLost,
    pipelineValue: Math.round(pipelineValue * 100) / 100,
    closedWonValue: Math.round(closedWonValue * 100) / 100,
    emailsSent,
    emailsReceived,
    avgScore,
    monthlyTarget: MONTHLY_TARGET,
    monthlyClosedWon,
    sourceBreakdown: [...sources.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
  };
}

async function loadKpiRows(userId: number, role: string): Promise<KpiRow[]> {
  const base = db
    .select({
      status: leadsTable.status, source: leadsTable.source, value: leadsTable.value,
      aiScore: leadsTable.aiScore, emailsSent: leadsTable.emailsSent,
      emailsReceived: leadsTable.emailsReceived, createdAt: leadsTable.createdAt,
    })
    .from(leadsTable);
  return isManager(role) ? base : base.where(eq(leadsTable.ownerId, userId));
}

router.get("/leads/marketing-kpi", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const rows = await loadKpiRows(userId, role);
  res.json(computeKpi(rows));
});

router.post("/leads/marketing-report", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const rows = await loadKpiRows(userId, role);
  const kpi = computeKpi(rows);

  const systemPrompt = `You are the marketing performance analyst for Topping Courier Inc., a same-day B2B delivery company in the Greater Toronto Area.
Write a concise marketing performance report in ENGLISH ONLY (never Farsi), 5 to 8 sentences.
Structure:
1. Overall summary — what went well this period.
2. The biggest weakness or risk right now.
3. State of hot leads and overdue follow-ups.
4. One specific, actionable recommendation for the next 48 hours.
5. (optional) Bonus / progress against the monthly target of ${MONTHLY_TARGET} closed deals.
Finish with a final line starting with "Immediate priority:" naming one concrete action.
Be direct and professional. Do not invent data that is not provided.`;

  let report: string;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Marketing data:\n${JSON.stringify(kpi, null, 2)}` },
      ],
    });
    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error(`Empty AI response (finish_reason: ${response.choices[0]?.finish_reason})`);
    }
    report = raw;
  } catch (err) {
    req.log.error({ err }, "Marketing report generation failed");
    res.status(502).json({ error: "AI report generation is temporarily unavailable. Please try again." });
    return;
  }

  let emailed = false;
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (email) {
    try {
      const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;">${report
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
      await sendEmail({ to: email, subject: "Topping Courier — Marketing Performance Report", html });
      emailed = true;
      await logActivity({ entityType: "lead", entityId: 0, action: "report_emailed", description: `Marketing report emailed to ${email}`, userId });
    } catch (err) {
      req.log.error({ err }, "Marketing report email failed");
      res.status(502).json({ error: "Report generated but the email could not be sent." });
      return;
    }
  }

  res.json({ report, emailed });
});

router.post("/leads", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (isLeadObserver(role)) {
    res.status(403).json({ error: "Marketing Manager is an observer and cannot create leads" }); return;
  }
  const {
    name, email, phone, companyId, stage, source, value, notes,
    linkedinUrl, industry, status, gtaNode, activityType, nextActionDate, meetingDate,
    emailsSent, emailsReceived,
  } = req.body;
  const [lead] = await db.insert(leadsTable).values({
    name, email, phone, companyId,
    stage: stage || "new",
    source,
    ownerId: userId,
    value: value?.toString(),
    notes,
    linkedinUrl,
    industry,
    status: status || "new_lead",
    gtaNode: gtaNode ?? null,
    activityType: activityType || null,
    nextActionDate: nextActionDate || null,
    meetingDate: meetingDate || null,
    emailsSent: emailsSent ?? 0,
    emailsReceived: emailsReceived ?? 0,
  }).returning();
  await logActivity({ entityType: "lead", entityId: lead.id, action: "created", description: `Lead "${lead.name}" created`, userId });
  res.status(201).json(lead);
});

router.get("/leads/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, Number(req.params.id)));
  if (!lead) { res.status(404).json({ error: "Not found" }); return; }
  if (!isManager(role) && lead.ownerId !== userId) {
    res.status(403).json({ error: "Not your lead" }); return;
  }
  res.json(lead);
});

router.patch("/leads/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (isLeadObserver(role)) {
    res.status(403).json({ error: "Marketing Manager is an observer and cannot edit leads" }); return;
  }
  const [existing] = await db.select().from(leadsTable).where(
    leadOwnerWhere(req.params.id, userId, role)
  );
  if (!existing) { res.status(404).json({ error: "Not found or not your lead" }); return; }

  const {
    name, email, phone, companyId, stage, source, value, notes,
    linkedinUrl, industry, status, gtaNode, activityType, nextActionDate, meetingDate,
    emailsSent, emailsReceived,
  } = req.body;
  const updates: Partial<typeof leadsTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (companyId !== undefined) updates.companyId = companyId;
  if (stage !== undefined) updates.stage = stage;
  if (source !== undefined) updates.source = source;
  if (value !== undefined) updates.value = value?.toString();
  if (notes !== undefined) updates.notes = notes;
  if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl;
  if (industry !== undefined) updates.industry = industry;
  if (status !== undefined) updates.status = status;
  if (gtaNode !== undefined) updates.gtaNode = gtaNode;
  if (activityType !== undefined) updates.activityType = activityType || null;
  if (nextActionDate !== undefined) updates.nextActionDate = nextActionDate || null;
  if (meetingDate !== undefined) updates.meetingDate = meetingDate || null;
  if (emailsSent !== undefined) updates.emailsSent = emailsSent;
  if (emailsReceived !== undefined) updates.emailsReceived = emailsReceived;

  const [lead] = await db.update(leadsTable).set(updates).where(eq(leadsTable.id, existing.id)).returning();
  if (updates.stage && updates.stage !== existing.stage) {
    await logActivity({ entityType: "lead", entityId: lead.id, action: "stage_changed", description: `Stage changed from "${existing.stage}" to "${updates.stage}"`, userId, metadata: { from: existing.stage, to: updates.stage } });
  } else {
    await logActivity({ entityType: "lead", entityId: lead.id, action: "updated", description: `Lead "${lead.name}" updated`, userId });
  }
  res.json(lead);
});

router.delete("/leads/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (isLeadObserver(role)) {
    res.status(403).json({ error: "Marketing Manager is an observer and cannot delete leads" }); return;
  }
  const [existing] = await db.select().from(leadsTable).where(
    leadOwnerWhere(req.params.id, userId, role)
  );
  if (!existing) { res.status(404).json({ error: "Not found or not your lead" }); return; }
  await db.delete(leadsTable).where(eq(leadsTable.id, existing.id));
  res.status(204).send();
});

// ─── LOG ACTIVITY ───────────────────────────────────────────────────────────

const ACTIVITY_TYPES = ["email", "call", "meeting", "linkedin_message", "follow_up"];

router.post("/leads/:id/log-activity", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (isLeadObserver(role)) {
    res.status(403).json({ error: "Marketing Manager is an observer and cannot log activity" }); return;
  }
  const [existing] = await db.select().from(leadsTable).where(
    leadOwnerWhere(req.params.id, userId, role)
  );
  if (!existing) { res.status(404).json({ error: "Not found or not your lead" }); return; }

  const { activityType, notes, status, nextActionDate } = req.body ?? {};
  if (!ACTIVITY_TYPES.includes(activityType)) {
    res.status(400).json({ error: "Invalid activityType" }); return;
  }

  const defaultNext = new Date();
  defaultNext.setDate(defaultNext.getDate() + 3);
  const next = typeof nextActionDate === "string" && nextActionDate
    ? nextActionDate
    : defaultNext.toISOString().slice(0, 10);

  const updates: Partial<typeof leadsTable.$inferInsert> = {
    activityType,
    nextActionDate: next,
  };
  if (typeof status === "string" && status) updates.status = status as typeof existing.status;
  if (activityType === "email") updates.emailsSent = (existing.emailsSent ?? 0) + 1;

  const [lead] = await db.update(leadsTable).set(updates).where(eq(leadsTable.id, existing.id)).returning();
  await logActivity({
    entityType: "lead", entityId: lead.id, action: "activity_logged",
    description: `${activityType.replace("_", " ")} logged for "${lead.name}"${notes ? `: ${notes}` : ""}`,
    userId, metadata: { activityType, notes: notes ?? null },
  });
  res.json(lead);
});

// ─── SCHEDULE MEETING ─────────────────────────────────────────────────────────

router.post("/leads/:id/schedule-meeting", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (isLeadObserver(role)) {
    res.status(403).json({ error: "Marketing Manager is an observer and cannot schedule meetings" }); return;
  }
  const [existing] = await db
    .select({
      id: leadsTable.id, name: leadsTable.name, email: leadsTable.email,
      ownerId: leadsTable.ownerId, companyName: companiesTable.name,
    })
    .from(leadsTable)
    .leftJoin(companiesTable, eq(leadsTable.companyId, companiesTable.id))
    .where(leadOwnerWhere(req.params.id, userId, role));
  if (!existing) { res.status(404).json({ error: "Not found or not your lead" }); return; }

  const { title, startTime, endTime, location, onlineLink, notes } = req.body ?? {};
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid startTime or endTime" }); return;
  }
  if (end <= start) {
    res.status(400).json({ error: "endTime must be after startTime" }); return;
  }

  const [meeting] = await db.insert(meetingsTable).values({
    title: (title && String(title).trim()) || `Meeting with ${existing.name}`,
    clientName: existing.name,
    clientEmail: existing.email,
    companyName: existing.companyName,
    location: location || null,
    onlineLink: onlineLink || null,
    startTime: start,
    endTime: end,
    leadId: existing.id,
    ownerId: userId,
    notes: notes || null,
  }).returning();
  await db.insert(meetingAttendeesTable).values({ meetingId: meeting.id, userId });

  const [lead] = await db.update(leadsTable).set({
    status: "meeting_scheduled",
    activityType: "meeting",
    meetingDate: start.toISOString().slice(0, 10),
  }).where(eq(leadsTable.id, existing.id)).returning();

  await logActivity({
    entityType: "lead", entityId: lead.id, action: "meeting_scheduled",
    description: `Meeting scheduled with "${lead.name}" for ${start.toLocaleString()}`,
    userId, metadata: { meetingId: meeting.id },
  });
  res.json(lead);
});

// ─── AI LEAD SCORING ──────────────────────────────────────────────────────────

router.post("/leads/:id/score", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (isLeadObserver(role)) {
    res.status(403).json({ error: "Marketing Manager is an observer and cannot score leads" }); return;
  }
  const [existing] = await db
    .select({
      id: leadsTable.id, name: leadsTable.name, email: leadsTable.email,
      phone: leadsTable.phone, companyName: companiesTable.name,
      stage: leadsTable.stage, status: leadsTable.status, source: leadsTable.source,
      industry: leadsTable.industry, linkedinUrl: leadsTable.linkedinUrl,
      value: leadsTable.value, notes: leadsTable.notes, gtaNode: leadsTable.gtaNode,
      emailsSent: leadsTable.emailsSent, emailsReceived: leadsTable.emailsReceived,
      nextActionDate: leadsTable.nextActionDate, createdAt: leadsTable.createdAt,
      ownerId: leadsTable.ownerId,
    })
    .from(leadsTable)
    .leftJoin(companiesTable, eq(leadsTable.companyId, companiesTable.id))
    .where(leadOwnerWhere(req.params.id, userId, role));
  if (!existing) { res.status(404).json({ error: "Not found or not your lead" }); return; }

  try {
    const lead = await scoreLeadById(existing.id, userId);
    res.json(lead);
  } catch (err) {
    req.log.error({ err }, "AI lead scoring failed");
    res.status(502).json({ error: "AI scoring is temporarily unavailable. Please try again." });
  }
});

export default router;
