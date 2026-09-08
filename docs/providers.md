# Provider verification log

Hard constraint 4 says the base URLs, model ids and limits in SPEC.md are a
starting point and must not be trusted. This file records what was actually
checked, when, and against what. Re-check before touching an adapter.

**Last verified: 2026-09-08.**

## The rule this registry follows

**A provider that needs a credit card does not ship.** The project's premise is
that it costs nothing, and a card is the point at which that stops being true.
`registry.test.ts` asserts every shipped model is on a free tier, so a
card-only provider cannot be added by accident.

| Provider | Card | Free allowance | Models offered |
|---|---|---|---|
| Groq | no | 1 000 requests/day | 6 |
| Cloudflare Workers AI | no | 10 000 neurons/day | 6 |

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
