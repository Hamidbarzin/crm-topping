import { Router } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { kpiReportsTable, usersTable } from "@workspace/db";
import { eq, gte, lte, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "topping-crm-secret-2024";
const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];

interface ShareTokenPayload {
  type: "kpi_share";
  targetUserId: number;
  month?: number;
  year?: number;
}

// POST /api/reports/share — generate a shareable token
router.post("/reports/share", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const { targetUserId, month, year } = req.body as { targetUserId?: number; month?: number; year?: number };

  // Only managers can share reports for other users
  const shareFor = MANAGER_ROLES.includes(role) && targetUserId ? targetUserId : userId;

  const payload: ShareTokenPayload = {
    type: "kpi_share",
    targetUserId: shareFor,
    ...(month ? { month } : {}),
    ...(year ? { year } : {}),
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, shareUrl: `/report/share?token=${token}` });
});

// GET /api/reports/share/:token — public endpoint, no auth required
router.get("/reports/share/:token", async (req, res) => {
  const { token } = req.params;
  let payload: ShareTokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as ShareTokenPayload;
    if (payload.type !== "kpi_share") throw new Error("invalid type");
  } catch {
    res.status(401).json({ error: "Invalid or expired share link" }); return;
  }

  const { targetUserId, month, year } = payload;

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, targetUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let q = db
    .select()
    .from(kpiReportsTable)
    .where(eq(kpiReportsTable.userId, targetUserId))
    .$dynamic();

  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    q = q.where(
      and(
        eq(kpiReportsTable.userId, targetUserId),
        gte(kpiReportsTable.reportDate, start.toISOString().split("T")[0]),
        lte(kpiReportsTable.reportDate, end.toISOString().split("T")[0])
      )
    );
  }

  const reports = await q.orderBy(kpiReportsTable.reportDate);

  const totals = reports.reduce(
    (acc, r) => ({
      callsMade: acc.callsMade + r.callsMade,
      emailsSent: acc.emailsSent + r.emailsSent,
      meetingsBooked: acc.meetingsBooked + r.meetingsBooked,
      meetingsCompleted: acc.meetingsCompleted + r.meetingsCompleted,
      proposalsSent: acc.proposalsSent + r.proposalsSent,
      dealsWon: acc.dealsWon + r.dealsWon,
      revenue: acc.revenue + parseFloat(r.revenue || "0"),
    }),
    { callsMade: 0, emailsSent: 0, meetingsBooked: 0, meetingsCompleted: 0, proposalsSent: 0, dealsWon: 0, revenue: 0 }
  );

  res.json({
    user,
    reports,
    totals,
    period: month && year ? { month, year } : null,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
