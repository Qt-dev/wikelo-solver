# Final audit

- Scope: local build only; no deploy, secret entry, live migration, task installation, or external write.
- Auth: identify-only OAuth, ten-minute state cookie, provider tokens discarded, 256-bit session token hashed in D1, secure cookie, logout route present.
- Data isolation: preferences require a session and query/write by the current user ID; writes enforce exact same origin.
- Imports: exact-body HMAC, five-minute window, durable request-ID replay rejection, invisible staging, atomic active flip.
- Pricing: official-origin allowlist, optional server-only token, exact/reviewed mapping, terminal minimum then Q0 buy/AUEC marketplace fallback, missing stays null.
- Collector: DPAPI secret, HTTPS enforcement, temp cleanup, dry runs, no scheduled tasks installed.
- Verification: migration, lint, production build, 8 Node tests, 20 collector assertions all pass.
- Skipped: real Data.p4k, live UEX/Discord, D1 migration execution, browser QA with populated data, Sites deployment.
