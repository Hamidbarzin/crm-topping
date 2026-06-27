---
name: Topping CRM RBAC & deal approval workflow
description: Admin set, deal ownership/submission/founder-approval rules, and authorization edge cases for deals + payroll
---

## Admin set is CEO + Admin only
`isAdmin(role)` in `middlewares/auth.ts` whitelists `["CEO","Admin"]`. Do NOT add "Manager" —
older payroll code used `["CEO","Manager","Admin"]` and had to be corrected. Frontend pages
mirror this with their own `["CEO","Admin"].includes(user.role)` check; keep both in sync.

## Deal ownership = three columns, any match
A non-admin "owns" a deal if `user.id` matches `salesRepId` OR `closerId` OR `createdById`.
Visibility filter applies to GET /deals, /deals/pipeline, AND /deals/:id (don't forget the
single-get — that's the IDOR hole). Admins bypass the filter.

## Founder-approval gate threshold
A deal is flagged `founderApprovalStatus=pending` when `grossMarginPercent < 35` OR
`value >= 10000`. Only triggers when the field is non-null — missing data must NOT trigger
pending. Recompute this meta on both create and edit.

## Edit lock vs delete lock are different
- Edit (PATCH /deals/:id) is blocked (400) when `submissionStatus` is `submitted` or `approved` —
  applies to everyone including the owner.
- Delete, clawback, founder-approval, review are admin-only (403 for non-admins).

## Literal deal routes MUST precede /deals/:id
`/deals/pipeline`, `/deals/pending-submissions`, `/deals/founder-approvals` must be registered
before `/deals/:id` or Express matches the literal as `:id` → `Number("pending-submissions")=NaN`
→ 500 from the getDeal select. **Why:** caused a real 500. **How to apply:** when adding any new
literal `/deals/<word>` route, put it above the `:id` handler.

## The dev workflow builds once — restart to pick up server changes
`api-server` dev script is `build && start` (esbuild one-shot, no watch). After editing any
server/route/schema file you MUST `restart_workflow "artifacts/api-server: API Server"` or curl
still hits the stale build. A telltale sign: the returned row is missing newly-added columns.

## Leads: ONLY Marketing_Manager is the read-only observer (not CEO/Admin)
On leads, visibility and write-gating use DIFFERENT role sets — do not conflate them:
- **Read (visibility):** managers = CEO/Admin/Marketing_Manager see ALL leads (`isManager`);
  Sales_Rep/Closer/etc see only their own.
- **Write (create/edit/delete/score/log-activity/schedule-meeting):** blocked ONLY for
  Marketing_Manager (`isLeadObserver(role) === role==="Marketing_Manager"`). CEO/Admin have
  FULL write on ANY lead; Sales_Rep/Closer write only their OWN. Ownership scope is built by
  `leadOwnerWhere(id,userId,role)` → admins match by id alone, others by id+ownerId.
**Why:** a first pass blocked ALL managers (incl CEO/Admin) from writing leads, which hid the
Save button for the admin user and contradicted the matrix (CEO/Admin = everything). The bug
was using `isManager` for BOTH read visibility and write gating. **How to apply:** gate lead
writes with `isLeadObserver`, never `isManager`. Frontend mirrors this: LeadsPage/LeadFormPage
use `isObserver = role==="Marketing_Manager"` to hide Save/Add/edit UI — keep both in sync.

## Booking role check uses a literal "Manager" that isn't a valid role
`booking.ts` gates /booking/requests and /assign on `["CEO","Manager","Admin"]`, but
"Manager" is not in the user_role enum (it's Marketing_Manager). Effective access is
therefore CEO/Admin only. Latent drift bug — prefer `isAdmin()` / a shared manager
constant over inline role-string literals so enum changes don't silently break gates.

## Per-role access matrix (user-confirmed spec) + how it maps to code
The owner gave an explicit role matrix. Boundaries are enforced PER MODULE, not by one
global "manager" flag — each module decides its own visibility set:
- **CEO/Admin** (`isAdmin`): full read/write everywhere incl. financials, approvals, payroll.
- **Marketing_Manager**: observer. Reads all LEADS and all DEALS, but on deals gets a
  FINANCIAL-REDACTED view (value/grossMarginPercent/commissionStatus/clawbackStatus/founder*
  nulled) and is read-only (POST /deals → 403; PATCH/DELETE blocked by owner/admin gates).
  MM is NOT a clients manager — they only see clients they personally own (so effectively
  none unless assigned).
- **Sales_Rep/Closer**: own data only. Clients scoped by `ownerId`; POST /clients FORCES
  `ownerId=creator` for non-admins so reps can't orphan or mis-assign; GET/PATCH/DELETE
  /clients/:id 403/404 for non-owners.

**Why:** architect review flagged that reusing one broad MANAGER_ROLES set over-permissioned
MM (full client CRUD + full deal financials). Fix was per-capability helpers:
`canViewAllDeals` (admin+MM), `isMarketingManager` (redact + block create), `canManageAllClients`
(admin only). **How to apply:** when adding a module, decide MM's row explicitly — do NOT
assume MM == manager == can-do-all. NOT in the matrix and left shared: `companies.ts` (any
authed read/write) and `payroll.ts` (non-admin sees own only) — revisit only if user asks.

## Payroll calculate IDOR (fixed, watch for regressions)
`POST /payroll/calculate` accepts a `userId` in the body. Non-admins must NOT be able to target
another user — gate the override on `isAdmin`: `targetUserId = isAdmin(role) ? (userId||self) : self`.
A code review caught this; any new payroll endpoint that takes a target userId needs the same gate.

## Tasks must be scoped server-side, not just in the client filter
`GET /tasks` returns admin → all, non-admin → only `assigneeId === userId` (server `where`).
PATCH /tasks/:id = assignee-or-admin (and only admin may change `assigneeId`); DELETE = admin-only.
**Why:** the "My Work" page filters tasks client-side by assignee — without the server `where`
that just hides rows the browser already received (data leak + IDOR on PATCH/DELETE). A code
review caught this when the page exposed `/tasks` to non-admins for the first time.
**How to apply:** any per-user list the frontend filters client-side must ALSO be scoped in the
route; never rely on client-side filtering for privacy.
