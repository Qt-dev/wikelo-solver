# Wikelo Solver

A dark, field-ledger-style planner for Star Citizen Wikelo missions. It reads normalized recipe data extracted from the game, enriches components with UEX prices, calculates complete or explicitly incomplete recipe costs, and lets Discord users persist which components they own or prefer to farm.

## Architecture

- **Web:** Vinext, React 19, TypeScript, Cloudflare Workers/Sites.
- **Data:** Cloudflare D1 with Drizzle migrations.
- **Collector:** Windows PowerShell scripts run `unp4k` on the gaming PC, discover Wikelo data, normalize it, and upload a signed snapshot.
- **Pricing:** Server-only UEX adapter. The UEX token is never sent to the browser or collector.
- **Identity:** Discord OAuth2 authorization-code flow with the `identify` scope and an app-owned hashed session.

The browser can read recipes anonymously. Signing in is only required to persist component preferences across devices.

## Local development

Prerequisites: Node.js 22.13 or newer.

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

The local D1 binding is declared in [.openai/hosting.json](.openai/hosting.json). Build and validate with:

```powershell
npm run lint
npm run build
npm test
npm run db:generate
```

The checked-in [wrangler.jsonc](wrangler.jsonc) is the D1 administration config. It binds `DB` to
`wikelo-solver-d1` and points Wrangler at the Drizzle migrations in `./drizzle`.

For standalone Wrangler development, create the Cloudflare database once, then apply migrations:

```powershell
npx wrangler d1 create wikelo-solver-d1
npm run db:migrate:local
```

Before applying migrations to Cloudflare, authenticate with Wrangler and run:

```powershell
npm run db:migrate:remote
```

The provisioned database ID is recorded as `database_id` in `wrangler.jsonc`, so both Wrangler
and the Worker use the same remote database. Keep that value synchronized if the database is
recreated.

## Environment variables

Copy `.dev.vars.example` to `.dev.vars` and fill values locally. Never commit `.dev.vars`.

- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`: Discord application credentials. The callback is derived from the request origin at `/auth/discord/callback`.
- `WIKELO_IMPORT_SECRET`: shared HMAC secret for gaming-PC imports and signed price refresh triggers.
- `UEX_API_TOKEN`: optional UEX API token; when supplied it is used only by server routes.
- `UEX_ITEMS_PRICES_URL`, `UEX_MARKETPLACE_PRICES_URL`: exact HTTPS endpoints on an approved official UEX API origin for current terminal quotes and quality-tier-zero marketplace fallback averages.
- `WIKELO_INTERNAL_TOKEN`: bearer secret for the internal status endpoint.

Configure these as Sites environment secrets during the later private deployment step; do not place real values in source control or chat.

## Gaming-PC collector

See `collector/README.md`. The collector is designed to:

1. detect whether `Data.p4k` changed;
2. extract into a temporary directory outside this repository;
3. discover Wikelo records from content instead of relying on an assumed internal path;
4. validate a `wikelo-normalized-v1` snapshot;
5. sign and upload it with replay-resistant headers.

The installer creates scheduled tasks only when you explicitly run it. Building or testing this repository does not modify Task Scheduler.

## Data semantics

- The active patch changes only after a complete validated import succeeds; failed imports leave the previous active patch visible.
- UEX `id_item` is the canonical marketplace identity; game UUIDs are optional secondary identifiers. Only an existing exact UEX item ID, exact game UUID, reviewed alias, or unique exact normalized-name mapping is accepted automatically.
- Matched recipe components expose their official UEX marketplace link, including Wikelo Favor at `id_item=4385`.
- Price selection prefers the lowest current terminal buy quote and falls back to the current quality-tier-zero marketplace buy average.
- Owned and farmable inputs contribute zero to the shopping cost.
- A missing price for a needed component marks the total incomplete. It is never silently treated as a zero-priced purchase.
- The active patch and two preceding patches are retained for rollback and comparison.

## Discord setup

Create a Discord application, add the exact `/auth/discord/callback` URI for the private integration deployment, and enable only the `identify` scope. The server exchanges the code, fetches identity, and discards Discord access and refresh tokens; it stores only Discord identity plus a hash of the app session token.

## Release sequence

1. Run all local checks.
2. Create an owner-only Sites deployment.
3. Configure secrets in Sites and add its exact callback URI in Discord.
4. Run a collector dry run, then one signed import.
5. Verify recipe freshness, UEX refresh, OAuth, logout, and cross-user preference isolation.
6. Request explicit approval before making the site public or installing scheduled tasks.

This is an independent community tool and is not affiliated with Cloud Imperium Games, Discord, or UEX Corp.
