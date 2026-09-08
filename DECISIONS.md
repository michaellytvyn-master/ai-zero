# Decisions that amend SPEC.md

SPEC.md is the brief. This file records where the build knowingly departs from
it, and why. Nothing here was decided unilaterally except the entries marked
*(implementer's call)*.

## 1. Accounts exist. §2 and §8 are amended.

SPEC.md §1 asked for Postgres, NextAuth, Google auth and an admin analytics
dashboard. §2 forbade accounts, a database and an auth system, and §8 said
there is no server-side aggregate of user data. Those cannot both hold.

Resolution:

- A Google account on the main web service is **required**, on both surfaces.
- The Chrome extension is gated too: install it, sign in to the main service
  from inside it, then use it.
- §2's "no accounts, no auth system" and §8's "no server-side aggregate" no
  longer apply. `/privacy` and the README must say so plainly.

**Hard constraint 1 survives intact.** A session token is not a provider key.
Provider keys stay in `chrome.storage.local` and go straight to the provider.

## 2. One Next.js app, not Hono on Cloudflare Workers

SPEC.md §4/§5 put the router on Workers with KV cooldowns. With Postgres and
NextAuth in the picture, that meant two deploys and two secret stores for no
gain. The router is Next.js route handlers on Vercel; Postgres holds cooldowns
and usage instead of Workers KV.

`apps/router` therefore does not exist. Its logic lives in
`packages/router-core` as a runtime-agnostic `Request -> Response` handler, so
Phase 6 mounts it in one line and the failover stays unit-testable without
Next.js. Workers remains possible later; nothing in the core imports Node.

The `cloudflare` provider is unaffected — Workers AI is an HTTP API and needs
no Workers deploy.

## 3. The demo is behind sign-in, capped per account

SPEC.md §3 capped demo mode at 10 messages per IP per 24h. IP caps fall to any
VPN. The cap is now 10 messages per **account** per 24h. The cap itself is
unchanged, and the exhausted-cap behaviour is exactly as specified: no error,
a prompt to add a free personal key with per-provider signup links.

## 4. BYOK sends usage metadata, never keys or content

Direct BYOK calls bypass the server, so the dashboard would otherwise show
zeros for the most active users. After each direct call the extension posts
metadata only: provider, model, token counts, latency, status, timestamp.

This is the exact field set hard constraint 3 permits. `UsageEvent` has no
content field and a test asserts its key set, so adding one breaks the build.

## 5. Admin dashboard shows per-user rows, metadata only

Email, signup date, request count, token totals, provider mix, last active,
plus aggregate charts. No prompt or response content, ever. Admins come from
an `ADMIN_EMAILS` allowlist.

## 6. Extension sign-in and offline behaviour

- `chrome.identity.launchWebAuthFlow` against our own NextAuth, **not**
  `chrome.identity.getAuthToken` — the latter binds to the Chrome profile's
  Google account, and the requirement is an account on the main service.
- The token is cached in `chrome.storage.local` and refreshed in the
  background. If the server is unreachable the extension keeps working on the
  user's own key for a **7-day grace period**, then requires a fresh sign-in.
  Our uptime must not break somebody else's BYOK.
- Registration is open: any Google account works immediately.

## 7. Cerebras is demoted and not marked free *(implementer's call)*

Cerebras retired its no-card free tier in August 2026; see
`docs/providers.md`. SPEC.md ranked it priority 2 on speed. It is now last,
and all its models are `free: false`, because it cannot carry a zero-cost
promise. The adapter still works for anyone holding credits.

**This needs a product decision:** keep it as an opt-in for paying users, or
drop it and promote a genuinely free provider into the slot.

## 8. Model ids are `provider:model` *(implementer's call)*

SPEC.md does not say how a request picks a provider. Groq's own model ids
contain slashes (`openai/gpt-oss-20b`), which rules out `provider/model`.

- `auto` — each provider's first model, so failover can switch freely
- `groq:openai/gpt-oss-20b` — pins one provider
- `openai/gpt-oss-20b` — any provider offering that id

## 9. Provider base URLs are injectable *(implementer's call)*

Each adapter is a factory taking a base URL that defaults to the verified
value. §11 wants nothing hardcoded in logic, and it lets the failover chain be
driven against local stubs without spending free-tier quota.
