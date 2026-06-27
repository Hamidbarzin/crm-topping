import { Router } from "express";
import { db, userGoalsTable, usersTable, kpiReportsTable } from "@workspace/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
const isManager = (role: string) => MANAGER_ROLES.includes(role);

router.get("/goals/progress", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const now = new Date();
  const month = Number(req.query.month) || now.getMonth() + 1;
  const year = Number(req.query.year) || now.getFullYear();
  const periodStart = new Date(year, month - 1, 1).toISOString().split("T")[0];
  const periodEnd = new Date(year, month, 0).toISOString().split("T")[0];

  const actualsRows = await db
    .select({
      userId: kpiReportsTable.userId,
      revenue: sql<number>`coalesce(sum(${kpiReportsTable.revenue}::numeric), 0)::float`,
      dealsWon: sql<number>`coalesce(sum(${kpiReportsTable.dealsWon}), 0)::int`,
      meetingsBooked: sql<number>`coalesce(sum(${kpiReportsTable.meetingsBooked}), 0)::int`,
      callsMade: sql<number>`coalesce(sum(${kpiReportsTable.callsMade}), 0)::int`,
    })
    .from(kpiReportsTable)
    .where(and(gte(kpiReportsTable.reportDate, periodStart), lte(kpiReportsTable.reportDate, periodEnd)))
    .groupBy(kpiReportsTable.userId);

  const goalRows = await db.select().from(userGoalsTable).where(and(eq(userGoalsTable.month, month), eq(userGoalsTable.year, year)));
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role, isActive: usersTable.isActive })
    .from(usersTable);

  const manager = isManager(role);
  const scopedUsers = manager ? users.filter((u) => u.isActive !== false) : users.filter((u) => u.id === userId);

  const rows = scopedUsers.map((u) => {
    const g = goalRows.find((x) => x.userId === u.id);
    const a = actualsRows.find((x) => x.userId === u.id);
    return {
      userId: u.id,
      userName: u.name,
      role: u.role,
      goal: g
        ? {
            targetRevenue: Number(g.targetRevenue),
            targetDealsWon: g.targetDealsWon,
            targetMeetingsBooked: g.targetMeetingsBooked,
            targetCallsMade: g.targetCallsMade,
          }
        : null,
      actual: {
        revenue: a?.revenue || 0,
        dealsWon: a?.dealsWon || 0,
        meetingsBooked: a?.meetingsBooked || 0,
        callsMade: a?.callsMade || 0,
      },
    };
  });

  res.json({ month, year, scope: manager ? "team" : "personal", rows });
});

router.put("/goals", requireAuth, async (req, res) => {
  const { role } = req.user!;
  if (!isManager(role)) {
    res.status(403).json({ error: "Only managers can set goals" });
    return;
  }
  const { userId, month, year, targetRevenue, targetDealsWon, targetMeetingsBooked, targetCallsMade } = req.body;
  if (!userId || !month || !year) {
    res.status(400).json({ error: "userId, month and year are required" });
    return;
  }
  const [goal] = await db
    .insert(userGoalsTable)
    .values({
      userId,
      month,
      year,
      targetRevenue: (targetRevenue ?? 0).toString(),
      targetDealsWon: targetDealsWon ?? 0,
      targetMeetingsBooked: targetMeetingsBooked ?? 0,
      targetCallsMade: targetCallsMade ?? 0,
    })
    .onConflictDoUpdate({
      target: [userGoalsTable.userId, userGoalsTable.month, userGoalsTable.year],
      set: {
        targetRevenue: (targetRevenue ?? 0).toString(),
        targetDealsWon: targetDealsWon ?? 0,
        targetMeetingsBooked: targetMeetingsBooked ?? 0,
        targetCallsMade: targetCallsMade ?? 0,
      },
    })
    .returning();
  res.json(goal);
});

export default router;
