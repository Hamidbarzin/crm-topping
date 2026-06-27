---
name: Topping CRM booking routes
description: Why booking OpenAPI endpoints use query params instead of path params
---

Booking endpoints use query params (`?userSlug=`) rather than path params (`/:userSlug`) for the `userSlug` identifier.

**Why:** Orval codegen produces TypeScript types from the OpenAPI spec. Path parameters in deeply nested routes can sometimes cause TS2308 "cannot find module" collisions in the generated output when the parameter name matches certain reserved identifiers or conflicts with other generated types. Using query params avoids this entirely.

**How to apply:** Keep booking-related OpenAPI paths as `/booking/availability` and `/booking/book`, passing `userSlug` and `date` as query parameters. Do not refactor to path params without re-running codegen and verifying no TS errors.
