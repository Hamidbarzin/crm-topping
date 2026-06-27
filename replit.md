# Topping CRM — Business Operating System

A full-stack CRM and KPI tracking platform for Topping Courier Inc. Designed for daily use by sales reps, closers, and managers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed the database with demo data
- Required env: `DATABASE_URL` — Postgres connection string

## Default Login

- **Email:** `admin@toppingcourier.ca`
- **Password:** `admin123`

Other demo users: `sarah@toppingcourier.ca` / `password123`, `mike@toppingcourier.ca` / `password123`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + JWT auth (jsonwebtoken + bcryptjs)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + wouter + TanStack Query + Tailwind CSS v4 + shadcn/ui

## Where things live

- `lib/db/src/schema/` — all Drizzle ORM table definitions
- `lib/api-spec/` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/api.ts` — all React Query hooks (generated)
- `lib/api-zod/src/generated/api.ts` — all Zod schemas (generated)
- `artifacts/api-server/src/routes/` — all Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — JWT middleware + token signing
- `artifacts/topping-crm/src/` — React frontend
- `artifacts/topping-crm/src/pages/` — all page components
- `artifacts/topping-crm/src/lib/auth.tsx` — Auth context + localStorage token

## Architecture decisions

- JWT stored in localStorage as `crm_token`; set via `setAuthTokenGetter` in main.tsx so all generated hooks send it automatically
- `JWT_SECRET` defaults to `"topping-crm-secret-2024"` for dev; set `JWT_SECRET` env var in production
- All routes protected by `requireAuth` middleware except `/api/auth/login`, `/api/auth/logout`, `/api/booking/*`
- OpenAPI spec uses query params (not path params) for booking endpoints to avoid TS2308 collision
- Sidebar is always dark (`bg-sidebar`), main content adapts to light/dark mode

## Product

- **Dashboard** — KPI overview: meetings, deals won, close rate, revenue, top performers
- **Pipeline** — Kanban-style deal board across 6 stages with stage update dropdown
- **Leads** — Searchable table with stage badges, owner, value; full CRUD
- **Clients** — Client list with status and monthly revenue; full CRUD
- **Companies** — Company directory; full CRUD
- **Calendar** — Week-view team calendar with conflict detection on meeting creation
- **Meetings** — Meeting list with inline status and outcome updates
- **Tasks** — Task list with checkbox complete, priority badges, status update
- **KPI** — Daily report submission, per-user KPI breakdown, team summary
- **Team** — Team member cards with role badges; invite new members
- **Settings** — Current user profile + booking link
- **Booking** — Public API: `GET /api/booking/availability?userSlug=<slug>&date=<date>`, `POST /api/booking/book?userSlug=<slug>`

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/db/src/schema/`, always run `pnpm --filter @workspace/db run push` before starting the API server
- After changing the OpenAPI spec, always run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks
- `pnpm --filter @workspace/scripts run seed` checks if users already exist and skips if they do

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
