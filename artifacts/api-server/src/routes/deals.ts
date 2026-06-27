import { Router } from "express";
import { db } from "@workspace/db";
import { dealsTable, clientsTable, companiesTable, usersTable, tasksTable } from "@workspace/db";
import { eq, sql, or, inArray } from "drizzle-orm";
import { requireAuth, isAdmin } from "../middlewares/auth";
import { logActivity } from "../lib/activity";
import { sendEmail } from "../lib/mail";

const router = Router();

const salesRep = usersTable;

// Automation: the right next step to create when a deal enters each stage.
const STAGE_NEXT_ACTION: Record<string, { action: string; priority: "low" | "medium" | "high" }> = {
  prospecting: { action: "Qualify the deal — confirm budget, authority, need and timeline", priority: "medium" },
  qualification: { action: "Prepare and send a tailored proposal", priority: "high" },
  proposal: { action: "Follow up on the proposal and address objections", priority: "high" },
  negotiation: { action: "Finalize terms and push for signature", priority: "high" },
  closed_won: { action: "Kick off onboarding and confirm the first delivery", priority: "medium" },
  closed_lost: { action: "Log the loss reason and schedule a re-engagement in 90 days", priority: "low" },
};

// ── Access-control helpers ──────────────────────────────────────────
// Read visibility: CEO/Admin and the Marketing_Manager (observer) see every
// deal. Everyone else is scoped to deals they own. Write/delete stay
// admin-or-owner — Marketing_Manager is read-only on deals.
function canViewAllDeals(role: string): boolean {
  return isAdmin(role) || role === "Marketing_Manager";
}

// The Marketing_Manager is an observer: they may see deal status/pipeline but
// NOT full financials (value, margin, commission, clawback, founder approval).
function isMarketingManager(role: string): boolean {
  return role === "Marketing_Manager";
}

// Strip financial detail from a deal row for the Marketing_Manager view.
function redactDealFinancials<T extends Record<string, unknown>>(deal: T): T {
  return {
    ...deal,
    value: null,
    grossMarginPercent: null,
    commissionStatus: null,
    clawbackStatus: null,
    founderApproval: null,
    founderApprovalStatus: null,
  };
}

// Non-admins may only see/touch deals where they are the sales rep,
// closer, or original creator. CEO/Admin see everything.
function ownershipFilter(userId: number) {
  return or(
    eq(dealsTable.salesRepId, userId),
    eq(dealsTable.closerId, userId),
    eq(dealsTable.createdById, userId),
  );
}

type DealRow = typeof dealsTable.$inferSelect;

function userOwnsDeal(deal: DealRow, userId: number): boolean {
  return [deal.salesRepId, deal.closerId, deal.createdById].includes(userId);
}

// A deal needs founder sign-off when the margin is thin (<35%) or the
// value is large (>=$10k). Missing data does not trigger the gate.
function resolveFounderMeta(value: number | null, grossMarginPercent: number | null) {
  const needsApproval =
    (grossMarginPercent !== null && grossMarginPercent < 35) ||
    (value !== null && value >= 10000);
  return needsApproval
    ? { founderApprovalStatus: "pending" as const, founderApproval: false }
    : { founderApprovalStatus: "not_required" as const, founderApproval: true };
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Pipeline summary (ownership-scoped for non-admins) ──────────────
router.get("/deals/pipeline", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const where = canViewAllDeals(role) ? undefined : ownershipFilter(userId);
  const rows = await db
    .select({
      stage: dealsTable.stage,
      count: sql<number>`count(*)::int`,
      value: sql<number>`coalesce(sum(${dealsTable.value}::numeric), 0)::float`,
    })
    .from(dealsTable)
    .where(where)
    .groupBy(dealsTable.stage);
  const totalValue = rows.reduce((acc, r) => acc + (r.value || 0), 0);
  const totalDeals = rows.reduce((acc, r) => acc + r.count, 0);
  res.json({ stages: rows, totalValue, totalDeals });
});

// ── Admin queues (must be declared before /deals/:id) ───────────────
router.get("/deals/pending-submissions", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) { res.status(403).json({ error: "Only CEO/Admin can view pending submissions" }); return; }
  const rows = await db
    .select({
      id: dealsTable.id, title: dealsTable.title, stage: dealsTable.stage,
      value: dealsTable.value, salesRepId: dealsTable.salesRepId,
      salesRepName: salesRep.name, submittedAt: dealsTable.submittedAt,
      submittedById: dealsTable.submittedById, submissionStatus: dealsTable.submissionStatus,
    })
    .from(dealsTable)
    .leftJoin(salesRep, eq(dealsTable.salesRepId, salesRep.id))
    .where(eq(dealsTable.submissionStatus, "submitted"))
    .orderBy(dealsTable.submittedAt);
  res.json(rows);
});

