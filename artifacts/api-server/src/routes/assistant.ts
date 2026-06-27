import { Router } from "express";
import { db } from "@workspace/db";
import {
  leadsTable, dealsTable, clientsTable, meetingsTable, kpiReportsTable,
  meetingAttendeesTable, usersTable,
} from "@workspace/db";
import { eq, or, sql, type SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
function isManager(role: string) {
  return MANAGER_ROLES.includes(role);
}

router.post("/assistant/ask", requireAuth, async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    res.status(400).json({ error: "A question is required" });
    return;
  }
  if (question.length > 2000) {
    res.status(400).json({ error: "Question is too long (max 2000 characters)" });
    return;
  }

  const { userId, role } = req.user!;
  const manager = isManager(role);

  // All aggregates are scoped by role: managers see the whole company, everyone
  // else sees only the records they own / are attached to (read-only).
  const leadScope: SQL | undefined = manager ? undefined : eq(leadsTable.ownerId, userId);
  const clientScope: SQL | undefined = manager ? undefined : eq(clientsTable.ownerId, userId);
  const dealScope: SQL | undefined = manager
    ? undefined
    : or(eq(dealsTable.salesRepId, userId), eq(dealsTable.closerId, userId));
  const meetingScope: SQL | undefined = manager
    ? undefined
    : or(
        eq(meetingsTable.ownerId, userId),
        sql`${meetingsTable.id} in (select ${meetingAttendeesTable.meetingId} from ${meetingAttendeesTable} where ${meetingAttendeesTable.userId} = ${userId})`,
      );
  const kpiScope: SQL | undefined = manager ? undefined : eq(kpiReportsTable.userId, userId);

  const [leadStats, clientStats, dealStats, meetingStats, kpiStats, [me]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        won: sql<number>`count(*) filter (where ${leadsTable.stage} = 'closed_won')::int`,
        open: sql<number>`count(*) filter (where ${leadsTable.stage} not in ('closed_won','closed_lost'))::int`,
        pipelineValue: sql<number>`coalesce(sum(${leadsTable.value}::numeric) filter (where ${leadsTable.stage} not in ('closed_won','closed_lost')), 0)::float`,
      })
      .from(leadsTable)
      .where(leadScope),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${clientsTable.status} = 'active')::int`,
        monthlyRevenue: sql<number>`coalesce(sum(${clientsTable.monthlyRevenue}::numeric) filter (where ${clientsTable.status} = 'active'), 0)::float`,
      })
      .from(clientsTable)
      .where(clientScope),
    db
      .select({
        total: sql<number>`count(*)::int`,
        won: sql<number>`count(*) filter (where ${dealsTable.stage} = 'closed_won')::int`,
        lost: sql<number>`count(*) filter (where ${dealsTable.stage} = 'closed_lost')::int`,
        openValue: sql<number>`coalesce(sum(${dealsTable.value}::numeric) filter (where ${dealsTable.stage} not in ('closed_won','closed_lost')), 0)::float`,
        wonRevenue: sql<number>`coalesce(sum(${dealsTable.value}::numeric) filter (where ${dealsTable.stage} = 'closed_won'), 0)::float`,
      })
      .from(dealsTable)
      .where(dealScope),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${meetingsTable.status} = 'completed')::int`,
        noShow: sql<number>`count(*) filter (where ${meetingsTable.status} = 'no_show')::int`,
      })
      .from(meetingsTable)
      .where(meetingScope),
    db
      .select({
        callsMade: sql<number>`coalesce(sum(${kpiReportsTable.callsMade}), 0)::int`,
        emailsSent: sql<number>`coalesce(sum(${kpiReportsTable.emailsSent}), 0)::int`,
        meetingsBooked: sql<number>`coalesce(sum(${kpiReportsTable.meetingsBooked}), 0)::int`,
        dealsWon: sql<number>`coalesce(sum(${kpiReportsTable.dealsWon}), 0)::int`,
        revenue: sql<number>`coalesce(sum(${kpiReportsTable.revenue}::numeric), 0)::float`,
      })
      .from(kpiReportsTable)
      .where(kpiScope),
    db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)),
  ]);

  const scope = manager ? "team" : "personal";
  const context = {
    viewer: { name: me?.name ?? "User", role, scope: manager ? "company-wide" : "own records only" },
    leads: leadStats[0],
    clients: clientStats[0],
    deals: dealStats[0],
    meetings: meetingStats[0],
    kpiTotals: kpiStats[0],
  };

  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = `You are the AI assistant inside Topping CRM, a CRM for Topping Courier Inc. (a same-day delivery company in Toronto).
You help the logged-in user understand their data and do calculations.

Rules:
- Today's date is ${today}. All money values are in USD.
- Only use the data provided in CONTEXT. Never invent records, names, or numbers.
- The CONTEXT is already filtered to what this user is allowed to see (${context.viewer.scope}). Do not claim to know about other people's data if scope is "own records only".
- If the question cannot be answered from CONTEXT, say so plainly and suggest what data would be needed.
- Be concise and practical. Show the math when you calculate. Reply in the same language the user asked in (Persian/Finglish or English).

CONTEXT (JSON):
${JSON.stringify(context, null, 2)}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      // gpt-5-mini is a reasoning model: leave generous room beyond hidden reasoning
      // tokens, otherwise finish_reason is "length" and content comes back empty.
      max_completion_tokens: 3000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    });
    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) {
      throw new Error(`Empty AI response (finish_reason: ${response.choices[0]?.finish_reason})`);
    }
    res.json({ answer, scope });
  } catch (err) {
    req.log.error({ err }, "AI assistant request failed");
    res.status(502).json({ error: "The assistant is temporarily unavailable. Please try again." });
  }
});

export default router;
