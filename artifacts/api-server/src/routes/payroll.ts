import { Router } from "express";
import { db } from "@workspace/db";
import {
  payrollRecordsTable, usersTable, kpiReportsTable, dealsTable, clientsTable
} from "@workspace/db";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { requireAuth, isAdmin } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";
import { sendEmail } from "../lib/mail";

const router = Router();

function commissionRate(monthlyRevenue: number): number {
  if (monthlyRevenue >= 10000) return 0.025;
  if (monthlyRevenue >= 5000) return 0.03;
  if (monthlyRevenue >= 3000) return 0.04;
  if (monthlyRevenue >= 1000) return 0.045;
  return 0.05;
}

function leadBonus(monthlyRevenue: number): number {
  if (monthlyRevenue >= 10000) return 300;
  if (monthlyRevenue >= 5000) return 200;
  if (monthlyRevenue >= 3000) return 100;
  if (monthlyRevenue >= 1000) return 50;
  if (monthlyRevenue >= 500) return 25;
  return 0;
}

function performanceBonus(newClients: number): number {
  if (newClients >= 10) return 500;
  if (newClients >= 5) return 250;
  if (newClients >= 3) return 100;
  return 0;
}

router.post("/payroll/calculate", requireAuth, async (req, res) => {
  const { userId, periodMonth, periodYear } = req.body;
  const month = Number(periodMonth), year = Number(periodYear);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 9999) {
    res.status(400).json({ error: "Valid periodMonth (1-12) and periodYear are required" }); return;
  }
  // Non-admins can only calculate their own payroll; ignore any client-supplied userId.
  const targetUserId = isAdmin(req.user!.role) ? (userId || req.user!.userId) : req.user!.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59);

  const kpiRows = await db
    .select()
    .from(kpiReportsTable)
    .where(
      and(
        eq(kpiReportsTable.userId, targetUserId),
        gte(kpiReportsTable.reportDate, periodStart.toISOString().split("T")[0]),
        lte(kpiReportsTable.reportDate, periodEnd.toISOString().split("T")[0])
      )
    );

  const kpiTotals = kpiRows.reduce((acc, r) => ({
    callsMade: acc.callsMade + (r.callsMade || 0),
    emailsSent: acc.emailsSent + (r.emailsSent || 0),
    meetingsBooked: acc.meetingsBooked + (r.meetingsBooked || 0),
    meetingsCompleted: acc.meetingsCompleted + (r.meetingsCompleted || 0),
    proposalsSent: acc.proposalsSent + (r.proposalsSent || 0),
    dealsWon: acc.dealsWon + (r.dealsWon || 0),
    revenue: acc.revenue + parseFloat(r.revenue || "0"),
  }), { callsMade: 0, emailsSent: 0, meetingsBooked: 0, meetingsCompleted: 0, proposalsSent: 0, dealsWon: 0, revenue: 0 });

  const wonDeals = await db
    .select({ value: dealsTable.value })
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.salesRepId, targetUserId),
        eq(dealsTable.stage, "closed_won"),
        gte(dealsTable.createdAt, periodStart),
        lte(dealsTable.createdAt, periodEnd)
      )
    );

  const newClients = await db
    .select({ monthlyRevenue: clientsTable.monthlyRevenue })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.ownerId, targetUserId),
        gte(clientsTable.createdAt, periodStart),
        lte(clientsTable.createdAt, periodEnd)
      )
    );

  let commissionTotal = 0;
  for (const deal of wonDeals) {
    const val = parseFloat(deal.value || "0");
    commissionTotal += val * commissionRate(val);
  }

  let leadGenTotal = 0;
  for (const client of newClients) {
    const rev = parseFloat(client.monthlyRevenue || "0");
    leadGenTotal += leadBonus(rev);
  }

  const perfBonus = performanceBonus(newClients.length);
  const totalAmount = commissionTotal + leadGenTotal + perfBonus;

  let aiScore = 75;
  let aiAnalysis = "";

  try {
    const prompt = `You are a sales performance evaluator for Topping Courier Inc., a same-day delivery company in Toronto.

Evaluate this team member's monthly performance and provide:
1. A score from 0-100
2. A brief analysis (2-3 sentences) in English

Role: ${user.role}
Period: ${month}/${year}

KPI Summary:
- Calls Made: ${kpiTotals.callsMade}
- Emails Sent: ${kpiTotals.emailsSent}
- Meetings Booked: ${kpiTotals.meetingsBooked}
- Meetings Completed: ${kpiTotals.meetingsCompleted}
- Proposals Sent: ${kpiTotals.proposalsSent}
- Deals Won: ${kpiTotals.dealsWon}
- Revenue Generated: $${kpiTotals.revenue.toFixed(2)}
- New Clients Activated: ${newClients.length}

Commission Earned: $${commissionTotal.toFixed(2)}
Lead Generator Bonus: $${leadGenTotal.toFixed(2)}
Performance Bonus: $${perfBonus.toFixed(2)}
Total Bonus: $${totalAmount.toFixed(2)}

Respond ONLY as JSON: {"score": <number 0-100>, "analysis": "<text>"}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      // gpt-5-mini is a reasoning model: it spends completion tokens on hidden
      // reasoning first, so the budget must be large enough to leave room for the
      // actual JSON answer — otherwise finish_reason is "length" and content is "".
      max_completion_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(`Empty AI response (finish_reason: ${response.choices[0]?.finish_reason})`);
    }
    const parsed = JSON.parse(content);
    aiScore = parsed.score;
    aiAnalysis = parsed.analysis;
  } catch (err) {
    req.log.error({ err }, "AI payroll scoring failed");
    aiAnalysis = "AI scoring unavailable. Calculated from KPI data.";
  }

  const [existing] = await db
    .select()
    .from(payrollRecordsTable)
    .where(
      and(
        eq(payrollRecordsTable.userId, targetUserId),
        eq(payrollRecordsTable.periodMonth, month),
        eq(payrollRecordsTable.periodYear, year)
      )
    );

  let record;
  if (existing && existing.status === "draft") {
    [record] = await db
      .update(payrollRecordsTable)
      .set({
        commissionBonus: commissionTotal.toFixed(2),
        leadGeneratorBonus: leadGenTotal.toFixed(2),
        performanceBonus: perfBonus.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        aiScore,
        aiAnalysis,
        status: "pending_approval",
        submittedAt: new Date(),
      })
      .where(eq(payrollRecordsTable.id, existing.id))
      .returning();
  } else if (!existing) {
    [record] = await db
      .insert(payrollRecordsTable)
      .values({
        userId: targetUserId,
        periodMonth: month,
        periodYear: year,
        commissionBonus: commissionTotal.toFixed(2),
        leadGeneratorBonus: leadGenTotal.toFixed(2),
        performanceBonus: perfBonus.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        aiScore,
        aiAnalysis,
        status: "pending_approval",
        submittedAt: new Date(),
      })
      .returning();
  } else {
    res.status(400).json({ error: "A payroll record for this period already exists and cannot be recalculated." });
    return;
  }

  res.status(201).json({ ...record, kpiTotals, newClients: newClients.length });
});

router.get("/payroll", requireAuth, async (req, res) => {
  const { role, userId: currentUserId } = req.user!;
  const isManager = isAdmin(role);

  const rows = await db
    .select({
      id: payrollRecordsTable.id,
      userId: payrollRecordsTable.userId,
      userName: usersTable.name,
      userRole: usersTable.role,
      periodMonth: payrollRecordsTable.periodMonth,
      periodYear: payrollRecordsTable.periodYear,
      baseBonus: payrollRecordsTable.baseBonus,
      commissionBonus: payrollRecordsTable.commissionBonus,
      leadGeneratorBonus: payrollRecordsTable.leadGeneratorBonus,
      performanceBonus: payrollRecordsTable.performanceBonus,
      strategicBonus: payrollRecordsTable.strategicBonus,
      totalAmount: payrollRecordsTable.totalAmount,
      aiScore: payrollRecordsTable.aiScore,
      aiAnalysis: payrollRecordsTable.aiAnalysis,
      status: payrollRecordsTable.status,
      managerId: payrollRecordsTable.managerId,
      managerNotes: payrollRecordsTable.managerNotes,
      submittedAt: payrollRecordsTable.submittedAt,
      approvedAt: payrollRecordsTable.approvedAt,
      createdAt: payrollRecordsTable.createdAt,
    })
    .from(payrollRecordsTable)
    .leftJoin(usersTable, eq(payrollRecordsTable.userId, usersTable.id))
    .orderBy(sql`${payrollRecordsTable.periodYear} desc, ${payrollRecordsTable.periodMonth} desc`);

  const filtered = isManager ? rows : rows.filter(r => r.userId === currentUserId);
  res.json(filtered);
});

router.get("/payroll/my", requireAuth, async (req, res) => {
  const { userId } = req.user!;
  const rows = await db
    .select()
    .from(payrollRecordsTable)
    .where(eq(payrollRecordsTable.userId, userId))
    .orderBy(sql`${payrollRecordsTable.periodYear} desc, ${payrollRecordsTable.periodMonth} desc`);
  res.json(rows);
});

router.patch("/payroll/:id/approve", requireAuth, async (req, res) => {
  const { role, userId } = req.user!;
  if (!isAdmin(role)) {
    res.status(403).json({ error: "Only CEO/Admin can approve payroll" }); return;
  }
  const { managerNotes, strategicBonus } = req.body;
  const id = Number(req.params.id);
  type PayrollUpdate = Parameters<(typeof db.update<typeof payrollRecordsTable>)>[0] extends infer T
    ? T extends object ? Partial<typeof payrollRecordsTable.$inferInsert> : never : never;

  let totalAmountUpdate: string | undefined;
  if (strategicBonus !== undefined) {
    const bonus = Number(strategicBonus);
    if (!Number.isFinite(bonus)) {
      res.status(400).json({ error: "strategicBonus must be a valid number" }); return;
    }
    const [cur] = await db.select().from(payrollRecordsTable).where(eq(payrollRecordsTable.id, id));
    if (cur) {
      // Round in cents to avoid binary floating-point drift on money values.
      const newTotal = Math.round((parseFloat(cur.totalAmount) + bonus) * 100) / 100;
      totalAmountUpdate = newTotal.toFixed(2);
    }
  }

  const setValues: typeof payrollRecordsTable.$inferInsert = {
    userId: 0, periodMonth: 0, periodYear: 0,
    status: "approved",
    managerId: userId,
    approvedAt: new Date(),
    ...(managerNotes !== undefined ? { managerNotes } : {}),
    ...(strategicBonus !== undefined ? { strategicBonus: strategicBonus.toString() } : {}),
    ...(totalAmountUpdate !== undefined ? { totalAmount: totalAmountUpdate } : {}),
  };

  const { userId: _u, periodMonth: _pm, periodYear: _py, ...safeSet } = setValues;

  const [record] = await db
    .update(payrollRecordsTable)
    .set(safeSet)
    .where(eq(payrollRecordsTable.id, id))
    .returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

router.patch("/payroll/:id/reject", requireAuth, async (req, res) => {
  const { role, userId } = req.user!;
  if (!isAdmin(role)) {
    res.status(403).json({ error: "Only CEO/Admin can reject payroll" }); return;
  }
  const { managerNotes } = req.body;
  const [record] = await db
    .update(payrollRecordsTable)
    .set({ status: "rejected", managerId: userId, managerNotes })
    .where(eq(payrollRecordsTable.id, Number(req.params.id)))
    .returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

router.patch("/payroll/:id/mark-paid", requireAuth, async (req, res) => {
  const { role } = req.user!;
  if (!isAdmin(role)) {
    res.status(403).json({ error: "Only CEO/Admin can mark payroll as paid" }); return;
  }
  const [record] = await db
    .update(payrollRecordsTable)
    .set({ status: "paid" })
    .where(eq(payrollRecordsTable.id, Number(req.params.id)))
    .returning();
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  res.json(record);
});

// ── Email a payroll record to its owner (admin only) ────────────────
router.post("/payroll/:id/send", requireAuth, async (req, res) => {
  const { role } = req.user!;
  if (!isAdmin(role)) {
    res.status(403).json({ error: "Only CEO/Admin can send payroll emails" }); return;
  }
  const [record] = await db
    .select({
      id: payrollRecordsTable.id,
      periodMonth: payrollRecordsTable.periodMonth,
      periodYear: payrollRecordsTable.periodYear,
      baseBonus: payrollRecordsTable.baseBonus,
      commissionBonus: payrollRecordsTable.commissionBonus,
      leadGeneratorBonus: payrollRecordsTable.leadGeneratorBonus,
      performanceBonus: payrollRecordsTable.performanceBonus,
      strategicBonus: payrollRecordsTable.strategicBonus,
      totalAmount: payrollRecordsTable.totalAmount,
      status: payrollRecordsTable.status,
      userEmail: usersTable.email,
      userName: usersTable.name,
    })
    .from(payrollRecordsTable)
    .leftJoin(usersTable, eq(payrollRecordsTable.userId, usersTable.id))
    .where(eq(payrollRecordsTable.id, Number(req.params.id)));
  if (!record) { res.status(404).json({ error: "Not found" }); return; }
  if (!record.userEmail) { res.status(400).json({ error: "Employee has no email on file" }); return; }

  const money = (v: string | null) => `$${Number(v ?? "0").toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row = (label: string, v: string | null) =>
    `<tr><td style="padding:6px 12px;color:#555;border-bottom:1px solid #eee">${label}</td><td style="padding:6px 12px;font-weight:600;text-align:right;border-bottom:1px solid #eee">${money(v)}</td></tr>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 4px;color:#1a1a2e">Payroll — ${record.userName ?? ""}</h2>
    <p style="color:#777;font-size:14px;margin:0 0 16px">Period: ${record.periodMonth}/${record.periodYear} · Status: ${record.status}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${row("Base bonus", record.baseBonus)}
      ${row("Commission", record.commissionBonus)}
      ${row("Lead generator bonus", record.leadGeneratorBonus)}
      ${row("Performance bonus", record.performanceBonus)}
      ${row("Strategic bonus", record.strategicBonus)}
      <tr><td style="padding:10px 12px;font-weight:700">Total</td><td style="padding:10px 12px;font-weight:700;text-align:right">${money(record.totalAmount)}</td></tr>
    </table>
    <p style="color:#aaa;font-size:11px;margin-top:24px">Sent from Topping CRM</p>
  </div>`;

  try {
    await sendEmail({ to: record.userEmail, subject: `Your Topping CRM payroll — ${record.periodMonth}/${record.periodYear}`, html });
  } catch (err) {
    req.log.error({ err }, "Failed to send payroll email");
    res.status(502).json({ error: "Failed to send email" }); return;
  }
  res.json({ sent: true, email: record.userEmail });
});

export default router;
