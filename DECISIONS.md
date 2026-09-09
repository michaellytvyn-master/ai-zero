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

## 24. Three response modes, shared by both surfaces

Free tiers are metered in tokens, so a model that answers a one-line question
with five paragraphs is spending the day's allowance on padding. The control
sits under the composer on the site and in the panel.

| | Cap | Instruction |
|---|---|---|
| Eco | 400 tokens | answer in as few words as the question honestly needs |
| Thinking | 1 500 | work it through, then state the conclusion plainly |
| Max | 4 000 | complete answer, edge cases, examples, reasoning |

Two things make this real rather than decorative:

- **The cap is `max_tokens`, not just wording.** A prompt asking for brevity is
  a request; the cap is what actually protects the allowance when a model
  ignores it.
- **The definitions live in `@zca/shared`.** The site applies them server-side
  in `/api/chat`; the extension applies them before it calls the provider
  directly. One table, so the two surfaces cannot drift.

The mode's instruction goes ahead of any system message the caller already
added, because page context is material to read, not an instruction that should
override how to answer. A caller that set `maxTokens` deliberately keeps it.

The site remembers the choice in `localStorage` — a preference about how you
like answers, not a property of any one conversation. The extension keeps it per
tab, alongside that tab's model and page setting.

## 25. Voice input through Whisper on the same free tier

Groq serves `whisper-large-v3-turbo` on the same no-card tier as its chat
models: 20 requests/minute, 2 000/day, 28 800 audio-seconds/day, 25 MB a file.
Verified 2026-09-09 against the speech-to-text docs. So dictation costs nothing
and needs no new provider.

- Recording uses `MediaRecorder`, which produces WebM/Opus — one of the formats
  the API accepts, so nothing has to be transcoded.
- Recording stops itself after two minutes. A forgotten recording would eat the
  daily audio-seconds allowance, and the daily cap is per account.
- Audio is never written to disk or to the database. On the site it is streamed
  through `/api/transcribe` to the provider; in the extension with the user's
  own key it never touches the server at all. Only the text comes back, and it
  lands in the composer for the user to edit before anything is sent.
- Transcription on the shared pool claims a demo message, because it spends the
  operator's audio quota exactly the way a chat message spends tokens.
- Chrome will not show the microphone prompt inside a side panel, so the
  extension opens `mic.html`, a page whose only job is to ask for access and
  release the device again.

Transcription lives in its own small registry rather than as optional members
on `Provider`. Only one provider offers it, and widening the interface for
everyone to carry two members nobody else implements would have been worse.

**One bug this shook out.** The transcriber was taken from the module-level
const, which is built with the default base URL, so it ignored the
`GROQ_BASE_URL` override that the chat path honours. It is now constructed in
`router-deps` alongside the chat providers, from the same environment.

## 26. The panel belongs to the tab it was opened on

Decision 23 gave each tab its own panel document, but enabled the panel on every
tab, so switching tabs kept a panel open — a different chat, unasked for.

Now the global default is `enabled: false` and a tab is enabled only when the
user opens the panel there, by clicking the toolbar icon, the keyboard shortcut
or the context menu. Switch to a tab you never opened it on and Chrome closes
the panel; switch back and it is still there. `openPanelOnActionClick` is off,
because it opens the global panel everywhere and would defeat this — the click
is handled directly instead.

Which tab has it is visible in two places: a dot badge on the toolbar icon for
that tab, and the tab's own title along the top of the panel. The header's ✕
disables the panel for that tab and clears the badge.

## 27. One permission prompt, not one per site

Decision 22 asked for access per origin, which meant Chrome prompting on every
new domain. The request is now a single one covering `http://*/*` and
`https://*/*`, made the first time the user switches page reading on.

There is no per-tab grant to ask for — Chrome's permission model is by origin,
full stop — so the honest choice was between prompting constantly and prompting
once. Nothing is granted at install either way: the patterns stay in
`optional_host_permissions`, and `check-extension.mjs` fails the build if they
move into `host_permissions`.

## 28. The panel looks like a panel

Three stacked full-width dropdowns above the input read as a settings form
rather than a chat. The composer is now a bordered input row with the
microphone and send inside it, and a single line of small controls beneath —
answer length, page reading, model.

Messages are bubbles: the user's aligned right in the accent tint, replies in
bordered cards with the provider and model above them. The header carries
status as pills, and the tab this chat belongs to sits on its own line under
it. Verified in both light and dark against the built stylesheet.

## 29. A reply interrupted by a tab switch is not lost

