import { Router } from "express";
import { db } from "@workspace/db";
import { tasksTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, isManager } from "../middlewares/auth";
import { logActivity } from "../lib/activity";

const router = Router();

router.get("/tasks", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  // Managers see every task; everyone else is scoped to tasks assigned to them.
  const tasks = await db
    .select({
      id: tasksTable.id, title: tasksTable.title, description: tasksTable.description,
      status: tasksTable.status, priority: tasksTable.priority, dueDate: tasksTable.dueDate,
      assigneeId: tasksTable.assigneeId, assigneeName: usersTable.name,
      dealId: tasksTable.dealId, meetingId: tasksTable.meetingId,
      responseNote: tasksTable.responseNote, createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .leftJoin(usersTable, eq(tasksTable.assigneeId, usersTable.id))
    .where(isManager(role) ? undefined : eq(tasksTable.assigneeId, userId))
    .orderBy(tasksTable.createdAt);
  res.json(tasks);
});

router.post("/tasks", requireAuth, async (req, res) => {
  if (!isManager(req.user!.role)) { res.status(403).json({ error: "Only managers can create and assign tasks" }); return; }
  const { title, description, priority, dueDate, assigneeId, dealId, meetingId } = req.body;
  const [task] = await db.insert(tasksTable).values({
    title, description, priority: priority || "medium",
    dueDate: dueDate ? new Date(dueDate) : undefined,
    assigneeId, dealId, meetingId,
  }).returning();
  await logActivity({ entityType: "task", entityId: task.id, action: "created", description: `Task "${task.title}" created`, userId: req.user!.userId });
  res.status(201).json(task);
});

router.patch("/tasks/:id", requireAuth, async (req, res) => {
  const { userId, role } = req.user!;
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, Number(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  // Only the assignee or a manager may edit a task.
  if (!isManager(role) && existing.assigneeId !== userId) {
    res.status(403).json({ error: "You do not have access to this task" }); return;
  }
  const { title, description, status, priority, dueDate, assigneeId, responseNote } = req.body;
  const VALID_STATUS = ["pending", "in_progress", "completed", "cancelled"];
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    res.status(400).json({ error: "Invalid task status" }); return;
  }
  const updates: Partial<typeof tasksTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
  // The assignee (or a manager) can leave a reply: progress update or reason it isn't done.
  if (responseNote !== undefined) updates.responseNote = responseNote || null;
  // Reassigning a task is a management action — managers only.
  if (assigneeId !== undefined && isManager(role)) updates.assigneeId = assigneeId;
  const [task] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, existing.id)).returning();
  if (updates.status && updates.status !== existing.status) {
    await logActivity({ entityType: "task", entityId: task.id, action: "status_changed", description: `Task "${task.title}" marked "${updates.status}"`, userId, metadata: { from: existing.status, to: updates.status } });
  }
  if (responseNote !== undefined && (responseNote || null) !== (existing.responseNote ?? null)) {
    await logActivity({ entityType: "task", entityId: task.id, action: "responded", description: `Update on "${task.title}": ${responseNote || "(cleared)"}`, userId });
  }
  res.json(task);
});

router.delete("/tasks/:id", requireAuth, async (req, res) => {
  if (!isManager(req.user!.role)) { res.status(403).json({ error: "Only managers can delete tasks" }); return; }
  await db.delete(tasksTable).where(eq(tasksTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
