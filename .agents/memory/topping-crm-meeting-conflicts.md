---
name: Topping CRM meeting double-booking rules
description: How meeting/booking overlap conflicts are detected and enforced
---

# Meeting double-booking prevention

The product rule: a meeting cannot occupy the same time slot twice for the same
owner or any shared attendee. Enforced server-side (the advisory
`check-conflict` endpoint alone is not enough — clients can skip it).

**Overlap uses STRICT bounds:** `existing.startTime < newEnd AND existing.endTime > newStart`.
**Why:** back-to-back meetings (e.g. 9–10 and 10–11) touch at a boundary and must
NOT count as a conflict. The earlier code used `lte`/`gte`, which falsely flagged
adjacent slots — this caused booking availability to mark the next hour busy.

**How to apply / where enforcement lives (api-server `routes/meetings.ts`, `routes/booking.ts`):**
- Cancelled meetings are always excluded from conflict checks (`ne(status, "cancelled")`).
- `POST /meetings` rejects overlaps (409) for owner + attendees; also validates start<end.
- `PATCH /meetings/:id` must re-check when the meeting will be active AND any of:
  time changed, attendees changed, OR status goes cancelled→active (reactivation).
  Only checking on time-change leaves bypasses (add busy attendee, or reactivate a
  cancelled overlapping meeting). Skip the check only when it stays cancelled.
- `/booking/book` already check-then-inserts owner overlap.

**Known limitation (accepted):** check-then-insert is not transactional, so a
true concurrent race could double-book. Fine for this internal CRM's low
concurrency; if it ever matters, add a Postgres exclusion constraint (btree_gist).