Decision 26 made the panel belong to one tab, which exposed a gap in decision
21: Chrome destroys the panel document as soon as the user leaves the tab, and
the assistant's reply only reaches the database once it has finished streaming.
Switching tabs mid-answer therefore lost the answer outright — precisely the
case where "come back and it is still there" matters most.

The reply is now parked in `chrome.storage.session` under the tab's own key as
it streams, written at most twice a second so it survives the teardown without
thrashing storage. A panel opening on that tab again restores the partial reply
and files it in the database.

It compares the parked text against the conversation's last message before
filing, so a reply that did finish and was archived normally is not stored
twice.

## 30. `sidePanel.open` runs inside the gesture, or not at all

Opening the panel failed in Chrome with "`sidePanel.open()` may only be called
in response to a user gesture". The call was correct; its position was not.
`openOnTab` awaited `setOptions` and the badge update first, and a single await
moves the rest of the function into a later task, by which point Chrome has
discarded the gesture.

`openOnTab` is now a plain function that issues `setOptions` and `open` without
awaiting either. Chrome orders an extension's API calls, so enabling the tab
immediately before opening it is safe. The badge follows afterwards, since it
needs no gesture. The context menu writes its selection without awaiting for the
same reason, and the keyboard command takes the tab from the event rather than
calling `chrome.tabs.query`, which would also have to be awaited.

This class of mistake compiles, lints and passes every other test, and only
appears in a real browser. `background.test.ts` reads the source and asserts
there is no await before `open`, that `openOnTab` is not async, that no caller
awaits it, and that the command listener does not look the tab up. Putting the
await back fails two of them.

## 31. Generated images, and why they expire

Cloudflare's `@cf/black-forest-labs/flux-1-schnell` costs 4.8 neurons per
512×512 tile against the 10 000/day free allowance — roughly two thousand
pictures a day. The Leonardo models on the same platform cost 530 and 636
neurons per tile, which would spend the day in about a dozen. That ratio is the
whole reason flux is the default and the others are not offered.

Images go to Cloudinary and are **deleted an hour after they are made**, by a
sweep the schedule in `apps/web/vercel.json` calls every fifteen minutes. That
is stated in the composer before the first image and counted down under each
one, because a picture silently vanishing is worse than one that said it would.

The sweep deletes at Cloudinary first and marks the row only on success, so a
failed call is retried next time instead of leaving a file nobody will ever
clean up. The endpoint is guarded by `CRON_SECRET`.

The Cloudinary signature is a SHA-1 over parameters sorted by name, joined with
`&`, followed by the secret. `cloudinary.test.ts` checks it against the worked
example in Cloudinary's own documentation, which is the only way to be sure
without an account.

## 32. Users can call the service with their own keys

`/api/v1/chat/completions` already spoke the OpenAI format and already ran on
whichever provider keys the account holds. Making it usable from outside needed
only a key of our own: `zca_`-prefixed, stored as a SHA-256 hash so the table
cannot hand out working keys, shown once at creation.

Three things are deliberate:

- **An API key cannot create or revoke API keys.** That path requires a session,
  so a leaked key cannot make itself permanent.
- The `zca_` prefix distinguishes an API key from an extension token without a
  database round trip, so one lookup serves both.
- Requests made with a key run on that user's own provider keys and quota. This
  is a router in front of their accounts, not a resale of ours — which is also
  what keeps it inside Groq's and Cloudflare's terms.

`/api/v1/models` and `/api/health` were built in `router-core` back in phase 1
and never mounted as routes; the documentation page referenced a 404 until an
end-to-end check caught it.

## 33. Context windows are read from the provider, not from its documentation

Every model figure in the registry was copied out of a documentation page, which
is exactly the staleness hard constraint 4 warns about — and a question about
one of them was what surfaced it.

Providers publishing an OpenAI-style `/models` endpoint are now asked directly.
Groq returns `context_window` and `max_completion_tokens` per model; the answer
wins, cached in memory for an hour because this is metadata about a dozen
models, not per-user state. The recorded numbers remain as the fallback for
providers with no such endpoint, and as the record of what was true when
checked.

**The merge enriches; it never extends.** A provider's catalogue lists
everything a key can reach, including models that need a payment method. The
registry is the list that is free, and `registry.test.ts` asserts that. So live
data may correct a figure on a model already shipped and may not introduce a
new one. There is a test for that too, because getting it wrong would quietly
undo the project's premise.

For the record, since the two get conflated: Groq's gpt-oss models have a
131 072-token **context window** and the free tier allows 200 000 **tokens per
day**. Different things. Nothing on Groq has a 200k window.

