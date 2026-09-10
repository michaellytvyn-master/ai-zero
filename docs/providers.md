# Provider verification log

Hard constraint 4 says the base URLs, model ids and limits in SPEC.md are a
starting point and must not be trusted. This file records what was actually
checked, when, and against what. Re-check before touching an adapter.

**Last verified: 2026-09-09.**

Context windows are no longer only what is written here. Providers publishing an
OpenAI-style `/models` endpoint are asked at runtime and their answer wins; the
figures below are the fallback and the record of what was true when checked.
See `packages/providers/src/catalogue.ts`.

**Two numbers are easy to confuse.** A *context window* is how much fits in one
request — 131 072 tokens for Groq's gpt-oss models. *TPD* is how many tokens the
free tier allows per day — 200 000 on Groq. They are unrelated, and 200 000 is
not a context size. No model on Groq has a 200k window; the largest is
`minimax/minimax-m2.7` at 196 608, which is a preview model and absent from the
free-plan table.

## The rule this registry follows

**A provider that needs a credit card does not ship.** The project's premise is
that it costs nothing, and a card is the point at which that stops being true.
`registry.test.ts` asserts every shipped model is on a free tier, so a
card-only provider cannot be added by accident.

| Provider | Card | Free allowance | Models offered | Reads your text |
|---|---|---|---|---|
| Groq | no | 1 000 requests/day | 6 | no |
| Cloudflare Workers AI | no | 10 000 neurons/day | 6 | no |
| Google Gemini | no | see AI Studio | 6 | **yes — see below** |

The last column is not a detail. Google's free tier is the only one whose terms
reserve the right to train on what is sent and to have people read it, so it is
the only provider carrying a `privacyWarning`, shown on the key form itself.

## Groq — priority 10

- Base URL `https://api.groq.com/openai/v1`, fully OpenAI-compatible, honours
  `stream_options.include_usage`.
- Free tier, no card, no phone. For the chat models below: 30 RPM, 1 000 RPD,
  8 000 TPM, 200 000 TPD. Limits are per organisation, so extra keys do not
  multiply quota. 429 carries `retry-after` plus `x-ratelimit-*`.
  Source: <https://console.groq.com/docs/rate-limits>
- Model ids shipped — every chat model that appears in Groq's free-plan rate
  limit table, and nothing that does not:
  `openai/gpt-oss-120b` and `openai/gpt-oss-20b` (131 072),
  `qwen/qwen3.8-27b` (131 042), `qwen/qwen3.6-27b` (131 072),
  `groq/compound` and `groq/compound-mini` (131 072, web search built in).
  Note the slash inside the ids — this is why qualified ids use `provider:model`.
  Source: <https://console.groq.com/docs/models>
- `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` appear in the catalogue
  but not in the free-plan table, so they are deliberately absent.
- SPEC.md assumed `llama-3.3-70b-versatile`; it is not in the current catalogue.
- Terms: Services Agreement 3.1 grants the right "to make the Cloud Services
  and AI Model Services available to End Users through your Customer
  Applications". 3.2 and 6.3(c) forbid reselling or transferring access.
  Source: <https://console.groq.com/docs/legal/services-agreement>

## Cloudflare Workers AI — priority 20

- OpenAI-compatible base URL
  `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1`, serving
  `/chat/completions`.
  Source: <https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/>
- 10 000 neurons/day free, with no paid plan and no card.
  Source: <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- **The credential is two values.** The account id is part of the URL, so the
  adapter takes `<account id>:<api token>` and splits it. That is what a user
  pastes into the account panel, and what `CF_ACCOUNT_ID` + `CF_API_TOKEN`
  compose to for the operator pool. The oddity is contained in `cloudflare.ts`
  rather than widening the Provider interface for everyone.
