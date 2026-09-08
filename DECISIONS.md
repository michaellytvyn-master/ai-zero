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

## 10. Keys and chat history live in Postgres

Supersedes decision 1's split and hard constraint 1's storage rule.

- A user adds provider keys in their account panel on the site. Keys are
  **encrypted at rest in Postgres** (AES-256-GCM) and synced to every device
  and to the extension. localStorage was rejected: it cannot follow the user
  to a second machine.
- The encryption key comes from `KEY_ENCRYPTION_KEY` in the environment and is
  never stored in the database. A database dump alone must not yield anyone's
  provider credentials.
- Plaintext keys exist only in memory for the duration of one request, and are
  still never logged.
- **Chat history is stored server-side**, per user, and shown in their own
  account panel.

Hard constraint 3 still holds where it was aimed: operational logs and the
admin dashboard carry provider, model, token counts, latency, status and
timestamp, and no message content. A user's own conversations are product data
they own and can delete, not telemetry.

`/privacy` must be rewritten. It can no longer claim keys stay on the device or
that prompts are never stored. It must say: conversations are saved to your
account, keys are encrypted at rest, and free provider tiers may train on
submitted content.

## 11. The web app is the primary surface, and ships first

The site is a full ChatGPT-style chat behind sign-in, not only the capped demo
of SPEC.md §10. The extension authenticates through the site, so SPEC.md §12's
order is reversed: web app foundation (auth, Postgres, key vault, chat) before
the extension.

Demo mode's 10-per-day cap still applies to operator keys. A user with their
own key is not billed against the pool.

## 12. Free provider pool, verified 2026-09-08

Operator keys: **Mistral, Groq, Cloudflare Workers AI** — all free with no card
and no geographic restriction on serving end users.

Excluded from the operator pool, available as BYOK:

- **Gemini** — Google's terms require a paid tier once the app is available to
  users in the EEA, Switzerland or the UK, which a public site is.
- **OpenRouter** — 50 requests/day without buying credits; terms unverified.
- **Cerebras** — no longer free (see docs/providers.md).
- **NVIDIA NIM** — finite signup credits, so a trial rather than a free tier.

## 13. The extension holds plaintext keys, because direct mode requires it

Decision 10 moved keys into Postgres so they follow the user between devices.
Decision 6 chose a grace period in which the extension keeps working on the
user's own key while our server is unreachable. Those two together force a
third thing: `GET /api/extension/me` returns the caller's own provider keys in
plaintext, over TLS, to a valid bearer token, and the extension caches them in
`chrome.storage.local`.

There is no way to have both "keys sync from my account" and "BYOK survives
your downtime" without the key reaching the client. What is bounded instead:

- a token unlocks only the keys of the user it belongs to
- only the hash of a token is stored, so the table cannot hand out working ones
- tokens are revocable and expire, and the extension can revoke its own
- the endpoint sets `cache-control: no-store` and logs nothing

If direct mode is ever dropped, this endpoint should stop returning `key` and
the extension should route everything through `/api/v1/chat/completions`, which
already accepts the same bearer token.

## 14. Extension sign-in is a redirect-bounded web flow

`chrome.identity.launchWebAuthFlow` finishes when the browser reaches a URL
under the extension's own `chromiumapp.org` origin. `/extension/authorize`
therefore refuses any `redirect_uri` that does not match
`https://<32 letters a-p>.chromiumapp.org/`, because a laxer check would make
the page an open redirect that leaks a bearer token. A `state` value is echoed
back and compared in the extension.

## 15. The savings counter reads from the database, and defaults to the cheapest reference

SPEC.md §8 stored totals in `chrome.storage.local` / `localStorage` because
there was no server-side record. Decisions 1, 4 and 10 moved usage into
Postgres, so the counter is computed from `usage_event` instead. That makes it
consistent across devices and between the site and the extension, and it is
the same table the admin dashboard reads — one source of truth, no drift.

Three honesty properties are deliberate, and two of them are enforced by tests:

- **The default reference is the cheapest model in the table.** The free tiers
  serve small open models; pricing them against a flagship would inflate every
  user's total without measuring anything different. A test asserts the default
  is the cheapest entry, so it cannot be quietly changed.
- **Every price carries the date it was read and the page it came from.** A
  test asserts both are present on every entry.
- **Failed requests are excluded.** They produced no tokens, so they cost
  nothing; counting them would pad the request number with answers nobody got.