## 34. Reading the web: links are fetched, search goes to a model that can

A model cannot browse. Two separate answers, because they are separate problems.

**A pasted link is read by the server** and handed to whatever model is
answering, as material rather than instruction. This works with every model,
including the small ones, because the fetching happens before the request.

**A request to search goes to `groq/compound`**, which runs web search
server-side on the same free tier and reports what it consulted. That is why no
search provider or API key was added: the capability was already in the
registry.

The reply lists the pages that were read, failures included, so an answer can be
checked against its sources rather than taken on trust.

### The part that needed care

Fetching a URL a user supplies is a request forgery primitive. Without checks
the server would happily read `169.254.169.254` — the cloud metadata endpoint,
where credentials live — or a database on localhost. So:

- Only `http` and `https`. No credentials in the authority.
- Every resolved address is checked against loopback, private, link-local,
  carrier-grade NAT, multicast and reserved ranges, in both IPv4 and IPv6, and
  through `::ffff:` mapping, which is the obvious way to smuggle a v4 address
  past a v6 check.
- **Every redirect hop is re-checked**, not just the first. A public host
  answering 302 with a private target is the other obvious way past a check.
- Two megabyte cap, twelve second timeout, four hops, and a content type that
  has to be a readable page.

A residual risk remains: DNS can change between the check and the connection.
Closing it entirely means connecting to the resolved address directly and
carrying the Host header, which is worth doing if this ever faces untrusted
users at scale.

Search stays off on the shared pool. It costs the operator more than a plain
answer and `groq/compound` has a lower daily ceiling than the chat models, so
hard constraint 2 still applies: the smallest model, whatever was asked for. The
toggle is disabled with that reason rather than silently ignored.

## 35. A ceiling on every account, not just the free pool

The question was whether many users' requests leaving one server IP would get
the service blocked. Checking rather than assuming:

- **Groq's limits are per organisation, not per IP**, stated plainly in its rate
  limit documentation, and no IP-based limit is documented at all. A thousand
  users with their own keys are a thousand separate quotas; routing them through
  one host does not pool them.
- **"One IP" is not what Vercel does.** Functions egress from a shared, rotating
  pool by default; a fixed address is a separate paid option.
- **The extension already avoids the question** for most bring-your-own-key
  traffic: it calls providers straight from the user's browser, on their own
  address. That was built for hard constraint 1, and distributing egress is a
  second benefit of it.

But the question exposed a real gap, and not the one asked about. **A user with
their own key had no ceiling here at all.** The demo cap only ever applied to
the shared pool, so a runaway script against the public API could push unbounded
traffic out through this server's egress — which is what would actually attract
attention, and would land on everyone sharing that egress rather than on the
account responsible.

Every route that reaches a provider now claims a slot first: chat, the
OpenAI-compatible endpoint, images, transcription and link reading. Sixty
requests a minute per account by default, `REQUESTS_PER_MINUTE_PER_USER` to
change it, answered with 429 and a `retry-after`.

It is the same conditional upsert the demo cap uses, because a burst is exactly
what a runaway client sends and a read-then-write check would let two requests
take the last slot. Forty simultaneous claims against a limit of ten leave
exactly ten, and there is a test that says so.

## 36. The product is software over the user's own accounts, and says so

The old copy read "Chat that runs on free provider tiers — 12 models across 2
providers, none of which asks for a credit card". That describes a service
supplying model access, which is the one thing Groq's terms forbid: §3.2 says a
customer "may not resell or lease access to its Account", and §6.3(c) forbids
selling, sublicensing or distributing the Cloud Services. What is permitted is
§3.1 — making them available to End Users through your own application.

The code always did the permitted thing. The copy described the forbidden one.

Everything user-facing now leads with the actual arrangement: the user registers
with the providers, the keys and quota are theirs, and this is the interface.
`/` says "Your keys. One interface." and carries a section titled "What this is,
and what it is not". `/privacy` opens by stating that this service does not run
models. `/terms` is new and says it outright. The store listing's first line is
now "This extension does not provide access to AI models and does not resell
it."

**One boundary has to stay sharp.** The daily trial is the only place the
operator's keys run, which §3.1 covers as End Users through an application. If
this ever charges money, the trial must remain outside every paid plan — the
moment somebody has paid for an allowance served by the operator's keys, that is
selling access to the operator's account, and §3.2 applies. Both `/terms` and
the store listing state that the trial is not part of any plan.

This is positioning, not billing. SPEC.md §2 still says "No paid tier, no
billing", and no payment code exists. The copy is simply now compatible with
adding one without having to be rewritten to stay lawful.
