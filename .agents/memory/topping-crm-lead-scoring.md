---
name: Topping CRM lead scoring & form numeric serialization
description: How AI lead scoring works and the falsy-zero pitfall in lead form payloads
---

# AI lead scoring
- `POST /leads/:id/score` (operationId `scoreLead`) computes a 0-100 score + reason via OpenAI gpt-5-mini, persists `aiScore`/`scoreReason`, logs a "scored" activity, returns the updated lead.
- Score is **auto-calculated**, not manual: the create flow fires `scoreLead.mutate` on `createLead` success, and the edit dialog has a manual "Re-score" button. There is no editable score input.
- Owner-only + managers (CEO/Admin/Marketing_Manager) are blocked server-side (observers). Lookup scopes `and(eq(id), eq(ownerId, userId))` to prevent IDOR.
- gpt-5-mini needs generous `max_completion_tokens` (3000) and `response_format: json_object`; empty content is thrown (502), never bare-caught. See `openai-reasoning-models.md`.

# Marketing features (Shayan spec)
- The Shayan marketing spec is itself an "AI brain" prompt — scoring/priority/next_action are intentionally LLM-driven (gpt-5-mini), not a deterministic rule engine. Keep it that way unless the user asks for a rule engine.
- **Node-conflict is a hard rule enforced in code, not left to the model:** after parsing the AI score, if `gtaNode` is 1 or 2 (Arshia's territory) the server always appends `⚠️ Node conflict — verify CRM` to the reason if absent. Don't rely on the prompt alone.
- Endpoints live in leads.ts: `GET /leads/marketing-kpi`, `POST /leads/marketing-report` (English report + optional email via lib/mail), `POST /leads/:id/log-activity`, `POST /leads/:id/schedule-meeting`. The two literal `/leads/marketing-*` routes MUST be registered before `/leads/:id`.
- Reports/UI are ENGLISH ONLY (user is Finglish-speaking but requires English UI). Spec shows Farsi output — ignore that; force English.
- schedule-meeting inserts a meeting (startTime/endTime as Date objects) + attendee row and sets lead status=meeting_scheduled.

# Form numeric serialization pitfall
**Rule:** when building lead create/update payloads from form string state, convert numbers with `field === "" ? undefined : Number(field)` — NOT `field ? Number(field) : undefined`.

**Why:** the truthy check treats `"0"` as falsy, so users could never set `emailsSent`, `emailsReceived`, or `value` to 0. These feed the AI score, so dropping 0 silently corrupts scoring inputs.

**How to apply:** any new numeric field added to LeadsPage (or similar forms) must use the explicit empty-string check.
