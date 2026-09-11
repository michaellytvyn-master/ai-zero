# Features, in depth

The [README](../README.md) is the short version. This is everything behind it — what each feature
does, the numbers it runs on, and the choices that are not obvious from the outside.

- [Where your data lives](#where-your-data-lives)
- [The extension](#the-extension)
- [Acting on a page](#acting-on-a-page)
- [Response modes and reasoning](#response-modes-and-reasoning)
- [Reading the web](#reading-the-web)
- [Images](#images)
- [Your own API](#your-own-api)
- [Voice input](#voice-input)
- [The savings counter](#the-savings-counter)
- [Accounts](#accounts)
- [The operator area](#the-operator-area)
- [Rate limiting](#rate-limiting)
- [Privacy properties held by the code](#privacy-properties-held-by-the-code)
- [The site: mobile and search engines](#the-site-mobile-and-search-engines)

## Where your data lives

Two databases, with a line between them.

| | Kept here | Never here |
|---|---|---|
| **The operator's** | Accounts, the encrypted key vault, trial allowances, per-request usage counts (no text), and — only for someone who has not connected their own — the newest 20 messages | Conversations of anyone with a database of their own |
| **The user's own** | Every conversation and message, in two tables prefixed `zca_` | Anything else of the service's |

A user connects their Postgres under **Settings → Provider keys** by pasting its address. The server
then, in order: checks the address, connects, creates the two tables, copies any trial history
across keeping its ids (so a retry duplicates nothing), saves the address encrypted in the vault, and
deletes the trial copy from its own database. If the user's database later stops answering, requests
fail with a message saying so — nothing falls back to writing their conversations into the
operator's database instead.

Connecting to an address a user typed is a request-forgery primitive, like fetching a link. So:

- the host is resolved once and **every** address it resolves to must be public — a name with one
  public and one private record is refused, not a coin toss;
- the connection goes to that resolved address, so a name that changes its answer between the check
  and the connection (DNS rebinding) is never looked up again, while TLS still validates the
  certificate against the real name;
- TLS is required — `sslmode=disable` is refused, `sslmode=require` encrypts without checking the
  certificate, and anything else verifies it;
- pools are small (two connections), statements time out after ten seconds, and connecting is rate
  limited like any provider call.

Each rule has a test, and each test was checked by breaking the rule and watching it fail. A local,
unencrypted Postgres is allowed only with `USER_DATABASE_INSECURE_LOCAL=true`, and never when
`NODE_ENV` is `production`.

What the model provider sees is not changed by any of this: a message still goes from this server to
the model that answers it. The user's database decides where history is *kept*, not who reads a
message on its way to an answer.

## The extension

Each tab gets its own panel, and only the tabs you opened it on have one. Click the toolbar icon on
a tab and the panel opens there; a dot appears on the icon for that tab, and the panel names the tab
it belongs to. Switch to a tab you never opened it on and the panel is simply not there; switch back
and your chat is still running. The ✕ closes it for that tab alone. Chats go to the same place as
the site's — your own database, or the trial — so they show up in both.

Tabs with a panel open are collected into a named tab group, so you can see at a glance which they
are. A toggle in the header turns that off.

Reading the page is off until you turn it on, and the first time you do, Chrome asks once for access
to websites. The extension ships with access to none. Chrome has no per-tab grant, so the choice was
between a prompt on every new domain and a single one; it asks once.

Two modes, chosen automatically:

- **You have added a key.** The extension calls the provider straight from your browser. DevTools
  shows requests to `api.groq.com`, not to this site, and it keeps working for seven days if the
  server is unreachable — the session is cached, marked *offline* in the header.
- **You have not.** It routes through the site and spends from the shared trial allowance, capped
  per account per day.

The price of the first mode, stated plainly: the extension holds your provider keys in
`chrome.storage.local` so it can call providers itself. That is what keeps the keys out of any
intermediary, and it is also why a signed-in extension works offline.

Point it at a deployed site with `VITE_SITE_URL` at build time, and put that origin in
`host_permissions` — see [store/PUBLISHING.md](../store/PUBLISHING.md).

## Acting on a page

Switch on **Act** and the panel acts rather than answers: it follows links, types into fields,
chooses from dropdowns, presses Enter to search, scrolls, goes back, opens addresses you give it and
reads what the page says. It needs the same site access as page reading and switches itself off if
that access is revoked.

Each step shows the model a numbered list of the page's controls — about 1 000 tokens where the raw
HTML of the same page is 399 000 — and the model answers with the number of the one to use. Twelve
steps at most, because each re-sends the page and a free tier is metered by the day.

What it will and will not do:

| | |
|---|---|
| **Never** | Type a password, CVV, PIN or one-time code, or anything shaped like a card number, whatever the page or you say. Open a `javascript:`, `file:`, `chrome:` or `data:` address. |
| **Asks you first** | Submitting a form, pressing anything named send / buy / order / pay / delete / publish / transfer, Enter in a field that is not a search box, and opening any address the model composed itself rather than one the page links to or you wrote. |
| **Just does it** | Following a link the page offers, typing into an ordinary field, choosing an option, scrolling, going back, searching. |

The reasoning behind each rule, and how each was measured on a live page, is in
[agent.md](agent.md). Nothing from an Act session is stored on your account.

## Response modes and reasoning

Under the composer, on both the site and the panel: **Eco**, **Thinking** and **Max**. Each sets a
system instruction and a hard ceiling on the reply — the wording is a request, the ceiling is what
actually protects a metered free tier.

| Mode | Answer ceiling | Extra for a reasoning model | Effort passed to the provider |
|---|---|---|---|
| Eco | 400 tokens | 1 500 | low |
| Thinking | 1 500 | 3 000 | medium |
| Max | 4 000 | 8 000 | high |

The second column exists because providers count a model's thinking against the same `max_tokens`
as its answer. Without it, a reasoning model given 400 tokens spends all of them thinking and is cut
off before the answer begins. Ordinary models never see the extra.

Reasoning arrives in three shapes, and all three are handled: in a dedicated field (Groq's
`reasoning_format: "parsed"`, or `include_reasoning` for GPT-OSS — the two are mutually exclusive),
inside the text as `<think>…</think>` (Cloudflare's QwQ), or not at all (Gemini keeps it to itself).
The `<think>` splitter is streaming-safe: a tag cut across two chunks — `<thi` then `nk>` — is still
found. The thinking is shown small and open while it streams, collapsed once the answer starts, and
never stored.

The definitions live in `@zca/shared`, applied by the server for the site and by the extension
before it calls a provider directly, so the two cannot drift apart.

## Reading the web

No model can browse, so there are two separate answers.

**Paste a link** into any message and the server fetches it, extracts the readable text and hands it
to whichever model is answering. Works with every model. The reply lists the pages it read, failures
included.

**Tick "search the web"** and the turn goes to `groq/compound`, which searches server-side on the
same free tier — which is why this needed no search provider and no extra key. It stays off on the
shared trial, because it costs more than a plain answer and has a lower daily ceiling.

Fetching a user-supplied URL is a request-forgery primitive, so the fetcher refuses loopback,
private, link-local, CGNAT, multicast and reserved addresses in IPv4 and IPv6, sees through `::ffff:`
mapping, and re-checks **every redirect hop** rather than only the address that was typed. There is a
test for each, the cloud metadata endpoint included.

## Images

Ask for a picture with the toggle above the composer. Generation runs on Cloudflare's
`flux-1-schnell` — about 4.8 neurons a tile against 10 000 a day free, so roughly two thousand
images — and the result is stored on Cloudinary. Where depends on you:

- **Connect your own Cloudinary account** under Settings → Provider keys (`cloud_name:api_key:api_secret`),
  and pictures are written there and **never deleted by this service**. They are in your account,
  on your free tier. Disconnecting leaves them where they are.
- **Otherwise** they go to the operator's shared pool, which is for trying the feature, not for
  keeping anything: **five a day, each deleted 30 minutes after it is made**, counted down under
  each one.

The sweep that empties the shared pool checks two things before deleting — that the row belongs to
the operator's storage *and* that it has an expiry — and was proven against a real database not to
touch a user's picture even when one carried a stale expiry.

Set `CLOUDINARY_*` and `CRON_SECRET` to enable the shared pool; without them only your own account
works.

## Your own API

`/settings/api` issues `zca_` keys for calling this service from your own code. The endpoint is
OpenAI-compatible, so any client that accepts a base URL works:

```bash
curl https://your-domain/api/v1/chat/completions -H "Authorization: Bearer zca_..." -H "Content-Type: application/json" -d '{"model":"auto","messages":[{"role":"user","content":"hello"}]}'
```

Requests run on the provider keys **your** account holds, so it is a router in front of your own
quota rather than a resale of anyone's. Keys are stored as hashes and shown once. An API key cannot
create or revoke other keys — that needs a session, so a leaked key cannot entrench itself.

A reasoning model's thinking is returned as `delta.reasoning`, the field Groq and DeepSeek already
use. A client reading only `content` sees the answer alone.

## Voice input

A microphone button beside the composer on both surfaces. Recording is capped at two minutes,
transcribed by Whisper on Groq's free tier — 2 000 requests and 28 800 audio-seconds a day — and
dropped into the box as text for you to edit before sending.

Audio is never written to disk or to the database. With your own key it goes straight from the
browser to the provider; without one it passes through the site and spends from the trial
allowance.

Chrome will not show the microphone prompt inside a side panel, so the extension opens a small page
that can ask. It requests access once and closes.

## The savings counter

On the settings overview and under Settings → Limits, and as a badge in the panel: what the same
token counts would have cost on a paid model. It is computed from the usage table, so the site and
the extension always agree. Three things keep it honest:

- the default reference is the **cheapest** model in `packages/pricing/src/prices.json`, because
  free tiers serve small open models and pricing them against a flagship would inflate the figure
  without measuring anything different;
- every price carries the date it was read and the page it came from;
- failed requests are excluded — no tokens, no cost.

Arithmetic is in integer micro-dollars, so the per-provider breakdown sums exactly to the headline.
The wording stays "estimated cost", never "money earned".

## Accounts

Email and password, or Google, into the same account. Passwords are hashed with scrypt from
`node:crypto` — memory-hard, and shipped with the runtime, so no bcrypt or argon2 dependency.
Parameters are stored in the envelope, so they can be raised later without locking anyone out.

Google is optional. Without `AUTH_GOOGLE_ID` the button is simply absent and everything else works.

Sign-in fails identically for a wrong password, an unknown address and a Google-only account — with
a decoy hash so the timing matches too — so it cannot be used to find out who has registered.

## The operator area

`/admin` is a separate door, not a role on a user account: `ADMIN_USERNAME` and `ADMIN_PASSWORD`
from the environment, and unset means there is nothing to sign in to. Each attempt costs an
arithmetic question signed with a short expiry; five attempts a minute per caller, counted before
anything is checked; both halves compared in constant time, so a wrong username cannot answer faster
than a wrong password.

It shows usage by provider, by account and by day. It never joins to the messages table.

## Rate limiting

Provider quotas are per organisation, not per IP, so many users with their own keys do not compete
for one allowance. What they could do is make this server's outbound traffic look abusive — which
would land on everyone sharing it.

So every route that reaches a provider claims a slot first, whoever the keys belong to: 60 requests
a minute per account by default (`REQUESTS_PER_MINUTE_PER_USER`), 429 with a `retry-after` when
exceeded. The claim is an atomic conditional upsert, so a burst cannot slip two requests past the
last slot. The trial cap works the same way; a test fires 25 concurrent requests at a limit of 10 and
asserts exactly 10 get through.

## Privacy properties held by the code

- Provider keys are encrypted with AES-256-GCM before they reach Postgres. The key that opens them
  lives in `KEY_ENCRYPTION_KEY`, never in the database, so a dump on its own yields nothing. Tests
  assert the stored column holds no trace of the plaintext.
- Usage records carry provider, model, token counts, latency, status, timestamp and whose key paid.
  A test asserts the exact key set, so adding a content field breaks the build.
- One account cannot load another's conversation. There is a test for it.
- Reasoning is streamed to you and never stored.
- The browser agent never shows the model a password field's contents, a field named like a secret,
  or anything shaped like a card number; the page address it is told omits the query string, where
  session tokens and reset links live.

What users are told is [the privacy page](../apps/web/src/app/privacy/page.tsx).

## The site: mobile and search engines

Below 860px the top bar, the conversation list and the settings navigation each become a drawer.
The top one lives outside the nav on purpose: the nav's `backdrop-filter` makes it the containing
block for fixed-position children, which sized a nested drawer to the 57px bar and added its width to
the page. Grids use `minmax(0, 1fr)`, because a bare `1fr` floors at min-content and a code sample is
wider than a phone.

For search engines: canonical URLs, an Open Graph card generated with `next/og` so it can never
drift from the palette, `robots.txt` and `sitemap.xml`, JSON-LD describing the software and its FAQ,
and `noindex` on every signed-in route — `robots.txt` disallows them too, but a disallowed URL can
still be indexed from an outside link, and only the tag prevents that.