Arithmetic is in integer micro-dollars rather than floating point, so the
per-provider breakdown always sums exactly to the headline figure.

Copy is fixed as "estimated cost if the same tokens had run on X ... an
estimate, not money you earned", per SPEC.md §8.

## 16. A provider that needs a credit card does not ship

The premise is that this costs nothing. A payment method is the point where
that stops being true, however good the provider is, so the registry carries
only providers reachable on a free tier without a card.

Applied on 2026-09-08:

- **Cerebras removed.** Its no-card tier was retired in August 2026, leaving $5
  of trial credit behind a verified payment method. The adapter was deleted
  rather than left dormant, so nothing can quietly re-enable it.
- **Cloudflare Workers AI added.** 10 000 neurons/day, no card. Its model
  identifiers were finally located in the pricing tables; the ones needing a
  billing method (Kimi, GLM, DeepSeek v4) are deliberately excluded and a test
  guards against them by name.
- **Mistral kept.** No card. It does ask for phone verification and, on the
  free tier, for permission to train on submitted content. Both are stated in
  the README and on `/privacy` rather than glossed over.

`registry.test.ts` asserts every shipped model is on a free tier, so this is
enforced rather than remembered.

Cloudflare's credential is two values because its account id sits inside the
URL. The adapter takes `<account id>:<api token>` and splits it, keeping the
special case in one file instead of widening the Provider interface.

## 17. Configuration is validated in slices, not all at once

The first version parsed every environment variable on the first call to
`config()`, and `db()` called it. A missing `AUTH_GOOGLE_ID` therefore took down
the landing page, the privacy page and everything else, with a stack trace
rather than an explanation. That was wrong: the landing page needs neither
Google nor a database.

Configuration is now five independent slices — database, session secret, Google
credentials, key vault, runtime tuning and operator keys — each parsed on first
use by whatever needs it. Three consequences:

- The site runs with only `DATABASE_URL` set. `/signin` explains what is
  missing instead of the app crashing.
- Reading an existing session needs `AUTH_SECRET` and a database. Only
  *starting* one needs the Google credentials, so reconfiguring sign-in does
  not log everyone out.
- `scripts/check-env.mjs` fails the build when `.env.example` stops covering
  the schema, which is how the missing `CF_*` entries were found.

## 18. Twelve models, picked per message

Groq and Cloudflare each expose several free models, so all of them are
offered rather than one per provider. `listModels()` returns them qualified as
`provider:model`, grouped by provider.

The picker sits next to the composer on both surfaces. Because history lives in
the database and not in the model, changing the selection mid-conversation just
works: the next reply comes from the new model with the full prior context, and
each stored message records which provider and model produced it. Reopening a
conversation preselects whatever answered last.

The reply is labelled with the provider that *actually* answered, which can
differ from the pick when that provider was rate limited and failover stepped
in.

This also closed a gap in hard constraint 2, which requires the shared demo
pool to use the smallest model only. It was never enforced. `effectiveModel()`
now clamps demo requests to `smallestFreeModelId()`, and the picker is disabled
with an explanation for users who have not added a key.

## 19. Email and password, alongside Google

SPEC.md §2 forbade an auth system, §1 then asked for Google. Neither described a
password login, so the first build had Google only — which meant no account at
all when Google was not configured. That is not a usable product.

Both methods now land on the same account:

- **Passwords are hashed with scrypt from `node:crypto`.** A memory-hard KDF
  that ships with the runtime, so no bcrypt or argon2 dependency, per SPEC.md
  §14. N=2^15, r=8, and `maxmem` raised because 128·N·r is exactly Node's
  default ceiling. The envelope records its own parameters, so they can be
  raised later without invalidating existing hashes.
- **Sessions moved from database to JWT.** Auth.js cannot issue a database
  session from a credentials provider, and running two session models would be
  worse. The extension's bearer tokens are unaffected — they were always
  separate.
- **Google keeps `allowDangerousEmailAccountLinking`.** It is only dangerous
  when the provider does not verify email ownership; Google does. Without it,
  registering with an address and later using Google on the same address
  produces two accounts.
- **Failures are indistinguishable.** A wrong password, an unknown address and
  a Google-only account all return the same null, and an unknown address is
  compared against a decoy hash so the response time matches. Otherwise sign-in
  becomes a way to enumerate who has an account.

