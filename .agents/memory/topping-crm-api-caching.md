---
name: Topping CRM API caching / 304 trap
description: Why the API server disables ETag and sends no-store, and how the 304-empty-body bug manifests
---

# API caching: disable ETag, send no-store

The api-server (`artifacts/api-server/src/app.ts`) sets `app.set("etag", false)` and a
global `Cache-Control: no-store` middleware. Keep it that way.

**Why:** Express enables weak ETags by default. Behind the Replit dev proxy, a
conditional GET returned `304 Not Modified` with an **empty body**. The Orval/fetch
client did not have a browser-cached copy to substitute, so `res.json()` yielded
empty/undefined data. Symptom seen: the "Assign To" team-member dropdown on the Tasks
page rendered empty even though `/api/users` had 8 active users and the SQL/route were
correct. The bug is silent — no console error, list just looks legitimately empty.

**How to apply:** For this internal CRM, fresh data on every request is the desired
behavior anyway (live KPIs, booking availability, team lists), so global `no-store` is
correct, not a regression. If you ever debug a "list/dropdown is empty but the API
returns data" issue, check for `304` responses in the api-server logs *before*
touching frontend filter logic — the data path is usually fine and caching is the
culprit. Do not re-enable ETag without re-verifying the proxy 304 behavior.
