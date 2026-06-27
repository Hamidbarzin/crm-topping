---
name: Topping CRM notifications, goals & activity features
description: Durable constraints for the cron scheduler, schema-push drift, and activity-timeline access control
---

## Cron scheduler runs in-process
The notification scheduler (daily email reminders + AI summaries) runs inside the API
server process via node-cron (America/Toronto: reminders 08:00, summaries 07:30).

**Why:** there is no external job runner in this project.
**How to apply:** in production this only fires if the deployment is always-on. Tell the
user to deploy as a **Reserved VM** (not Autoscale/scale-to-zero) or the scheduled
emails silently never send.

## DB schema changes: do NOT `drizzle push --force`
The DB has pre-existing drift around the users `google_id` constraint, so
`pnpm --filter @workspace/db run push` prompts/conflicts. New tables (e.g. activity_logs,
user_goals) were created with plain `psql` DDL matching the Drizzle schema instead.

**Why:** a force-push would try to "fix" the google_id drift and can damage existing data.
**How to apply:** when adding a table, write the schema file for type-safety AND apply the
DDL manually via psql; never push-force to resolve the prompt.

## Alert.type is a free-form string in the OpenAPI spec
The `Alert` schema in openapi.yaml types `type` as a plain `string` (not an enum), so adding
a new alert kind (e.g. an "assigned task" notification) needs NO spec edit and NO codegen run.

**Why:** the generated zod/hooks accept any string for `type`, so a new alert flows through
end-to-end with only a backend `computeAlerts` change (plus updating the local `Alert` TS union
for type-safety).
**How to apply:** when adding alert types that both overlap and don't (e.g. overdue vs. open
assigned tasks), de-duplicate in `computeAlerts` (skip overdue in the assigned-task branch) so
the same task never produces two alerts.

## Task management surface (create/reassign/delete) is manager-level
The Tasks page is the "Marketing Operations" console. Server-side, `POST /tasks` (create+assign),
`PATCH` reassign, `DELETE`, and GET-all-visibility are gated by `isManager` (CEO/Admin/Marketing_Manager)
— NOT `isAdmin`. The `isManager`/`MANAGER_ROLES` helper lives in `middlewares/auth.ts` (mirrors the
manager concept already used for alerts). Regular users only read their own tasks (GET scoped) and
toggle status on tasks assigned to them.

**Why:** department leads (the Marketing Manager) must be able to assign/track team work, but rank-and-file
must not assign work to colleagues. Pipeline automations create tasks via the DB layer directly, so HTTP
gating never blocks automated task creation. Tasks nav item in AppLayout also uses `MANAGER_ROLES`.
**How to apply:** add new task-mutating HTTP routes behind `isManager`; reserve `isAdmin` (CEO/Admin)
for staff/deployment-level surfaces (Automations, Payroll, Permissions, etc.).

## Activity timeline endpoint must whitelist entityType
`GET /api/activity` takes `entityType` + `entityId`. It must reject anything other than
`lead` and `client` (400), and for `lead` non-managers may only see leads they own.

**Why:** activity_logs is a shared table that also stores rows for deals/meetings/tasks.
Without the whitelist, any authenticated user could read another entity's activity by id
(IDOR / cross-entity data exposure). Caught in code review.
**How to apply:** if you expose more entity types later, add an explicit per-type auth check
before returning rows — do not just widen the whitelist.
