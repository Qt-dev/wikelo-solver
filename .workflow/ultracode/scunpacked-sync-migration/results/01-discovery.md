# Result 01: runtime discovery

## Summary

Mapped the existing Worker, D1, UEX refresh, import boundary, and local game-client collector. The Worker can host both Workflows and the repository container; D1 is shared through the existing `cloudflare:workers` database binding.

## Evidence

- `worker/index.ts` was a Vinext fetch-only entry point.
- `lib/server/price-refresh.ts` already uses the all-items UEX price and marketplace-average payloads, so no client computer is required.
- `worker-configuration.d.ts` and Wrangler schema confirm Workflows, crons, Durable Objects, and Containers are supported by the installed runtime.

## Handoff

- Summary: Use cron events to create durable Workflow instances and use a Container only for the large repository checkout.
- Changed surfaces: none.
- Contracts satisfied: source-of-truth and unattended-sync design.
- Assumptions: Cloudflare Paid plan is available for Containers.
- Local checks: Wrangler type generation and local D1 migration later passed.
- Integration evidence: `worker/index.ts`, `wrangler.jsonc`, and `worker/sync-workflows.ts` implement the design.
- Risks: First production deployment provisions a Durable Object and container image.

## Files changed

None.
