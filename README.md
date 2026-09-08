# Zero-Cost AI Assistant

A personal AI assistant that runs on the free tiers of several LLM providers,
failing over automatically when one is rate limited or down.

Three surfaces over one core: an OpenAI-compatible router, a Chrome side-panel
extension, and a Next.js web app with a capped public demo and an admin
dashboard.

The brief is [SPEC.md](SPEC.md). Where the build departs from it, and why, is
[DECISIONS.md](DECISIONS.md) — read that before being surprised by anything.

## Status

All seven phases of [SPEC.md](SPEC.md) are built.

| | | |
|---|---|---|
| Router core: providers, failover, streaming | done | 29 tests |
| Web app: Google auth, Postgres, encrypted key vault, chat with history, admin dashboard | done | 22 tests |
| Extension: sign-in through the site, side panel, BYOK direct mode, page context, context menu | done | 9 tests |
| Savings counter | done | 18 tests |
| Ship: licence, CI, icons, store listing | done | |

78 tests; 22 of them run against a real Postgres. CI runs lint, typecheck, the
full suite against a Postgres service container, and both builds on every push.

Outstanding, and honest about it: the store screenshots and the README
recording need a real signed-in Chrome profile, so they are a checklist in
[store/screenshots.md](store/screenshots.md) rather than files. The Cloudflare
adapter is written but not registered, because its model identifiers were not
in the public docs — see [docs/providers.md](docs/providers.md).

## Layout

```
packages/
  shared/       types, zod schemas and the named-event SSE reader
  pricing/      dated reference prices + the savings arithmetic
  providers/    one file per provider + the shared OpenAI-compatible helper
  router-core/  failover state machine and a runtime-agnostic HTTP handler
apps/
  web/          Next.js: auth, key vault, chat, admin, and the router mounted
                as route handlers
  extension/    Manifest V3 side panel, Vite + React
scripts/        Phase 1 harness, plus the icon generator
store/          Chrome Web Store listing text and permission justifications
docs/           provider verification log
```

`packages/router-core` imports nothing from Node or Next.js, which is why the
extension can run the very same failover engine in the browser when it calls
providers directly.

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

## The extension

```bash
pnpm --filter @zca/extension build
```

Then load `apps/extension/dist` at `chrome://extensions` with developer mode on
and "Load unpacked". Open the side panel from the toolbar icon or with
Ctrl/Cmd+Shift+Y, and sign in — it opens this site's authorize page, so the web
app must be running first.

Two modes, chosen automatically:

- **You have added a key** — the extension calls the provider straight from
  your browser. DevTools shows requests to `api.groq.com`, not to this site,
  and it keeps working for seven days if our server goes down.
- **You have not** — it routes through the site and spends from the shared
  demo pool, capped per account per day.

Point it at a deployed site with `VITE_SITE_URL`, and add that origin to
`host_permissions` in `public/manifest.json`.

The icons in `public/icons` are flat placeholder squares. Phase 7 replaces them.

## Providers

Verified 2026-09-08. Full sources and caveats in
[docs/providers.md](docs/providers.md) — the figures in SPEC.md are stale.

| Provider | Priority | Card needed | Verified free allowance | Models |
|---|---|---|---|---|
| Groq | 10 | no | 30 RPM, 1 000 req/day, 200K tokens/day | 6 |
| Cloudflare Workers AI | 20 | no | 10 000 neurons/day | 6 |

Nothing that needs a credit card ships, and a test asserts every registered
model is on a free tier so one cannot creep back in. Cerebras was removed when
it retired its no-card tier; Mistral when its console stopped offering free
models. Both are documented in [docs/providers.md](docs/providers.md).

Cloudflare's credential is two values, `<account id>:<api token>`, because the
account id is part of its URL.

Twelve models in total, and you pick which one answers. The choice is per
message, so you can continue an existing conversation on a different model —
the history lives in the database, not in the model. On the shared demo pool
the smallest model is used, per SPEC.md's cap.

Groq's terms explicitly permit serving end users through your own application
and forbid transferring keys to them; Cloudflare's do not restrict it. Demo
mode is the former; it is never the latter.

## The savings counter

`/savings` on the site, and a badge in the extension panel, showing what the
same token counts would have cost on a paid model.

It is computed from the `usage_event` table, so the site and the extension
always agree. Three things keep it honest, and tests hold two of them in place:

- the default reference is the **cheapest** model in `packages/pricing/src/prices.json`,
  because free tiers serve small open models and pricing them against a
  flagship would inflate the figure without measuring anything different
- every price carries the date it was read and the page it came from
- failed requests are excluded — no tokens, no cost, and counting them would
  pad the request number with answers nobody received

Arithmetic is in integer micro-dollars, so the per-provider breakdown sums
exactly to the headline figure. You can switch the reference model on the page
to see the range; the wording stays "estimated cost", never "money earned".

Re-check the prices periodically and update the `checkedOn` stamps.

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

## Development

```bash
pnpm lint          # biome, checks formatting too
pnpm format        # biome, writes fixes
pnpm typecheck     # tsc across every package
pnpm test          # unit tests; integration tests skip without a database
pnpm test:db       # everything, against postgres://localhost:5432/zca_dev
pnpm icons         # regenerate the extension icons
node scripts/check-env.mjs   # .env.example must cover every configured variable
```

CI runs all of the above plus both production builds. The integration suite
skips itself when `TEST_DATABASE_URL` is unset, which would make an
unreachable database look like a pass, so the workflow asserts the connection
before running it.

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## Publishing the extension

`store/listing.md` holds the description, the single-purpose statement, a
justification for every permission, and the answers to the data-use form.
`store/screenshots.md` is the capture checklist. Before publishing, replace
`http://localhost:3000/*` in `apps/extension/public/manifest.json` with the
production origin and build with `VITE_SITE_URL` set to match.

## Licence

MIT. See [LICENSE](LICENSE).
