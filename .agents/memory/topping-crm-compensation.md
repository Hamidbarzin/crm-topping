---
name: Topping CRM compensation / commission engine
description: Gate-blocking semantics and rule interpretation for the deterministic commission calculator
---

## Gate-blocking has three tiers, not one
The compensation engine (`calculateCompensation`) splits the 7 payment gates into tiers:
- **Hard gates** (first order, CRM verified, invoice paid, no dispute) → if any fail,
  `blocked = true` and EVERY payout (commission + all marketing bonuses) becomes $0.
- **Marketing gates** (node compliance, lead source logged) → only void the marketing
  payouts (lead-gen bonus AND monthly performance bonus). Field-sales/closer commission
  still pays. Track this with a `marketingBlocked = blocked || !marketingGateOk` flag.
- **Founder approval** → strategic bonus only; if missing it is `pending` (not blocked, not $0).

**Why:** node violations are the marketer's fault (wrong ad territory), so they shouldn't
void the closer's commission. A code review caught the monthly performance bonus wrongly
using the hard-gate flag instead of `marketingBlocked`.
**How to apply:** any NEW marketing payout line must use `marketingBlocked`, not `blocked`.
Any non-marketing payout uses `blocked`. Don't collapse the tiers into one boolean.

## Rule interpretations baked into the engine (not in the spec verbatim)
- Tier boundaries use `<=` lower-inclusive (e.g. revenue exactly 1000 → 5% rate, $25 lead bonus).
- Scenario D field/closer split defaults to 50/50 (spec says only "per their role").
- Strategic bonus, when Founder-approved, applies the **minimum** of its range to totals and
  flags that the max is available at Founder discretion; when not approved it is `pending`
  and excluded from `totalAcquisitionCost` (surfaced separately as `pendingTotal`).
- Verified against the spec's worked example: $8,000 / scenario A / Arshia → 3% rate,
  $240 pool, $440 total acquisition, 13.75% of profit, $2,760 net.

**Why:** the spec has overlapping tier ranges and leaves some splits ambiguous; these choices
make the math deterministic and reproduce the spec's own example exactly.
