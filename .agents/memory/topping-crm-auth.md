---
name: Topping CRM auth flow & security
description: JWT auth model, role-based access, and security invariants for the Topping CRM auth system
---

# Topping CRM auth

- JWT stored in localStorage as `crm_token`; `setAuthTokenGetter` wires all generated hooks to send it automatically.

## Token-purpose separation (security invariant)
All JWTs are signed with the same `JWT_SECRET`, so they MUST carry a `kind` claim to prevent token confusion.
- Auth tokens: `kind: "auth"` (7d). `requireAuth` rejects anything where `kind !== "auth"`.
- Password-reset tokens: `kind: "pwreset"` (1h), verified only by `verifyResetToken`.
**Why:** without the kind check, a 1h reset token could be used as a Bearer auth token for protected APIs.
**How to apply:** any new token type needs its own `kind` and must never be accepted by `requireAuth`. Changing `signToken` to add/rename `kind` invalidates all existing sessions (one-time re-login).

## requireAuth re-checks the DB every request
`requireAuth` is async: it reloads the user by id, rejects missing/inactive users, and derives `role` fresh from the DB (ignores the role baked into the JWT).
**Why:** role changes and deactivations must take effect immediately, not only at token expiry.

## Frontend AuthProvider must re-fetch /auth/me on load (stale-role trap)
The React `AuthProvider` caches `crm_user` in localStorage. On mount it hydrates from cache for instant render BUT must also re-fetch `GET /auth/me` and overwrite the cached user, clearing the session on 401 and keeping cache on network error.
**Why:** the backend is correct per-request, but the *client* trusted stale localStorage. When a user's DB role was upgraded after their last login (e.g. barzin Employee→Marketing_Manager), the cached role stayed low so `canManage`/role-gated UI (Assign Task form, manager nav) never appeared until manual re-login. Reported as "the manager doesn't have the task form".
**How to apply:** never gate UI solely on the localStorage-cached user; the profile refresh on load is what makes role/permission changes propagate without re-login.

## Reset links use a trusted server URL, never request headers
Password-reset email links are built from `APP_BASE_URL` → else `REPLIT_DOMAINS[0]` → else localhost. Never from the `Origin`/`Host` header.
**Why:** request headers are attacker-controllable; using them lets an attacker poison the reset link to steal the victim's token.

## Role model
- Manager roles = `CEO`, `Admin`, `Marketing_Manager` (see all leads read-only + all reports; only they can add members or change role/isActive).
- Everyone else sees only their own leads/reports.

## Elevated-role assignment is admin-only — enforce on EVERY role-mutation path
Elevated roles (`CEO`, `Admin`, `Marketing_Manager`, `IT_Manager`) may only be granted by an admin (`CEO`/`Admin`). This invariant must hold on every endpoint that can set a `role`, not just one:
- `POST /auth/register` (public): `SELF_ROLES` is restricted to non-elevated (`Sales_Rep`, `Closer`, `Employee`); any other requested role falls back to `Employee`.
- `POST /users` and `PATCH /users/:id`: validate role against an allowlist and reject elevated-role assignment unless actor `isAdmin`. A `Marketing_Manager` is a manager (can add members) but is NOT an admin — without this guard it could self-promote to Admin/CEO via `/users`.
**Why:** closing only the register hole leaves the same escalation reachable through `/users`. The escalation must be blocked on the whole role-mutation surface, or it just moves to the next door.
**How to apply:** when adding any endpoint that writes `role`, gate elevated values behind `isAdmin` and reject unknown role strings.

## Destructive endpoints need owner-or-manager authz, not just requireAuth
`DELETE` handlers (e.g. `DELETE /meetings/:id`, `DELETE /companies/:id`) must fetch the row first (404 if missing) then allow only the owner or a manager — a bare `requireAuth` lets any authenticated user delete anyone's data.

## Dashboard / KPI surface is role-scoped (data-leak invariant)
Every read endpoint that aggregates cross-user data MUST scope by `isManager(role)`, not just `requireAuth`. A shared `requireAuth` is NOT sufficient — it lets any authenticated user read everyone's numbers.
- `/kpi/dashboard`: managers get team-wide totals + Top Performers leaderboard; non-managers get only their own (meetings they own/attend via attendee subquery, deals where they are `salesRepId`/`closerId`, own revenue) and an empty leaderboard. Response carries `scope: 'team'|'personal'`.
- `/kpi/user/:userId`: non-managers 403 unless `userId === self` (was an IDOR).
- `/kpi/reports`: non-managers filtered to their own `userId` rows.
- Frontend KpiPage hides the per-user "Individual KPI" lookup for non-managers.
**Why:** the original dashboard showed company revenue + a leaderboard to every role; surfacing other people's numbers to rank-and-file is a privacy/trust problem. The user explicitly flagged "why does everyone see the same dashboard".
**How to apply:** when adding any new aggregate/report endpoint, add the `isManager` scope at the same time and verify a non-manager token cannot read another user's data.
- Google sign-up defaults new users to `Employee`.
- Self-service registration (`POST /auth/register`) lets the user pick a NON-elevated role only (`Sales_Rep`/`Closer`/`Employee`). It used to allow any role incl. Admin/CEO; that was fixed as a critical privilege-escalation hole (user approved). Do NOT revert to free role choice on register.

## Email
- Sending uses the Gmail connector via `@replit/connectors-sdk`: `connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", { method:"POST", body: JSON.stringify({ raw }) })` where `raw` is a base64url RFC822 message. Proxy returns a fetch-like Response — call `.json()`/`.ok`.
