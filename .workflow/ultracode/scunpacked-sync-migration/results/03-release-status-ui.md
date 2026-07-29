# Result 03: release-status UI

## Summary

Added a persisted `not_for_release` recipe field and a non-blocking UI warning.

## Evidence

- `db/schema.ts` declares the boolean with a false default.
- `lib/contracts/api.ts` exposes it in `RecipeDto`.
- `app/components/RecipePlanner.tsx` renders the warning in both summary and detail views.

## Handoff

- Summary: unreleased recipes remain usable but visibly marked.
- Changed surfaces: schema, API DTO, recipe UI.
- Contracts satisfied: false default and accessible explanatory label.
- Assumptions: data source marks `NotForRelease` as a boolean.
- Local checks: focused ESLint and build passed.
- Integration evidence: `app/api/recipes/route.ts` serializes the field and sorts released recipes first.
- Risks: no standalone route test; covered by TypeScript/build and manual contract review.

## Files changed

- `db/schema.ts`
- `lib/contracts/api.ts`
- `app/components/RecipePlanner.tsx`
