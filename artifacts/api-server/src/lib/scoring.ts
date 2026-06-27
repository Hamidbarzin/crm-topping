import { db, leadsTable, companiesTable, activityLogsTable } from "@workspace/db";
import type { Lead } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logActivity } from "./activity";

const NODE_CONFLICT = "⚠️ Node conflict — verify CRM";

const SYSTEM_PROMPT = `You are the lead-scoring engine for the Shayan Marketing CRM at Topping Courier Inc. (GTA, Canada, same-day B2B delivery).
Score each B2B lead 0–100 based on conversion probability. Base score is 30, then apply:

POSITIVE:
- Source LinkedIn +15; Google Ads +10; SEO +12
- Status meeting_scheduled +25; meeting_done +30; proposal_sent +20; negotiating +28
- Email reply rate >= 50% +15; reply rate > 0% +8
- Deal value >= $5,000 +15; >= $1,000 +8
- Has phone +5; has LinkedIn +5
- GTA Node 3/4/5 (Shayan's territory) +5
- Industry Logistics/Warehouse/Manufacturing +8

NEGATIVE:
- No activity 30+ days -15; 14+ days -7; never any activity -10
- Status not_interested or closed_lost => cap score at 0–15
- No phone AND no LinkedIn -5
- GTA Node 1 or 2 (Arshia's territory) -10 and add a conflict warning

PRIORITY: 70–100 => HOT; 40–69 => WARM; 0–39 => COLD.

NODE CONFLICT: If node is 1 or 2, OR if source is Instagram/Facebook with node 1/2, append "⚠️ Node conflict — verify CRM" to reason.

Respond with ONLY this JSON, nothing else:
{"score": <integer 0-100>, "reason": "<max 10 words>", "priority": "HOT|WARM|COLD", "next_action": "<max 8 words, specific & actionable>", "source_missing": <true if source not provided else false>}`;

/**
 * Score a single lead with the AI engine and persist score, reason, priority and
 * next action. Shared by the manual `POST /leads/:id/score` route and the
 * auto-scoring automation. Throws on AI failure so callers can decide how to react.
 */
export async function scoreLeadById(leadId: number, actingUserId?: number | null): Promise<Lead> {
  const [existing] = await db
    .select({
      id: leadsTable.id, name: leadsTable.name, email: leadsTable.email,
      phone: leadsTable.phone, companyName: companiesTable.name,
      stage: leadsTable.stage, status: leadsTable.status, source: leadsTable.source,
      industry: leadsTable.industry, linkedinUrl: leadsTable.linkedinUrl,
      value: leadsTable.value, notes: leadsTable.notes, gtaNode: leadsTable.gtaNode,
      emailsSent: leadsTable.emailsSent, emailsReceived: leadsTable.emailsReceived,
      nextActionDate: leadsTable.nextActionDate, createdAt: leadsTable.createdAt,
    })
    .from(leadsTable)
    .leftJoin(companiesTable, eq(leadsTable.companyId, companiesTable.id))
    .where(eq(leadsTable.id, leadId));
  if (!existing) throw new Error(`Lead ${leadId} not found`);

  const [lastLog] = await db
    .select({ createdAt: activityLogsTable.createdAt })
    .from(activityLogsTable)
    .where(and(eq(activityLogsTable.entityType, "lead"), eq(activityLogsTable.entityId, existing.id)))
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(1);
  const lastActivity = lastLog?.createdAt ?? null;
  const daysSinceActivity = lastActivity
    ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86_400_000)
    : null;

  const sent = existing.emailsSent ?? 0;
  const received = existing.emailsReceived ?? 0;
  const leadContext = {
    company: existing.companyName ?? null,
    contactName: existing.name,
    source: existing.source ?? null,
    industry: existing.industry ?? null,
    status: existing.status,
    pipelineStage: existing.stage,
    dealValue: existing.value ? Number(existing.value) : null,
    emailsSent: sent,
    emailsReceived: received,
    replyRatePct: sent > 0 ? Math.round((received / sent) * 100) : 0,
    hasPhone: !!existing.phone,
    hasLinkedin: !!existing.linkedinUrl,
    gtaNode: existing.gtaNode ?? null,
    daysSinceLastActivity: daysSinceActivity,
    nextAction: existing.nextActionDate ?? null,
    notes: existing.notes ?? null,
  };

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    // gpt-5-mini is a reasoning model: leave generous room beyond hidden
    // reasoning tokens, otherwise content comes back empty.
    max_completion_tokens: 3000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Score this lead:\n${JSON.stringify(leadContext, null, 2)}` },
    ],
  });
  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error(`Empty AI response (finish_reason: ${response.choices[0]?.finish_reason})`);
  }
  const parsed = JSON.parse(raw) as {
    score?: number; reason?: string; priority?: string; next_action?: string;
  };
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
  if (!Number.isFinite(score)) {
    throw new Error("AI returned a non-numeric score");
  }
  let reason = typeof parsed.reason === "string" ? parsed.reason : null;
  // Spec hard-rule: node 1/2 is Arshia's territory — always flag the conflict,
  // regardless of whether the model remembered to add it.
  if ((existing.gtaNode === 1 || existing.gtaNode === 2) && !(reason ?? "").includes(NODE_CONFLICT)) {
    reason = reason ? `${reason}; ${NODE_CONFLICT}` : NODE_CONFLICT;
  }
  const priorityRaw = String(parsed.priority ?? "").toUpperCase();
  const priority = ["HOT", "WARM", "COLD"].includes(priorityRaw)
    ? priorityRaw
    : score >= 70 ? "HOT" : score >= 40 ? "WARM" : "COLD";
  const aiNextAction = typeof parsed.next_action === "string" ? parsed.next_action : null;

  const [lead] = await db
    .update(leadsTable)
    .set({ aiScore: score, scoreReason: reason, priority, aiNextAction })
    .where(eq(leadsTable.id, existing.id))
    .returning();
  await logActivity({
    entityType: "lead", entityId: lead.id, action: "scored",
    description: `AI scored lead "${lead.name}" at ${score} (${priority})`,
    userId: actingUserId ?? null, metadata: { score, priority },
  });
  return lead;
}
