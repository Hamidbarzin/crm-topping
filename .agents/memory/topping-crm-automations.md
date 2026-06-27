---
name: Topping CRM Automation Engine
description: How the sales-growth automation engine is structured and the conventions to keep when extending it
---

# Automation Engine

A registry-driven engine (`artifacts/api-server/src/lib/automations.ts`) of sales-growth automations, exposed admin-only at `GET /automations` and `POST /automations/:key/run`, with crons in `scheduler.ts` and an admin-only `AutomationsPage.tsx`.

## Conventions to keep

- **Run status is derived by throwing.** `runAutomation(key)` records `automation_runs` with `status:"success"` if the run fn returns, `status:"error"` if it throws. So a per-item automation that can fully fail (e.g. AI scoring during a provider outage) must `throw` when *every* item failed — otherwise it records a misleading success with `itemsAffected:0`.
  **Why:** operational observability — a silent "scored 0" hides outages.

- **`tasks.leadId` is set ONLY by the stale-lead follow-up automation.** Normal task creation (UI/`routes/tasks.ts`) never accepts `leadId`. So the follow-up dedup keyed on `leadId IS NOT NULL AND status not done` is intentionally specific to automation follow-ups, not "any open task". Don't "fix" it to be narrower thinking it's over-broad. (`meetingsTable` also has a `leadId` — that's unrelated.)

- **`pipeline_stage_tasks` is an event automation, not scheduled.** It lives inline in `PATCH /deals/:id` (stage-change branch) via the `STAGE_NEXT_ACTION` map, sets `tasks.dealId`, and has no `run()` — `runAutomation` throws `EVENT_TRIGGERED` for it and the UI hides its Run-now button (`trigger:"event"`).

## Known acceptable gaps (don't over-engineer for this CRM)

- Stage-change deal update + task insert + activity log are not wrapped in a single transaction. Acceptable here; revisit only if partial-state bugs surface.
- In-process cron scheduler needs a Reserved VM in production (already noted in `topping-crm-notifications.md`).
