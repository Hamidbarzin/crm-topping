import { Router } from "express";
import { db, activityLogsTable, leadsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const MANAGER_ROLES = ["CEO", "Admin", "Marketing_Manager"];
const isManager = (role: string) => MANAGER_ROLES.includes(role);

router.get("/activity", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const entityType = String(req.query.entityType || "");
  const entityId = Number(req.query.entityId);
  if (!entityType || !entityId || Number.isNaN(entityId)) {
    res.status(400).json({ error: "entityType and entityId are required" });
    return;
  }

  // Only lead and client timelines are exposed via this endpoint.
  if (entityType !== "lead" && entityType !== "client") {
    res.status(400).json({ error: "Unsupported entityType" });
    return;
  }

  // Access control: non-managers may only view the timeline of leads they own.
  // Clients are visible to all authenticated users (matches the clients list route).
  if (entityType === "lead" && !isManager(role)) {
    const [lead] = await db.select({ ownerId: leadsTable.ownerId }).from(leadsTable).where(eq(leadsTable.id, entityId));
    if (!lead || lead.ownerId !== userId) {
      res.status(403).json({ error: "Not your lead" });
      return;
    }
  }

  const rows = await db
    .select({
      id: activityLogsTable.id,
      action: activityLogsTable.action,
      description: activityLogsTable.description,
      metadata: activityLogsTable.metadata,
      userId: activityLogsTable.userId,
      userName: usersTable.name,
      createdAt: activityLogsTable.createdAt,
    })
    .from(activityLogsTable)
    .leftJoin(usersTable, eq(activityLogsTable.userId, usersTable.id))
    .where(and(eq(activityLogsTable.entityType, entityType), eq(activityLogsTable.entityId, entityId)))
    .orderBy(desc(activityLogsTable.createdAt));

  res.json(rows);
});

export default router;