- Model ids shipped, all outside Cloudflare's paid-billing list, contexts read
  from each model's own page:
  - `@cf/openai/gpt-oss-120b` — 128 000
  - `@cf/mistralai/mistral-small-3.1-24b-instruct` — 128 000
  - `@cf/meta/llama-3.2-3b-instruct` — 80 000
  - `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — 24 000
  - `@cf/qwen/qwq-32b` — 24 000
  - `@cf/meta/llama-3.1-8b-instruct` — 7 968 (the smallest, so the demo pool
    is clamped to it)
- **Requires a payment method, so never add these:** `@cf/moonshotai/kimi-k2.6`,
  `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/zai-org/glm-5.3`,
  `@cf/zai-org/glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`,
  `@cf/deepseek-ai/deepseek-v4-pro-0813`. `cloudflare.test.ts` guards against
  the families by name.
- Terms: the developer platform terms do not prohibit resale or proxying of
  Workers AI. They do note that the models are Third-Party Products carrying
  their own licences, and that violating those can suspend the account.
  Source: <https://www.cloudflare.com/service-specific-terms-developer-platform/>

## Removed

### Mistral — removed 2026-09-08, no free models visible in the console

Its documentation and every aggregator still describe a free Experiment tier
with ~1B tokens/month and no credit card, gated behind phone verification and
an opt-in to training on submitted content. The operator checked the actual
console and found no free models offered, which beats what the docs claim.
Removed rather than left in as a provider that silently never answers.

If it comes back, the adapter is four lines of configuration over
`openAICompatible()`; the model ids at the time of removal were
`ministral-3-8b-2512` and `ministral-3-14b-2512`, both 256K context, and
`mistral-small-2603` and `open-mistral-7b` were already deprecated.

### Cerebras — removed 2026-09-08, requires a card

Its no-card free tier was retired in August 2026. What remains is $5 of trial
credit that needs a verified payment method and expires after 30 days, which
fails the rule at the top of this file. The adapter was deleted rather than
left dormant.
Source: <https://inference-docs.cerebras.ai/support/rate-limits>

## Checked and deliberately not shipped

### Gemini — free, but its terms rule out the demo pool

- Free tier across the Flash and Flash-Lite families, no card.
  Source: <https://ai.google.dev/gemini-api/docs/pricing>
- **Google requires the paid tier once an API client is available to users in
  the EEA, Switzerland or the UK.** A public website is exactly that, so an
  operator key on the free tier would be in breach the first time somebody in
  the EU used the demo. It could only ever be a bring-your-own-key provider.
- Free-tier content is used to improve Google's products and may be reviewed by
  humans.

### OpenRouter — too small, and terms unread

50 requests/day on `:free` models without buying credits, 20 RPM.
Source: <https://openrouter.ai/docs/api-reference/limits>

### NVIDIA NIM — a trial, not a free tier

100+ models, OpenAI-compatible, 40 RPM, no card, but roughly 1 000 signup
credits. Finite credit is a trial, same category as Cerebras.

## Google Gemini — priority 30

Added 2026-09-09 at the user's request. Last, by priority, because of the terms
below: failover reaches it only after Groq and Cloudflare.

- OpenAI-compatible base URL
  `https://generativelanguage.googleapis.com/v1beta/openai` (the docs write it
  with a trailing slash; the adapter appends `/chat/completions`, so it is
  stored without one). Honours `stream_options.include_usage`, takes
  `max_tokens`, and publishes a `/models` endpoint the runtime catalogue reads.
  Source: <https://ai.google.dev/gemini-api/docs/openai>
- Free tier, no card: a key from AI Studio works without a billing account.
  The rate-limit page no longer prints per-model numbers and points at the
  AI Studio dashboard instead, so no figures are recorded here rather than
  guessed. Source: <https://ai.google.dev/gemini-api/docs/rate-limits>
- Model ids shipped — the stable 3.x line, all marked "Free of charge" on the
  pricing page: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`,
  `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`.
  Context windows are a floor and are corrected at runtime from `/models`.
  Sources: <https://ai.google.dev/gemini-api/docs/pricing>,
  <https://ai.google.dev/gemini-api/docs/models>
- **The 2.5 models are not shipped, and the docs are wrong about them.** Both
  the pricing page and the model page still list `gemini-2.5-pro`,
  `gemini-2.5-flash` and `gemini-2.5-flash-lite` with a free tier. A real
  request on 2026-09-09 answered:

  > This model models/gemini-2.5-pro is no longer available to new users.
  > Please update your code to use models/gemini-3.1-pro-preview

  with the same for the two Flash variants, pointing at `gemini-3.6-flash` and
  `gemini-3.5-flash-lite`. This is hard constraint 4 earning its keep: the
  documentation was the stale source and the API was right. `gemini.test.ts`
  asserts the three stay absent, so they cannot be re-added from the docs.
- No Pro model ships. The only Pro on a free tier was 2.5, and the successor
  Google names is a preview whose free-tier status is undocumented; shipping it
  on that basis would repeat the mistake above in the other direction.
- Confirmed answering on a real key, 2026-09-09: `gemini-3.8-flash` and
  `gemini-3.5-flash-lite`. The other four are siblings on the same stable line.
- Reasoning: every model thinks, and Google keeps the thought to itself. It
  exposes `reasoning_effort` (`minimal | low | medium | high | none`) and none
  of Groq's parameters, so the mode is `'effort'`: grant the token headroom,
  pass the dial, send nothing else. Sending `reasoning_format` here would be a
  400, not a no-op.
- Terms — permitted: the Additional Terms let you make "API Clients" (a
  website, application or other service built on the API) available to users.
- Terms — **the catch**: on the unpaid tier "Google uses the content you submit
  to the Services and any generated responses to provide, improve, and develop
  Google products and services", "Human reviewers may read, annotate, and
  process your API input and output", and "Do not submit sensitive,
  confidential, or personal information to the Unpaid Services".
  Source: <https://ai.google.dev/gemini-api/terms>

  This is why `Provider.privacyWarning` exists. It is rendered above the key
  field on `/settings/keys`, quoted rather than paraphrased. A user choosing
  Gemini should be choosing it knowingly; the rest of this product's promise —
  that we never keep the text — says nothing about what the provider does with
  it once it arrives.
