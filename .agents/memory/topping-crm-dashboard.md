---
name: Topping CRM dashboard data boundaries
description: Which dashboard visuals are real vs sample, and why
---

# Dashboard (DashboardPage) data boundaries

Charts use Chart.js v4 via a reusable `ChartCanvas` wrapper (useRef + useEffect, destroys chart on cleanup). Persian labels, custom HTML legends, `plugins.legend.display:false` everywhere.

**Real data:** the 4 metric card *values* (`useGetKpiDashboard`) and the "لیدهای اخیر" list (`useListLeads`).

**Sample/representative data (no backing API):**
- Monthly revenue bar+line (درآمد ماهانه) — needs revenue-by-month aggregation endpoint.
- Team radar (عملکرد تیم) — needs a 5-axis per-member score endpoint.
- Node distribution line (توزیع نودها) — leads have NO `node` field (node is a marketing-only concept, not in the leads schema).
- Metric card trend % deltas (↑/↓ "vs ماه قبل") — no period-over-period API; dashboard KPI endpoint is all-time only.

**Why:** request was design-fidelity to a provided spec; building time-series/history endpoints was out of scope. If asked to "make the charts real," add monthly aggregation endpoints (deals.closedAt/value by month) and a node field or distribution query first.
