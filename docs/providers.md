# Provider verification log

Hard constraint 4 says the base URLs, model ids and limits in SPEC.md are a
starting point and must not be trusted. This file records what was actually
checked, when, and against what. Re-check before touching an adapter.

**Last verified: 2026-09-08.**

## Mistral — priority 10

- Base URL `https://api.mistral.ai/v1`, OpenAI-shaped `/chat/completions`,
  `stream: true`, terminated by `data: [DONE]`.
  Source: <https://docs.mistral.ai/api/>
- Free **Experiment** tier: no billing card, ~1B tokens/month, evaluation only.
  Exact RPM is no longer published; it is visible per-workspace at
  <https://admin.mistral.ai/plateforme/limits>.
  Source: <https://docs.mistral.ai/deployment/laplateforme/tier>
- The free tier **requires opting into model training**. This must be stated on
  `/privacy`.
- Model ids shipped: `ministral-3-8b-2512`, `ministral-3-14b-2512` (256K context).
  Source: <https://docs.mistral.ai/getting-started/models/models_overview/>
- SPEC.md and common tutorials still name `mistral-small-2603` and
  `open-mistral-7b`. Both are **deprecated** — do not add them back.
- Terms: a "Customer Offering" serving End Users is permitted; buying, selling
  or transferring API keys is not. Demo mode fits; key-sharing never would.
  Source: <https://legal.mistral.ai/terms/commercial-terms-of-service>

## Groq — priority 20

- Base URL `https://api.groq.com/openai/v1`, fully OpenAI-compatible, and it
  honours `stream_options.include_usage`.
- Free tier, no billing card. For the chat models below: 30 RPM, 1 000 RPD,
  8 000 TPM, 200 000 TPD. Limits are per organisation, so extra keys do not
  multiply quota. 429 carries `retry-after` plus `x-ratelimit-*`.
  Source: <https://console.groq.com/docs/rate-limits>
- Model ids shipped: `openai/gpt-oss-20b`, `openai/gpt-oss-120b` (131 072 context).
  Note the slash inside the id — this is why qualified ids use `provider:model`.
  Source: <https://console.groq.com/docs/models>
- `qwen/qwen3.6-27b` and `qwen/qwen3.8-27b` are also on the free tier but their
  context windows were not verified, so they are not in the registry yet.
- SPEC.md assumed `llama-3.3-70b-versatile`; it is not in the current catalogue.
- Terms: Services Agreement 3.1 grants the right "to make the Cloud Services
  and AI Model Services available to End Users through your Customer
  Applications". 3.2 and 6.3(c) forbid reselling or transferring access.
  Demo mode is inside 3.1; BYOK is the user's own account.
  Source: <https://console.groq.com/docs/legal/services-agreement>

## Cerebras — priority 30, and no longer free

- Base URL `https://api.cerebras.ai/v1`, OpenAI-compatible.
  Source: <https://inference-docs.cerebras.ai/quickstart>
- **The no-card free tier was retired in August 2026.** What is left is $5 of
  trial credit that requires a verified payment method and expires 30 days
  after it is granted. Trial limits: 5 RPM, 30K uncached TPM, 90K total TPM,
  1M TPH, 1M TPD.
  Source: <https://inference-docs.cerebras.ai/support/rate-limits>
- Consequences, applied in `cerebras.ts`: demoted from priority 2 to last, and
  every model marked `free: false`. SPEC.md's "~1M tokens/day free" is stale.
- Model ids shipped: `gpt-oss-120b`, `qwen-3.8-27b`. Context windows are the
  reduced trial figures (65 536 / 65 536), not the paid ones.
  Source: <https://inference-docs.cerebras.ai/models/overview>
- A 402 is classified as `rate_limit`, so exhausted credit cools the provider
  down and fails over rather than killing the request.

## Not yet verified

`cloudflare`, `gemini` and `openrouter` are unimplemented. Verify each against
its own docs, and check its terms for proxying restrictions, before writing the
adapter — same discipline as above.
