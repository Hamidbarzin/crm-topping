import { Router } from "express";
import { db } from "@workspace/db";
import { meetingsTable, meetingAttendeesTable, usersTable } from "@workspace/db";
import { eq, and, or, gte, lt, gt, ne, inArray } from "drizzle-orm";
import { requireAuth, isManager } from "../middlewares/auth";
import { logActivity } from "../lib/activity";

const router = Router();

// Find non-cancelled meetings that overlap [start, end) for any of the given
// users (as owner or attendee). Uses strict bounds so back-to-back meetings
// (e.g. 9-10 and 10-11) do not count as a conflict.
async function findOverlappingMeetings(
  userIds: (number | null | undefined)[],
  start: Date,
  end: Date,
  excludeMeetingId?: number,
) {
  const ids = [...new Set(userIds.filter((id): id is number => typeof id === "number"))];
  if (!ids.length) return [];
  const attendeeRows = await db
    .select({ meetingId: meetingAttendeesTable.meetingId })
    .from(meetingAttendeesTable)
    .where(inArray(meetingAttendeesTable.userId, ids));
  const attendeeMeetingIds = [...new Set(attendeeRows.map((r) => r.meetingId))];
  const ownerOrAttendee = attendeeMeetingIds.length
    ? or(inArray(meetingsTable.ownerId, ids), inArray(meetingsTable.id, attendeeMeetingIds))
    : inArray(meetingsTable.ownerId, ids);
  const rows = await db
    .select()
    .from(meetingsTable)
    .where(
      and(
        lt(meetingsTable.startTime, end),
        gt(meetingsTable.endTime, start),
        ne(meetingsTable.status, "cancelled"),
        ownerOrAttendee,
      ),
    );
  return excludeMeetingId ? rows.filter((m) => m.id !== excludeMeetingId) : rows;
}

function conflictPayload(conflicts: (typeof meetingsTable.$inferSelect)[]) {
  return {
    error: `This time slot conflicts with an existing meeting: "${conflicts[0].title}".`,
    conflicts: conflicts.map((m) => ({
      id: m.id,
      title: m.title,
      startTime: m.startTime.toISOString(),
      endTime: m.endTime.toISOString(),
    })),
  };
}

async function getMeetingWithAttendees(id: number) {
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) return null;
  const attendeeRows = await db
    .select({ userId: meetingAttendeesTable.userId, name: usersTable.name, email: usersTable.email })
    .from(meetingAttendeesTable)
    .leftJoin(usersTable, eq(meetingAttendeesTable.userId, usersTable.id))
    .where(eq(meetingAttendeesTable.meetingId, id));
  const [owner] = meeting.ownerId
    ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, meeting.ownerId))
    : [null];
  return { ...meeting, attendees: attendeeRows, ownerName: owner?.name || null };
}

router.get("/meetings/team-calendar", requireAuth, async (req, res) => {
  const { start, end } = req.query;
  let q = db.select().from(meetingsTable).$dynamic();
  if (start) q = q.where(gte(meetingsTable.startTime, new Date(start as string)));
  const meetings = await q.orderBy(meetingsTable.startTime);
  res.json(meetings);
});

router.get("/meetings/check-conflict", requireAuth, async (req, res) => {
  res.json({ hasConflict: false, conflicts: [] });
});

router.post("/meetings/check-conflict", requireAuth, async (req, res) => {
  const { startTime, endTime, attendeeIds, excludeMeetingId } = req.body;
  if (!attendeeIds?.length) { res.json({ hasConflict: false, conflicts: [] }); return; }
  const start = new Date(startTime);
  const end = new Date(endTime);
  const attendeeRows = await db
    .select({ meetingId: meetingAttendeesTable.meetingId, userId: meetingAttendeesTable.userId })
    .from(meetingAttendeesTable)
    .where(inArray(meetingAttendeesTable.userId, attendeeIds));
  const meetingIds = [...new Set(attendeeRows.map(r => r.meetingId))].filter(id => id !== excludeMeetingId);
  if (!meetingIds.length) { res.json({ hasConflict: false, conflicts: [] }); return; }
  const conflicts: typeof meetingsTable.$inferSelect[] = [];
  for (const mId of meetingIds) {
    const [m] = await db.select().from(meetingsTable).where(
      and(eq(meetingsTable.id, mId), lt(meetingsTable.startTime, end), gt(meetingsTable.endTime, start))
    );
    if (m && m.status !== "cancelled") conflicts.push(m);
  }
  if (!conflicts.length) { res.json({ hasConflict: false, conflicts: [] }); return; }
  const result = await Promise.all(conflicts.map(async c => {
    const aRow = attendeeRows.find(r => r.meetingId === c.id);
    const [user] = aRow ? await db.select().from(usersTable).where(eq(usersTable.id, aRow.userId)) : [null];
    return {
      userId: user?.id || 0, userName: user?.name || "Unknown",
      conflictingMeetingId: c.id, conflictingMeetingTitle: c.title,
      start: c.startTime.toISOString(), end: c.endTime.toISOString(),
    };
  }));
  res.json({ hasConflict: true, conflicts: result });
});

router.get("/meetings", requireAuth, async (_req, res) => {
  const meetings = await db.select().from(meetingsTable).orderBy(meetingsTable.startTime);
  res.json(meetings);
});

