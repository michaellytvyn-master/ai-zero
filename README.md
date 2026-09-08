# Zero-Cost AI Assistant

A personal AI assistant that runs on the free tiers of several LLM providers,
failing over automatically when one is rate limited or down.

Three surfaces over one core: an OpenAI-compatible router, a Chrome side-panel
extension, and a Next.js web app with a capped public demo and an admin
dashboard.

The brief is [SPEC.md](SPEC.md). Where the build departs from it, and why, is
[DECISIONS.md](DECISIONS.md) — read that before being surprised by anything.

## Status

Router core and the web app are done. The extension is next.

| | | |
|---|---|---|
| Router core: providers, failover, streaming | done | 29 tests |
| Web app: Google auth, Postgres, encrypted key vault, chat with history, admin dashboard | done | 22 tests, 9 against a real database |
| Chrome extension: sign-in through the site, side panel, BYOK direct mode | not started | |
| Savings counter | not started | |
| Page context and context menu | not started | |
| Ship: store listing, CI, licence | not started | |

## Layout

```
packages/
  shared/       types and zod schemas crossing every boundary
  providers/    one file per provider + the shared OpenAI-compatible helper
  router-core/  failover state machine and a runtime-agnostic HTTP handler
apps/
  web/          Next.js: auth, key vault, chat, admin, and the router mounted
                as route handlers
scripts/        Phase 1 harness: a node:http server and provider stubs
docs/           provider verification log
```

`packages/router-core` imports nothing from Node or Next.js, so the failover
stays testable on its own and could move to another runtime later.

## Running it

```bash
pnpm install
```

Then set up the web app. Copy `.env.example` to `apps/web/.env.local` and fill
in a database URL, Google OAuth credentials, and an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Create the schema and start the app:

```bash
pnpm db:push && pnpm dev
```

Tests. The second command also runs the integration suite, which is skipped
without a database:

```bash
pnpm test
```

```bash
createdb zca_dev && pnpm db:push && pnpm test:db
```

The Phase 1 router harness still works on its own, driven against local stub
providers so no free-tier quota is spent. Modes are `stream`, `429`, `401`,
`500` and `slow`:

```bash
./scripts/demo-phase1.sh "9001:429:mistral,9002:stream:groq" curl -sS -N -X POST http://localhost:8787/v1/chat/completions -H 'content-type: application/json' -d '{"model":"auto","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

## Providers

Verified 2026-09-08. Full sources and caveats in
[docs/providers.md](docs/providers.md) — the figures in SPEC.md are stale.

| Provider | Priority | Free tier | Verified free allowance |
|---|---|---|---|
| Mistral | 10 | yes, no card | ~1B tokens/month, Experiment tier |
| Groq | 20 | yes, no card | 30 RPM, 1 000 RPD, 200K TPD |
| Cerebras | 30 | **no longer** | $5 trial credit, card required, 30-day expiry |

Cerebras retired its no-card free tier in August 2026, so it is demoted to last
and all its models are marked `free: false`. SPEC.md ranks it second on speed;
that ranking predates the change.

Both Mistral's and Groq's terms explicitly permit serving end users through
your own application, and forbid transferring keys to them. Demo mode is the
former; it is never the latter.

## Privacy properties held by the code

- Provider keys are encrypted with AES-256-GCM before they reach Postgres. The
  key that opens them lives in `KEY_ENCRYPTION_KEY`, never in the database, so a
  dump on its own yields nothing. Tests assert the stored column contains no
  trace of the plaintext.
- Usage records carry only provider, model, token counts, latency, status,
  timestamp and whose key paid. A test asserts the exact key set, so adding a
  content field breaks the build.
- The admin dashboard never joins to the messages table, and 404s for anyone
  not in `ADMIN_EMAILS`.
- One account cannot load another's conversation. There is a test for it.
- The demo cap is claimed with a conditional upsert. A test fires 25 concurrent
  requests at a limit of 10 and asserts exactly 10 get through.

See [DECISIONS.md](DECISIONS.md) for where these depart from SPEC.md, and
[/privacy](apps/web/src/app/privacy/page.tsx) for what users are told.
