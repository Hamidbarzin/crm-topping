import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, meetingsTable } from "@workspace/db";
import { eq, and, gt, lt, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/booking/availability", async (req, res) => {
  const { userSlug, date } = req.query;
  if (!userSlug) { res.status(400).json({ error: "userSlug required" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.slug, userSlug as string));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const targetDate = date ? new Date(date as string) : new Date();
  const slots = [];
  for (let hour = 9; hour < 17; hour++) {
    const start = new Date(targetDate);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(hour + 1, 0, 0, 0);
    const [conflict] = await db.select().from(meetingsTable).where(
      and(eq(meetingsTable.ownerId, user.id), lt(meetingsTable.startTime, end), gt(meetingsTable.endTime, start), ne(meetingsTable.status, "cancelled"))
    );
    slots.push({ start: start.toISOString(), end: end.toISOString(), available: !conflict });
  }
  res.json({ slots });
});

router.post("/booking/book", async (req, res) => {
  const { userSlug } = req.query;
  const { clientName, clientEmail, startTime, endTime, notes } = req.body;
  if (!userSlug) { res.status(400).json({ error: "userSlug required" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.slug, userSlug as string));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const start = new Date(startTime);
  const end = new Date(endTime);

  const [conflict] = await db.select().from(meetingsTable).where(
    and(eq(meetingsTable.ownerId, user.id), lt(meetingsTable.startTime, end), gt(meetingsTable.endTime, start), ne(meetingsTable.status, "cancelled"))
  );
  if (conflict) { res.status(409).json({ error: "This time slot is no longer available." }); return; }

  const [meeting] = await db.insert(meetingsTable).values({
    title: `Booking: ${clientName}`,
    clientName, clientEmail,
    startTime: start, endTime: end,
    ownerId: user.id, notes, status: "scheduled",
    source: "booking",
  }).returning();
  res.status(201).json(meeting);
});

router.get("/booking/requests", requireAuth, async (req, res) => {
  const { role } = req.user!;
  if (!["CEO", "Manager", "Admin"].includes(role)) {
    res.status(403).json({ error: "Managers only" }); return;
  }
  const requests = await db
    .select({
      id: meetingsTable.id,
      title: meetingsTable.title,
      clientName: meetingsTable.clientName,
      clientEmail: meetingsTable.clientEmail,
      startTime: meetingsTable.startTime,
      endTime: meetingsTable.endTime,
      status: meetingsTable.status,
      source: meetingsTable.source,
      ownerId: meetingsTable.ownerId,
      ownerName: usersTable.name,
      notes: meetingsTable.notes,
      createdAt: meetingsTable.createdAt,
    })
    .from(meetingsTable)
    .leftJoin(usersTable, eq(meetingsTable.ownerId, usersTable.id))
    .where(eq(meetingsTable.source, "booking"))
    .orderBy(meetingsTable.createdAt);
  res.json(requests);
});

router.patch("/booking/requests/:id/assign", requireAuth, async (req, res) => {
  const { role, userId } = req.user!;
  if (!["CEO", "Manager", "Admin"].includes(role)) {
    res.status(403).json({ error: "Managers only" }); return;
  }
  const { assignedUserId } = req.body;
  const id = Number(req.params.id);

  const [meeting] = await db
    .update(meetingsTable)
    .set({ ownerId: assignedUserId, assignedBy: userId })
    .where(and(eq(meetingsTable.id, id), eq(meetingsTable.source, "booking")))
    .returning();
  if (!meeting) { res.status(404).json({ error: "Booking not found" }); return; }
  res.json(meeting);
});

export default router;
