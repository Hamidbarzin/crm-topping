---
name: OpenAI reasoning-model empty-content pitfall
description: gpt-5-mini and other reasoning models silently return empty content if the token budget is too small
---

# gpt-5-mini empty-content pitfall

When calling `openai.chat.completions.create` with a **reasoning model** (e.g. `gpt-5-mini`), hidden
reasoning tokens are counted against `max_completion_tokens` *before* any visible content is produced.

**Rule:** give a generous `max_completion_tokens` (≥2000, use 3000 for free-form chat answers). A small
budget (e.g. 300) gets fully consumed by reasoning, leaving `message.content` empty with
`finish_reason: "length"`.

**Why:** this caused two separate silent failures in this repo (payroll AI scoring, then the AI
assistant). A bare `catch {}` hid it and surfaced as "AI unavailable".

**How to apply:**
- Set a large `max_completion_tokens`.
- After the call, guard against empty content and throw with `finish_reason` in the message, then log via `req.log.error`. Never swallow with a bare catch.
- For strict JSON outputs, also pass `response_format: { type: "json_object" }`.
