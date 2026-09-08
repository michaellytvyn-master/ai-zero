# SPEC: Zero-Cost AI Assistant

A build specification for a coding agent. Read this whole file before writing code.
Ask me before making any decision this document does not cover.

> Amended in places. See DECISIONS.md — accounts, database, auth and the admin
> dashboard now exist, and the router is a Next.js app rather than a Worker.

---

## 1. What we are building

A personal AI assistant that runs entirely on the **free tiers** of multiple LLM
providers, and never costs the user money.

next.js postgres, next auth, google auth,
also need dashboard for admin to see all analytics of users and usage for admin

Three deliverables, one shared core:

1. **Router** — an OpenAI-compatible HTTP gateway that fans requests out across
   several free-tier providers and fails over automatically when one is rate
   limited or down.
2. **Chrome extension** — a side-panel chat that can read the current page and
   answer questions about selected text.
3. **Web app** — a landing page plus a limited public demo of the chat.

The headline feature the whole project is designed around: a **savings counter**
that shows what the same usage would have cost on a paid model. This must be
visible in the UI and must be accurate.

## 2. Non-goals

- No user accounts, no database of users, no auth system.  *(superseded — DECISIONS.md §1)*
- No paid tier, no billing.
- No fine-tuning, no RAG, no vector store.
- No mobile app.
- Do not build a chat UI framework. Keep the UI minimal and fast.

## 3. Hard constraints

These are not negotiable. Violating any of them breaks the project.

1. **User API keys never leave the user's device in a storable form.**
   - In the extension: keys live in `chrome.storage.local` and requests go
     **directly** from the extension to the provider using `host_permissions`.
     The router is not involved in BYOK mode.
   - In the web app: BYOK requests pass through the router, but the key is read
     from the request header, used once, and never logged, cached or persisted.
     Add a test that asserts no logger call receives a key.
2. **Demo mode uses the operator's own keys and must be hard capped.**
   - Default: 10 messages per IP per 24 hours, smallest model only.
     *(now per account — DECISIONS.md §3)*
   - When the cap is hit, do not show an error. Show a prompt to add a free
     personal key, with links to each provider's signup page.
3. **No prompt or response content is logged anywhere.** Log only: provider
   name, model id, token counts, latency, status code, timestamp.
4. **Verify every provider base URL, model id and rate limit against the
   provider's current documentation before writing the adapter.** The values in
   this document are a starting point and may be out of date. Do not trust them.
5. Secrets never enter the repository. `.env.example` only.

## 4. Architecture

```
Chrome extension (side panel)
    ├── BYOK mode  ──────────────────────────────► provider APIs (direct)
    └── demo mode  ──► router ──► provider APIs

Web app (Next.js)
    └── all modes  ──► router ──► provider APIs

Router (Hono on Cloudflare Workers)      *(now Next.js route handlers)*
    ├── POST /v1/chat/completions   (OpenAI-compatible, streaming + non-streaming)
    ├── GET  /v1/models
    ├── GET  /health
    └── provider registry + failover + quota tracking (Workers KV)  *(now Postgres)*
```

## 5. Repository layout

Use pnpm workspaces. TypeScript everywhere, strict mode on.

```
zero-cost-ai/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example
  README.md
  packages/
    providers/          # provider adapters, one file each
      src/
        types.ts        # Provider interface, ChatRequest, ChatChunk
        registry.ts     # ordered list + selection logic
        groq.ts
        cerebras.ts
        mistral.ts
        cloudflare.ts
        gemini.ts
        openrouter.ts
        index.ts
    pricing/            # reference prices for the savings counter
      src/
        prices.json     # paid-model reference prices, dated
        calculate.ts
    shared/             # types shared by router, extension and web
  apps/
    router/             # Hono on Cloudflare Workers  *(now packages/router-core)*
    extension/          # Vite + React, Manifest V3
    web/                # Next.js on Vercel
```

## 6. Provider adapter contract

Every provider implements the same interface. Add a provider by adding one file
and one registry entry, nothing else.

```ts
export interface Provider {
  id: string                        // 'groq'
  label: string                     // 'Groq'
  priority: number                  // lower runs first
  models: ModelSpec[]
  signupUrl: string                 // where a user gets a free key
  keyEnvVar: string                 // 'GROQ_API_KEY'

  chat(req: ChatRequest, key: string, signal: AbortSignal):
    AsyncIterable<ChatChunk>

  classifyError(e: unknown): 'rate_limit' | 'transient' | 'auth' | 'fatal'
}
```

Notes for the implementer:

- Most of these providers expose an OpenAI-compatible endpoint. Write one shared
  `openAICompatible()` helper and have those adapters configure it rather than
  duplicating fetch logic.
- Gemini and Cloudflare may need their own request shapes. Check the docs.
- Always stream. Non-streaming responses are produced by collecting the stream.
- `classifyError` must distinguish a 429 (try next provider, cool this one down)
  from a 401 (the key is wrong, tell the user, do not silently skip).

### Starting provider list

Verify all of this before implementing. Order by priority.

| id | why this priority | rough free allowance (verify) |
|---|---|---|
| `mistral` | very large monthly allowance | ~1B tokens / month |
| `cerebras` | fastest responses in testing | ~1M tokens / day |
| `groq` | fast, good models | ~1000 requests / day |
| `cloudflare` | powers demo mode, same platform as router | ~10,000 neurons / day |
| `gemini` | large context | 20-1500 requests / day by model |
| `openrouter` | last resort, many models | ~50 requests / day |

