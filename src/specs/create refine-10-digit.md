# Feature: Refine to exact 10-digit HS code

## Problem
Users start with 4–6 digit HS, but duties depend on 10-digit. They need a fast refine flow without leaving the estimator.

## Acceptance Criteria
- [ ] In estimator results, show a link-style button: “Refine to exact 10-digit”.
- [ ] After an estimate completes, prefetch 2–6 candidate 10-digit codes (server route) with description + confidence % (0–100).
- [ ] Clicking the link opens a modal instantly (uses prefetched data).
- [ ] Selecting a candidate swaps the HS in state + URL and re-runs estimate.
- [ ] Extract heavy logic to `/lib/estimate/*`.
- [ ] Telemetry: `refine_opened({hs6})`, `refine_selected({hs6, chosen10, confidence})`.
- [ ] No file >250 LOC; no `any`.
- [ ] Validate API request/response with Zod; handle empty/no-match states.

## UI Notes
- Link sits next to displayed HS code in results.
- Modal: list rows [10-digit code, description, confidence, “Use this code”].
- Show “No close match found” with link to `/hs` if list empty.

## Done
- All criteria pass; lint/typecheck/tests/build succeed.