router.get("/deals/founder-approvals", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) { res.status(403).json({ error: "Only CEO/Admin can view the approval queue" }); return; }
  const rows = await db
    .select({
      id: dealsTable.id, title: dealsTable.title, stage: dealsTable.stage,
      value: dealsTable.value, grossMarginPercent: dealsTable.grossMarginPercent,
      salesRepId: dealsTable.salesRepId, salesRepName: salesRep.name,
      founderApprovalStatus: dealsTable.founderApprovalStatus,
      createdAt: dealsTable.createdAt,
    })
    .from(dealsTable)
    .leftJoin(salesRep, eq(dealsTable.salesRepId, salesRep.id))
    .where(eq(dealsTable.founderApprovalStatus, "pending"))
    .orderBy(dealsTable.createdAt);
  res.json(rows);
});

// ── List deals (ownership-scoped for non-admins) ────────────────────
router.get("/deals", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const where = canViewAllDeals(role) ? undefined : ownershipFilter(userId);
  const deals = await db
    .select({
      id: dealsTable.id, title: dealsTable.title, stage: dealsTable.stage,
      value: dealsTable.value, clientId: dealsTable.clientId,
      clientName: clientsTable.name, companyId: dealsTable.companyId,
      companyName: companiesTable.name, salesRepId: dealsTable.salesRepId,
      salesRepName: salesRep.name, closerId: dealsTable.closerId,
      createdById: dealsTable.createdById,
      commissionStatus: dealsTable.commissionStatus, clawbackStatus: dealsTable.clawbackStatus,
      grossMarginPercent: dealsTable.grossMarginPercent,
      submissionStatus: dealsTable.submissionStatus,
      submittedAt: dealsTable.submittedAt, reviewedAt: dealsTable.reviewedAt,
      reviewNotes: dealsTable.reviewNotes,
      founderApprovalStatus: dealsTable.founderApprovalStatus,
      founderApproval: dealsTable.founderApproval,
      expectedCloseDate: dealsTable.expectedCloseDate, closedAt: dealsTable.closedAt,
      notes: dealsTable.notes, createdAt: dealsTable.createdAt,
    })
    .from(dealsTable)
    .leftJoin(clientsTable, eq(dealsTable.clientId, clientsTable.id))
    .leftJoin(companiesTable, eq(dealsTable.companyId, companiesTable.id))
    .leftJoin(salesRep, eq(dealsTable.salesRepId, salesRep.id))
    .where(where)
    .orderBy(dealsTable.createdAt);
  const withCloser = deals.map(d => ({ ...d, closerName: null }));
  res.json(isMarketingManager(role) ? withCloser.map(redactDealFinancials) : withCloser);
});

router.post("/deals", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  // Marketing_Manager is read-only on deals (observer); they cannot create.
  if (isMarketingManager(role)) {
    res.status(403).json({ error: "Marketing Manager has read-only access to deals" }); return;
  }
  const { title, stage, value, clientId, companyId, salesRepId, closerId, grossMarginPercent, expectedCloseDate, notes } = req.body;
  const founderMeta = resolveFounderMeta(toNum(value), toNum(grossMarginPercent));
  const [deal] = await db.insert(dealsTable).values({
    title, stage: stage || "prospecting",
    value: value?.toString(), clientId, companyId,
    salesRepId: salesRepId ?? userId, closerId,
    createdById: userId,
    grossMarginPercent: grossMarginPercent !== undefined && grossMarginPercent !== null ? grossMarginPercent.toString() : undefined,
    expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
    notes,
    ...founderMeta,
  }).returning();
  await logActivity({ entityType: "deal", entityId: deal.id, action: "created", description: `Deal "${deal.title}" created`, userId });
  if (deal.clientId) {
    await logActivity({ entityType: "client", entityId: deal.clientId, action: "deal_created", description: `Deal "${deal.title}" created`, userId, metadata: { dealId: deal.id } });
  }
  res.status(201).json(deal);
});

router.get("/deals/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, Number(req.params.id)));
  if (!deal) { res.status(404).json({ error: "Not found" }); return; }
  if (!canViewAllDeals(role) && !userOwnsDeal(deal, userId)) {
    res.status(403).json({ error: "You do not have access to this deal" }); return;
  }
  res.json(isMarketingManager(role) && !userOwnsDeal(deal, userId) ? redactDealFinancials(deal) : deal);
});