Google is now optional rather than required. Without it the sign-in page omits
the button and everything else is unchanged.

## 20. One dashboard, not scattered pages

`/account` and `/savings` were top-level pages reached from a link bar, and the
landing page was three buttons. Everything belonging to a signed-in person now
lives under `/dashboard` with its own sidebar:

- `/dashboard` — requests, estimated cost avoided, tokens, remaining free
  messages, which providers are connected, recent chats
- `/dashboard/keys` — provider connections
- `/dashboard/settings` — password, and the browser extensions signed in to the
  account, each revocable
- `/dashboard/usage` — savings and the per-provider breakdown

The landing page is a real page: what it is, how it works in three steps, every
model on offer with its context size, how the savings estimate is calculated and
why it is deliberately conservative, and what is stored.

## 21. One chat per tab, and extension chats are stored

The side panel is a single document, so every tab shared one conversation and
switching tabs carried the previous chat along with it. It also kept its
history only in memory, so nothing it produced appeared on the site and closing
the panel lost it.

Both are fixed together, because per-tab chats are only useful if they survive:

- The panel binds to the tab in front. Each tab keeps its own conversation id,
  draft, model and page-context setting, so switching tabs switches chats and
  coming back restores the one that was there. The header names the tab, and
  "New chat" starts a fresh one for that tab only.
- Bindings live in `chrome.storage.session`, not `local`. Tab ids only mean
  anything while the browser is running; a binding that outlived a restart
  would attach an old conversation to an unrelated new tab.
- The background worker drops a tab's binding when the tab closes. The
  conversation itself stays — it belongs to the account, not the tab.
- `/api/conversations` lets the extension create, read and append. It needs
  this because in direct mode it calls the provider itself and holds the only
  copy of the exchange.

Every one of those endpoints loads the conversation as the requesting user
first, so another account gets 404 rather than 403 — a 403 would confirm the id
exists. The append schema is strict, so a client cannot widen a stored message
with fields of its own.

## 22. Page access is asked for per site, not granted at install

SPEC.md §9 says to prefer `activeTab` over broad host permissions. That was the
right instinct and the wrong mechanism here: `activeTab` grants access only to
the tab the user invoked the extension on, and it lapses on navigation. The
panel outlives both — it stays open across tab switches and reads the page at
send time — so Chrome answered with "Cannot access contents of the page".

`activeTab` is gone. `http://*/*` and `https://*/*` sit in
`optional_host_permissions`, which grants nothing at install. Switching page
reading on calls `chrome.permissions.request` for **that one site's origin**;
Chrome prompts, and declining flips the control back off with an explanation.

The request fires straight from the click, without awaiting a `contains` check
first, because Chrome only prompts inside a user gesture. An already-granted
origin resolves true with no prompt, so the check would have bought nothing.

Subdomains stay separate: granting `docs.example.com` does not cover
`api.example.com`. `scripts/check-extension.mjs` fails the build if a broad
pattern is ever moved into `host_permissions`, where it would be granted up
front.

`tabs` was added, because binding a chat to a tab and naming that tab needs its
title and URL.

## 23. A separate panel document per tab, not one that swaps state

Decision 21 gave each tab its own conversation, but through a single shared
panel document that swapped state on `tabs.onActivated`. That is not the same
thing: one document means one React tree, one in-flight request, and a chat that
is only ever *restored* onto a tab rather than living there.

The background worker now assigns every tab its own panel path,
`sidepanel.html?tabId=<id>`. A distinct path is what makes Chrome instantiate a
separate side panel document per tab, so two tabs hold two genuinely independent
panels, each with its own state and its own streaming request.

Consequences worth stating:

- The panel learns which tab it belongs to from its own URL and never asks which
  tab is active. It therefore cannot follow the user to another page.
- Page extraction names that tab id explicitly, so a panel can only ever read
  its own tab — not whichever happens to be in front when the request lands.
- The context menu stores its selection under `quote:<tabId>`, so a quote
  captured on one tab cannot surface in another tab's composer.
- Browser-internal pages get `enabled: false` rather than a panel that cannot
  work.
- `panelTabId` parses strictly. `parseInt` would read "1.5" as 1 and "12x" as
  12, and a panel pointed at the wrong tab reads the wrong page.

Tabs that already exist when the extension is installed or the browser starts
are bound in `onInstalled` and `onStartup`; new ones in `onCreated`.