## 7. Router behaviour

```
for each provider in registry, ordered by priority:
    skip if cooling down (KV key: cooldown:<provider>)
    skip if no key configured
    try to stream the response
        on success: emit chunks, record usage, return
        on rate_limit: set cooldown for 60s, continue
        on transient (5xx, timeout): continue
        on auth: return a clear error naming the provider, do not continue
        on fatal: return the error
if no provider succeeded:
    return 503 with the list of what was tried and why each failed
```

Requirements:

- Failover must happen **before the first token is emitted**. Once streaming has
  started to the client, do not switch providers mid-stream.
- Timeout for first token: 8 seconds. Then fail over.
- Emit a non-standard first SSE event carrying `{provider, model}` so the UI can
  show which provider answered. Keep the rest of the stream OpenAI-compatible.
- Cooldowns live in Workers KV with TTL.  *(now Postgres)*

## 8. Savings counter

This is the feature the project is judged on. Get it right.

- `packages/pricing/src/prices.json` holds reference prices per million input
  and output tokens for two or three well-known paid models, each entry stamped
  with the date it was checked and a source URL.
- After every completed request, compute what the same token counts would have
  cost on the reference model and add it to a running total.
- Totals are stored **locally** (`chrome.storage.local` / `localStorage`). There
  is no server-side aggregate of user data.  *(superseded — DECISIONS.md §1, §4)*
- The UI shows: total saved, requests made, and a breakdown by provider.
- Label it honestly in the UI: "estimated cost if run on <reference model>".
  Do not call it "money earned" or imply it is exact.

## 9. Chrome extension

Manifest V3.

- **Side panel** (`chrome.sidePanel`) is the main surface. Chat, model picker,
  provider indicator, savings counter, settings.
- **Context menu**: select text on a page, right click, "Ask AI" opens the side
  panel with that text quoted.
- **Page context**: a button that pulls the readable text of the current tab
  into the conversation. Cap the extracted text and tell the user it was
  truncated.
- **Settings**: one field per provider key, each with a link to that provider's
  free signup page and a "test key" button.
- Storage: `chrome.storage.local` only. Never `chrome.storage.sync` for keys.
- Permissions: request the minimum. Justify each one in the store listing.
  Prefer `activeTab` over broad host permissions where possible; broad
  `host_permissions` are needed only for the provider API origins.
- Keyboard shortcut to open the panel.

## 10. Web app

Next.js on Vercel. Pages:

- `/` — what it is, the savings counter screenshot, install links, provider
  table with current free limits.
- `/demo` — the capped public chat. Shows remaining messages for the day and,
  when exhausted, the "add your own key" flow.
- `/privacy` — required for the Chrome Web Store. Must state plainly: keys are
  stored locally, prompts are not logged, and free provider tiers may use
  submitted data to improve their models.

## 11. Configuration

One `config.ts` per app, values from environment. Nothing hardcoded in logic.
See `.env.example` for the current, larger set.

## 12. Build phases

Deliver in this order. Each phase must run and be demonstrable before the next
one starts. Stop and show me the result at the end of each phase.

**Phase 1 — Router core**
`packages/providers` with the shared OpenAI-compatible helper plus Groq,
Cerebras and Mistral. `apps/router` serving `POST /v1/chat/completions` with
streaming and failover. Unit tests for the failover state machine using mocked
providers, including: first provider 429s, second succeeds; all providers 429;
auth error stops the chain.
*Done when:* `curl` against the local router streams an answer, and killing the
first provider's key still returns an answer from the second.

**Phase 2 — Extension MVP**
Side panel chat talking to the router. Settings screen with per-provider keys
stored in `chrome.storage.local`. Provider indicator in the UI.
*Done when:* loaded unpacked in Chrome, I can chat and see which provider
answered.

**Phase 3 — BYOK direct mode**
Extension calls provider APIs directly when a user key is present, bypassing the
router entirely. Router is used only when no user key is set.
*Done when:* with a key set, DevTools network tab shows requests going to the
provider domain, not to the router.

**Phase 4 — Savings counter**
`packages/pricing`, per-request calculation, local totals, UI display with the
per-provider breakdown.

**Phase 5 — Page context and context menu**
Text extraction from the active tab, right-click "Ask AI".

**Phase 6 — Web app**
Landing page, capped demo with the limit in Postgres, privacy policy page,
Google auth and the admin dashboard.

**Phase 7 — Ship**
README with a demo GIF, MIT licence, GitHub Actions running typecheck, lint and
tests. Store listing assets: icons, screenshots, description, permission
justifications.

## 13. Coding standards

- TypeScript strict. No `any` that survives review.
- Zod for validating anything crossing a boundary: request bodies, provider
  responses, stored config.
- Small files, one responsibility each. If a file passes 200 lines, split it.
- Vitest for tests. Test the failover logic, the pricing maths and the key
  handling. Do not write tests that only assert a mock was called.
- No comments restating the code. Comment only non-obvious decisions, for
  example why a provider needs a special case.
- Conventional commits.

## 14. Things not to do

- Do not add a provider without checking its terms for restrictions on
  proxying or reselling free-tier access.
- Do not increase the demo cap to make a demo look better.
- Do not persist prompts or responses anywhere, including in error reports.
- Do not add analytics that send prompt content.
- Do not add a dependency that could be twenty lines of local code.