router.patch("/deals/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const [existing] = await db.select().from(dealsTable).where(eq(dealsTable.id, Number(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!isAdmin(role) && !userOwnsDeal(existing, userId)) {
    res.status(403).json({ error: "You do not have access to this deal" }); return;
  }
  // Once submitted or approved, the deal is locked for editing until reviewed/rejected.
  if (!isAdmin(role) && (existing.submissionStatus === "submitted" || existing.submissionStatus === "approved")) {
    res.status(400).json({ error: "Cannot edit while submitted or approved. Wait for manager review or rejection." });
    return;
  }
  const { title, stage, value, clientId, companyId, salesRepId, closerId,
    commissionStatus, clawbackStatus, grossMarginPercent, expectedCloseDate, closedAt, notes } = req.body;
  const updates: Partial<typeof dealsTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (stage !== undefined) updates.stage = stage;
  if (value !== undefined) updates.value = value?.toString();
  if (clientId !== undefined) updates.clientId = clientId;
  if (companyId !== undefined) updates.companyId = companyId;
  if (salesRepId !== undefined) updates.salesRepId = salesRepId;
  if (closerId !== undefined) updates.closerId = closerId;
  // Clawback is a sensitive financial action — admin-only via PATCH /deals/:id/clawback.
  if (commissionStatus !== undefined && isAdmin(role)) updates.commissionStatus = commissionStatus;
  if (clawbackStatus !== undefined && isAdmin(role)) updates.clawbackStatus = clawbackStatus;
  if (grossMarginPercent !== undefined) updates.grossMarginPercent = grossMarginPercent !== null ? grossMarginPercent.toString() : null;
  if (expectedCloseDate !== undefined) updates.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
  if (closedAt !== undefined) updates.closedAt = closedAt ? new Date(closedAt) : null;
  if (notes !== undefined) updates.notes = notes;
  // Recompute the founder gate when value or margin changes.
  if (value !== undefined || grossMarginPercent !== undefined) {
    const newValue = value !== undefined ? toNum(value) : toNum(existing.value);
    const newMargin = grossMarginPercent !== undefined ? toNum(grossMarginPercent) : toNum(existing.grossMarginPercent);
    Object.assign(updates, resolveFounderMeta(newValue, newMargin));
  }
  const [deal] = await db.update(dealsTable).set(updates).where(eq(dealsTable.id, existing.id)).returning();
  if (updates.stage && updates.stage !== existing.stage) {
    await logActivity({ entityType: "deal", entityId: deal.id, action: "stage_changed", description: `Deal stage changed from "${existing.stage}" to "${updates.stage}"`, userId, metadata: { from: existing.stage, to: updates.stage } });
    if (deal.clientId) {
      await logActivity({ entityType: "client", entityId: deal.clientId, action: "deal_stage_changed", description: `Deal "${deal.title}" moved from "${existing.stage}" to "${updates.stage}"`, userId, metadata: { dealId: deal.id, from: existing.stage, to: updates.stage } });
    }
    // Automation: auto-create the appropriate next-step task for the deal owner.
    const next = STAGE_NEXT_ACTION[updates.stage];
    if (next) {
      const dueDate = new Date(Date.now() + 2 * 86_400_000);
      const [task] = await db.insert(tasksTable).values({
        title: `${next.action} — ${deal.title}`,
        description: `Auto-created when deal "${deal.title}" moved to "${updates.stage}".`,
        priority: next.priority,
        status: "pending",
        dueDate,
        assigneeId: deal.salesRepId ?? deal.closerId ?? userId,
        dealId: deal.id,
      }).returning();
      await logActivity({ entityType: "deal", entityId: deal.id, action: "stage_task_created", description: `Auto-created next-step task for stage "${updates.stage}"`, userId, metadata: { taskId: task.id } });
    }
  } else {
    await logActivity({ entityType: "deal", entityId: deal.id, action: "updated", description: `Deal "${deal.title}" updated`, userId });
  }
  res.json(deal);
});

// ── Sensitive action: delete (admin only) ───────────────────────────
router.delete("/deals/:id", requireAuth, async (req, res) => {
  if (!isAdmin(req.user!.role)) { res.status(403).json({ error: "Only CEO/Admin can delete deals" }); return; }
  await db.delete(dealsTable).where(eq(dealsTable.id, Number(req.params.id)));
  res.status(204).send();
});

