import { Router } from "express";
import { db } from "@workspace/db";
import { kpiReportsTable, usersTable, meetingsTable, dealsTable, meetingAttendeesTable } from "@workspace/db";
import { eq, or, sql, type SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
function isManager(role: string) {
  return MANAGER_ROLES.includes(role);
}

router.get("/kpi/dashboard", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const manager = isManager(role);

  // Non-managers only see their own activity: meetings they own or attend,
  // and deals where they are the sales rep or closer.
  const meetingScope: SQL | undefined = manager
    ? undefined
    : or(
        eq(meetingsTable.ownerId, userId),
        sql`${meetingsTable.id} in (select ${meetingAttendeesTable.meetingId} from ${meetingAttendeesTable} where ${meetingAttendeesTable.userId} = ${userId})`,
      );
  const dealScope: SQL | undefined = manager
    ? undefined
    : or(eq(dealsTable.salesRepId, userId), eq(dealsTable.closerId, userId));

  const [meetingStats] = await db
    .select({
      booked: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${meetingsTable.status} = 'completed')::int`,
      noShow: sql<number>`count(*) filter (where ${meetingsTable.status} = 'no_show')::int`,
      followUp: sql<number>`count(*) filter (where ${meetingsTable.status} = 'follow_up')::int`,
      proposalSent: sql<number>`count(*) filter (where ${meetingsTable.outcome} = 'proposal_sent')::int`,
    })
    .from(meetingsTable)
    .where(meetingScope);
  const [dealStats] = await db
    .select({
      won: sql<number>`count(*) filter (where ${dealsTable.stage} = 'closed_won')::int`,
      total: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${dealsTable.value}::numeric) filter (where ${dealsTable.stage} = 'closed_won'), 0)::float`,
    })
    .from(dealsTable)
    .where(dealScope);
  const closeRate = dealStats.total > 0 ? (dealStats.won / dealStats.total) * 100 : 0;
  const noShowRate = (meetingStats.booked || 0) > 0 ? ((meetingStats.noShow || 0) / (meetingStats.booked || 1)) * 100 : 0;

  // The team leaderboard is manager-only; non-managers never see other people's numbers.
  const topUsers = manager
    ? await db
        .select({
          userId: kpiReportsTable.userId, userName: usersTable.name,
          meetingsBooked: sql<number>`coalesce(sum(${kpiReportsTable.meetingsBooked}), 0)::int`,
          meetingsCompleted: sql<number>`coalesce(sum(${kpiReportsTable.meetingsCompleted}), 0)::int`,
          dealsWon: sql<number>`coalesce(sum(${kpiReportsTable.dealsWon}), 0)::int`,
          proposalsSent: sql<number>`coalesce(sum(${kpiReportsTable.proposalsSent}), 0)::int`,
          revenue: sql<number>`coalesce(sum(${kpiReportsTable.revenue}::numeric), 0)::float`,
        })
        .from(kpiReportsTable)
        .leftJoin(usersTable, eq(kpiReportsTable.userId, usersTable.id))
        .groupBy(kpiReportsTable.userId, usersTable.name)
        .orderBy(sql`sum(${kpiReportsTable.revenue}::numeric) desc`)
        .limit(5)
    : [];
  res.json({
    scope: manager ? "team" : "personal",
    totalMeetingsBooked: meetingStats.booked || 0,
    totalMeetingsCompleted: meetingStats.completed || 0,
    totalFollowUpsCompleted: meetingStats.followUp || 0,
    totalDealsWon: dealStats.won || 0,
    totalProposalsSent: meetingStats.proposalSent || 0,
    closeRate: Math.round(closeRate * 10) / 10,
    noShowRate: Math.round(noShowRate * 10) / 10,
    totalRevenue: dealStats.revenue || 0,
    topPerformers: topUsers.map(u => ({
      ...u, followUpsCompleted: 0, closeRate: 0, noShowRate: 0,
    })),
  });
});

router.get("/kpi/user/:userId", requireAuth, async (req, res) => {
  const userId = Number(req.params.userId);
  // Non-managers may only look up their own KPI; managers may look up anyone.
  if (!isManager(req.user!.role) && userId !== req.user!.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const [stats] = await db
    .select({
      meetingsBooked: sql<number>`coalesce(sum(${kpiReportsTable.meetingsBooked}), 0)::int`,
      meetingsCompleted: sql<number>`coalesce(sum(${kpiReportsTable.meetingsCompleted}), 0)::int`,
      dealsWon: sql<number>`coalesce(sum(${kpiReportsTable.dealsWon}), 0)::int`,
      proposalsSent: sql<number>`coalesce(sum(${kpiReportsTable.proposalsSent}), 0)::int`,
      revenue: sql<number>`coalesce(sum(${kpiReportsTable.revenue}::numeric), 0)::float`,
    })
    .from(kpiReportsTable)
    .where(eq(kpiReportsTable.userId, userId));
  res.json({
    userId, userName: user.name, ...stats,
    followUpsCompleted: 0, closeRate: 0, noShowRate: 0,
  });
});

router.get("/kpi/reports", requireAuth, async (req, res) => {
  // Managers see every report; everyone else sees only their own.
  const scope = isManager(req.user!.role)
    ? undefined
    : eq(kpiReportsTable.userId, req.user!.userId);
  const reports = await db
    .select({
      id: kpiReportsTable.id, userId: kpiReportsTable.userId, userName: usersTable.name,
      reportDate: kpiReportsTable.reportDate, callsMade: kpiReportsTable.callsMade,
      emailsSent: kpiReportsTable.emailsSent, meetingsBooked: kpiReportsTable.meetingsBooked,
      meetingsCompleted: kpiReportsTable.meetingsCompleted, proposalsSent: kpiReportsTable.proposalsSent,
      dealsWon: kpiReportsTable.dealsWon, revenue: kpiReportsTable.revenue,
      notes: kpiReportsTable.notes, createdAt: kpiReportsTable.createdAt,
    })
    .from(kpiReportsTable)
    .leftJoin(usersTable, eq(kpiReportsTable.userId, usersTable.id))
    .where(scope)
    .orderBy(kpiReportsTable.reportDate);
  res.json(reports);
});

router.post("/kpi/reports", requireAuth, async (req, res) => {
  const { reportDate, callsMade, emailsSent, meetingsBooked, meetingsCompleted,
    proposalsSent, dealsWon, revenue, notes } = req.body;
  const [report] = await db.insert(kpiReportsTable).values({
    userId: req.user!.userId,
    reportDate: reportDate,
    callsMade: callsMade || 0, emailsSent: emailsSent || 0,
    meetingsBooked: meetingsBooked || 0, meetingsCompleted: meetingsCompleted || 0,
    proposalsSent: proposalsSent || 0, dealsWon: dealsWon || 0,
    revenue: revenue?.toString() || "0", notes,
  }).returning();
  res.status(201).json(report);
});

export default router;