router.post("/meetings", requireAuth, async (req, res) => {
  const { title, clientName, companyName, location, onlineLink, startTime, endTime,
    attendeeIds, dealId, leadId, clientId, ownerId, notes } = req.body;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid start or end time." }); return;
  }
  if (start >= end) {
    res.status(400).json({ error: "End time must be after start time." }); return;
  }
  const meetingOwnerId = ownerId || req.user!.userId;
  const overlaps = await findOverlappingMeetings([meetingOwnerId, ...(attendeeIds || [])], start, end);
  if (overlaps.length) { res.status(409).json(conflictPayload(overlaps)); return; }
  const [meeting] = await db.insert(meetingsTable).values({
    title, clientName, companyName, location, onlineLink,
    startTime: start, endTime: end,
    dealId, leadId, clientId, ownerId: meetingOwnerId, notes,
  }).returning();
  if (attendeeIds?.length) {
    await db.insert(meetingAttendeesTable).values(
      attendeeIds.map((uid: number) => ({ meetingId: meeting.id, userId: uid }))
    );
  }
  const actorId = req.user!.userId;
  await logActivity({ entityType: "meeting", entityId: meeting.id, action: "created", description: `Meeting "${meeting.title}" scheduled`, userId: actorId });
  if (leadId) await logActivity({ entityType: "lead", entityId: leadId, action: "meeting_scheduled", description: `Meeting "${meeting.title}" scheduled`, userId: actorId, metadata: { meetingId: meeting.id } });
  if (clientId) await logActivity({ entityType: "client", entityId: clientId, action: "meeting_scheduled", description: `Meeting "${meeting.title}" scheduled`, userId: actorId, metadata: { meetingId: meeting.id } });
  const result = await getMeetingWithAttendees(meeting.id);
  res.status(201).json(result);
});

router.get("/meetings/:id", requireAuth, async (req, res) => {
  const meeting = await getMeetingWithAttendees(Number(req.params.id));
  if (!meeting) { res.status(404).json({ error: "Not found" }); return; }
  res.json(meeting);
});

router.patch("/meetings/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const { title, clientName, companyName, location, onlineLink, startTime, endTime,
    status, outcome, attendeeIds, dealId, leadId, clientId, notes } = req.body;
  const updates: Partial<typeof meetingsTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (clientName !== undefined) updates.clientName = clientName;
  if (companyName !== undefined) updates.companyName = companyName;
  if (location !== undefined) updates.location = location;
  if (onlineLink !== undefined) updates.onlineLink = onlineLink;
  if (startTime !== undefined) updates.startTime = new Date(startTime);
  if (endTime !== undefined) updates.endTime = new Date(endTime);
  if (status !== undefined) updates.status = status;
  if (outcome !== undefined) updates.outcome = outcome;
  if (dealId !== undefined) updates.dealId = dealId;
  if (leadId !== undefined) updates.leadId = leadId;
  if (clientId !== undefined) updates.clientId = clientId;
  if (notes !== undefined) updates.notes = notes;
  // Re-check conflicts whenever the meeting will be active and its time,
  // attendees, or active-state could change. Skip only when it stays cancelled.
  const willBeCancelled = status === "cancelled" || (status === undefined && existing.status === "cancelled");
  const becomingActive = status !== undefined && status !== "cancelled" && existing.status === "cancelled";
  const needsConflictCheck = !willBeCancelled &&
    (startTime !== undefined || endTime !== undefined || attendeeIds !== undefined || becomingActive);
  if (needsConflictCheck) {
    const newStart = updates.startTime ?? existing.startTime;
    const newEnd = updates.endTime ?? existing.endTime;
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
      res.status(400).json({ error: "Invalid start or end time." }); return;
    }
    if (newStart >= newEnd) {
      res.status(400).json({ error: "End time must be after start time." }); return;
    }
    const checkAttendees = attendeeIds !== undefined
      ? attendeeIds
      : (await db.select({ userId: meetingAttendeesTable.userId })
          .from(meetingAttendeesTable)
          .where(eq(meetingAttendeesTable.meetingId, id))).map((r) => r.userId);
    const overlaps = await findOverlappingMeetings([existing.ownerId, ...checkAttendees], newStart, newEnd, id);
    if (overlaps.length) { res.status(409).json(conflictPayload(overlaps)); return; }
  }
  await db.update(meetingsTable).set(updates).where(eq(meetingsTable.id, id));
  if (attendeeIds !== undefined) {
    await db.delete(meetingAttendeesTable).where(eq(meetingAttendeesTable.meetingId, id));
    if (attendeeIds.length) {
      await db.insert(meetingAttendeesTable).values(
        attendeeIds.map((uid: number) => ({ meetingId: id, userId: uid }))
      );
    }
  }
  if (updates.status && updates.status !== existing.status) {
    const actorId = req.user!.userId;
    const desc = `Meeting "${existing.title}" marked "${updates.status}"` + (updates.outcome ? ` — outcome: ${updates.outcome}` : "");
    const linkLead = leadId ?? existing.leadId;
    const linkClient = clientId ?? existing.clientId;
    await logActivity({ entityType: "meeting", entityId: id, action: "status_changed", description: desc, userId: actorId, metadata: { from: existing.status, to: updates.status, outcome: updates.outcome } });
    if (linkLead) await logActivity({ entityType: "lead", entityId: linkLead, action: "meeting_status_changed", description: desc, userId: actorId, metadata: { meetingId: id, to: updates.status } });
    if (linkClient) await logActivity({ entityType: "client", entityId: linkClient, action: "meeting_status_changed", description: desc, userId: actorId, metadata: { meetingId: id, to: updates.status } });
  }
  const result = await getMeetingWithAttendees(id);
  res.json(result);
});

router.delete("/meetings/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const { userId, role } = req.user!;
  // Only the meeting owner or a manager may delete a meeting.
  if (!isManager(role) && existing.ownerId !== userId) {
    res.status(403).json({ error: "You can only delete your own meetings" }); return;
  }
  await db.delete(meetingsTable).where(eq(meetingsTable.id, id));
  res.status(204).send();
});

export default router;