// ── Submit for review (owner) ───────────────────────────────────────
router.post("/deals/:id/submit", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, Number(req.params.id)));
  if (!deal) { res.status(404).json({ error: "Not found" }); return; }
  if (!isAdmin(role) && !userOwnsDeal(deal, userId)) {
    res.status(403).json({ error: "You do not have access to this deal" }); return;
  }
  if (deal.submissionStatus !== "draft" && deal.submissionStatus !== "rejected") {
    res.status(400).json({ error: `Deal is already ${deal.submissionStatus} — cannot re-submit` }); return;
  }
  const [updated] = await db.update(dealsTable)
    .set({ submissionStatus: "submitted", submittedAt: new Date(), submittedById: userId, reviewNotes: null })
    .where(eq(dealsTable.id, deal.id)).returning();
  await logActivity({ entityType: "deal", entityId: deal.id, action: "submitted", description: `Deal "${deal.title}" submitted for review`, userId });

  // Notify all admins by email (best-effort).
  void (async () => {
    try {
      const admins = await db.select({ email: usersTable.email }).from(usersTable)
        .where(inArray(usersTable.role, ["CEO", "Admin"]));
      const [submitter] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
      for (const a of admins) {
        await sendEmail({
          to: a.email,
          subject: `🔔 Deal submitted for review — ${deal.title}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 8px">Deal awaiting your review</h2>
            <p style="color:#555">${submitter?.name ?? "A team member"} submitted <strong>${deal.title}</strong> for approval.</p>
            <p style="color:#555">Value: $${deal.value ?? "—"} · Stage: ${deal.stage}</p>
            <p style="color:#888;font-size:13px">Open the Approvals page in Topping CRM to approve or reject.</p>
          </div>`,
        });
      }
    } catch (err) {
      req.log.error({ err }, "Failed to email admins about deal submission");
    }
  })();

  res.json(updated);
});

// ── Review a submission (admin) ─────────────────────────────────────
router.patch("/deals/:id/review", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (!isAdmin(role)) { res.status(403).json({ error: "Only CEO/Admin can review submissions" }); return; }
  const { approved, notes } = req.body;
  if (typeof approved !== "boolean") { res.status(400).json({ error: "`approved` (boolean) is required" }); return; }
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, Number(req.params.id)));
  if (!deal) { res.status(404).json({ error: "Not found" }); return; }
  if (deal.submissionStatus !== "submitted") { res.status(400).json({ error: "Deal is not in submitted state" }); return; }
  const [updated] = await db.update(dealsTable)
    .set({
      submissionStatus: approved ? "approved" : "rejected",
      reviewedById: userId, reviewedAt: new Date(),
      reviewNotes: notes ?? null,
      ...(approved ? { commissionStatus: "approved" as const } : {}),
    })
    .where(eq(dealsTable.id, deal.id)).returning();
  await logActivity({ entityType: "deal", entityId: deal.id, action: approved ? "approved" : "rejected", description: `Deal "${deal.title}" ${approved ? "approved" : "rejected"}`, userId });
  res.json(updated);
});

// ── Set founder approval (admin) ────────────────────────────────────
router.patch("/deals/:id/founder-approval", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (!isAdmin(role)) { res.status(403).json({ error: "Only CEO/Admin can set founder approval" }); return; }
  const { approved } = req.body;
  if (typeof approved !== "boolean") { res.status(400).json({ error: "`approved` (boolean) is required" }); return; }
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, Number(req.params.id)));
  if (!deal) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(dealsTable)
    .set({
      founderApproval: approved,
      founderApprovalStatus: approved ? "approved" : "rejected",
      founderApprovedById: userId, founderApprovedAt: new Date(),
    })
    .where(eq(dealsTable.id, deal.id)).returning();
  await logActivity({ entityType: "deal", entityId: deal.id, action: "founder_approval", description: `Founder approval ${approved ? "granted" : "rejected"} for "${deal.title}"`, userId });
  res.json(updated);
});

// ── Apply a clawback (admin) ────────────────────────────────────────
router.patch("/deals/:id/clawback", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  if (!isAdmin(role)) { res.status(403).json({ error: "Only CEO/Admin can apply clawbacks" }); return; }
  const { reason } = req.body;
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, Number(req.params.id)));
  if (!deal) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(dealsTable)
    .set({ commissionStatus: "clawback", clawbackStatus: reason ? `applied: ${reason}` : "applied" })
    .where(eq(dealsTable.id, deal.id)).returning();
  await logActivity({ entityType: "deal", entityId: deal.id, action: "clawback", description: `Clawback applied to "${deal.title}"${reason ? ` — ${reason}` : ""}`, userId });
  res.json(updated);
});

export default router;
