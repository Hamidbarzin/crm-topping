import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, companiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, isAdmin } from "../middlewares/auth";
import { logActivity } from "../lib/activity";

const router = Router();

// Only CEO/Admin manage the whole customer book. Everyone else — including the
// Marketing_Manager observer — is scoped to customers they personally own.
function canManageAllClients(role: string) {
  return isAdmin(role);
}

router.get("/clients", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const query = db
    .select({
      id: clientsTable.id, name: clientsTable.name, email: clientsTable.email,
      phone: clientsTable.phone, companyId: clientsTable.companyId,
      companyName: companiesTable.name, status: clientsTable.status,
      monthlyRevenue: clientsTable.monthlyRevenue, notes: clientsTable.notes,
      ownerId: clientsTable.ownerId, createdAt: clientsTable.createdAt,
    })
    .from(clientsTable)
    .leftJoin(companiesTable, eq(clientsTable.companyId, companiesTable.id));
  const clients = canManageAllClients(role)
    ? await query.orderBy(clientsTable.name)
    : await query.where(eq(clientsTable.ownerId, userId)).orderBy(clientsTable.name);
  res.json(clients);
});

router.post("/clients", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const { name, email, phone, companyId, status, monthlyRevenue, notes, ownerId } = req.body;
  // Non-managers always own what they create; managers may assign an owner,
  // defaulting to themselves so the record is never orphaned/invisible.
  const resolvedOwnerId = canManageAllClients(role) ? (ownerId ?? userId) : userId;
  const [client] = await db.insert(clientsTable).values({
    name, email, phone, companyId, status: status || "prospect",
    monthlyRevenue: monthlyRevenue?.toString(), notes, ownerId: resolvedOwnerId
  }).returning();
  await logActivity({ entityType: "client", entityId: client.id, action: "created", description: `Client "${client.name}" created`, userId });
  res.status(201).json(client);
});

router.get("/clients/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const [client] = await db
    .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email,
      phone: clientsTable.phone, companyId: clientsTable.companyId,
      companyName: companiesTable.name, status: clientsTable.status,
      monthlyRevenue: clientsTable.monthlyRevenue, notes: clientsTable.notes,
      ownerId: clientsTable.ownerId, createdAt: clientsTable.createdAt,
    })
    .from(clientsTable)
    .leftJoin(companiesTable, eq(clientsTable.companyId, companiesTable.id))
    .where(eq(clientsTable.id, Number(req.params.id)));
  if (!client) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageAllClients(role) && client.ownerId !== userId) {
    res.status(403).json({ error: "You do not have access to this customer" }); return;
  }
  res.json(client);
});

router.patch("/clients/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.id, Number(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageAllClients(role) && existing.ownerId !== userId) {
    res.status(403).json({ error: "You do not have access to this customer" }); return;
  }
  const { name, email, phone, companyId, status, monthlyRevenue, notes, ownerId } = req.body;
  const updates: Partial<typeof clientsTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (companyId !== undefined) updates.companyId = companyId;
  if (status !== undefined) updates.status = status;
  if (monthlyRevenue !== undefined) updates.monthlyRevenue = monthlyRevenue?.toString();
  if (notes !== undefined) updates.notes = notes;
  if (ownerId !== undefined) updates.ownerId = ownerId;
  const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, existing.id)).returning();
  if (updates.status && updates.status !== existing.status) {
    await logActivity({ entityType: "client", entityId: client.id, action: "status_changed", description: `Status changed from "${existing.status}" to "${updates.status}"`, userId, metadata: { from: existing.status, to: updates.status } });
  } else {
    await logActivity({ entityType: "client", entityId: client.id, action: "updated", description: `Client "${client.name}" updated`, userId });
  }
  res.json(client);
});

router.delete("/clients/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const where = canManageAllClients(role)
    ? eq(clientsTable.id, Number(req.params.id))
    : and(eq(clientsTable.id, Number(req.params.id)), eq(clientsTable.ownerId, userId));
  const deleted = await db.delete(clientsTable).where(where).returning({ id: clientsTable.id });
  if (deleted.length === 0) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

export default router;
