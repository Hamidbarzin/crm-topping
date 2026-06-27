---
name: wouter same-pattern route re-hydration
description: Why form pages keyed by a route param must re-hydrate per id, not once
---

# wouter same-pattern route re-hydration

When two routes share a pattern (e.g. `/leads/:id`), navigating from one id to
another does NOT unmount/remount the page component — wouter keeps the same
instance and only the param changes.

**Rule:** A form/detail page that hydrates state from a route param must track
*which id it hydrated for* (e.g. `hydratedFor === idParam`), not a one-shot
boolean. A boolean guard fills the form once and then silently shows/edits the
wrong record after an in-app id→id navigation.

**Why:** A one-shot `hydrated` boolean caused the lead edit page to keep the
first lead's data when navigating directly to a second lead, risking submitting
an update against the wrong leadId.

**How to apply:** Hydrate exactly once per id; skip re-hydration only when
`hydratedFor === idParam` so a background list refetch of the *same* id never
clobbers in-progress edits, but a different id always re-fills.
