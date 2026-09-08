# Zero-Cost AI Assistant

A personal AI assistant that runs on the free tiers of several LLM providers,
failing over automatically when one is rate limited or down.

Three surfaces over one core: an OpenAI-compatible router, a Chrome side-panel
extension, and a Next.js web app with a capped public demo and an admin
dashboard.

The brief is [SPEC.md](SPEC.md). Where the build departs from it, and why, is
[DECISIONS.md](DECISIONS.md) — read that before being surprised by anything.

## Status

**Phase 1 (router core) is done.** Phases 2-7 are not started.

| Phase | | |
|---|---|---|
| 1 | Router core: providers, failover, streaming | done |
| 2 | Extension MVP + sign-in | not started |
| 3 | BYOK direct mode | not started |
| 4 | Savings counter | not started |
| 5 | Page context and context menu | not started |
| 6 | Web app: auth, Postgres, demo, admin dashboard | not started |
| 7 | Ship | not started |

## Layout

```
packages/
  shared/       types and zod schemas crossing every boundary
  providers/    one file per provider + the shared OpenAI-compatible helper
  router-core/  failover state machine and a runtime-agnostic HTTP handler
scripts/        Phase 1 harness: a node:http server and provider stubs
docs/           provider verification log
```

`packages/router-core` has no Node or Next.js imports, so Phase 6 mounts it as
a route handler in one line and the failover stays testable on its own.

## Running it

```bash
pnpm install
```

Tests, including the failover state machine:

```bash
pnpm test
```

Drive the router against local stub providers — no API keys, no quota spent.
The argument is `port:mode:name`, where mode is `stream`, `429`, `401`, `500`
or `slow`:

```bash
./scripts/demo-phase1.sh "9001:429:mistral,9002:stream:groq" curl -sS -N -X POST http://localhost:8787/v1/chat/completions -H 'content-type: application/json' -d '{"model":"auto","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

Against real providers, copy `.env.example` to `.env`, add at least one key,
then:

```bash
pnpm dev:router
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

- No prompt or response content is logged. `UsageEvent` carries only provider,
  model, token counts, latency, status and timestamp, and a test asserts its
  exact key set.
- Provider keys never reach the router in BYOK mode; the extension calls the
  provider directly.
- Mistral's free Experiment tier requires opting into model training. Users are
  told this before they add a Mistral key.
