import { classifyThrown } from './errors'
import { openAICompatibleChat } from './openai-compatible'
import type { ModelSpec, Provider } from './types'

export const CLOUDFLARE_API_ROOT = 'https://api.cloudflare.com/client/v4'

export class CloudflareCredentialError extends Error {}

/**
 * Cloudflare puts the account id inside the URL, so one opaque key is not
 * enough. The stored credential is `<account id>:<api token>` and is split
 * here, which keeps the oddity inside this adapter instead of leaking a
 * second field into the Provider interface for everyone else.
 */
export function parseCloudflareCredential(credential: string): {
  accountId: string
  token: string
} {
  const separator = credential.indexOf(':')
  if (separator === -1) {
    throw new CloudflareCredentialError('Cloudflare credentials are "<account id>:<api token>"')
  }
  const accountId = credential.slice(0, separator).trim()
  const token = credential.slice(separator + 1).trim()
  if (accountId.length === 0 || token.length === 0) {
    throw new CloudflareCredentialError('Cloudflare credentials are "<account id>:<api token>"')
  }
  return { accountId, token }
}

export function cloudflareBaseUrl(accountId: string, apiRoot = CLOUDFLARE_API_ROOT): string {
  return `${apiRoot}/accounts/${accountId}/ai/v1`
}

/**
 * Only models outside Cloudflare's paid-billing list. Kimi, GLM and the
 * DeepSeek v4 variants need a payment method and are deliberately absent.
 */
const CLOUDFLARE_MODELS: readonly ModelSpec[] = [
  {
    id: '@cf/openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    contextWindow: 128000,
    free: true,
    // Workers AI exposes none of Groq's reasoning parameters, so whatever
    // these models think arrives inline, wrapped in tags.
    reasoning: 'tags',
  },
  {
    id: '@cf/mistralai/mistral-small-3.1-24b-instruct',
    label: 'Mistral Small 3.1 24B',
    contextWindow: 128000,
    free: true,
  },
  {
    id: '@cf/meta/llama-3.2-3b-instruct',
    label: 'Llama 3.2 3B',
    contextWindow: 80000,
    free: true,
  },
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B',
    contextWindow: 24000,
    free: true,
  },
  {
    id: '@cf/qwen/qwq-32b',
    label: 'QwQ 32B (reasoning)',
    contextWindow: 24000,
    free: true,
    reasoning: 'tags',
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B',
    contextWindow: 7968,
    free: true,
  },
]

export function createCloudflare(apiRoot: string = CLOUDFLARE_API_ROOT): Provider {
  return {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    priority: 20,
    signupUrl: 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai',
    keyEnvVar: 'CF_API_TOKEN',
    baseUrl: apiRoot,
    credentialHint: '<account id>:<api token>',
    termsAllowServingEndUsers: true,
    models: CLOUDFLARE_MODELS,
    chat(req, credential, signal) {
      const { accountId, token } = parseCloudflareCredential(credential)
      return openAICompatibleChat({
        providerId: 'cloudflare',
        baseUrl: cloudflareBaseUrl(accountId, apiRoot),
        usesStreamOptions: false,
        models: CLOUDFLARE_MODELS,
      })(req, token, signal)
    },
    classifyError: classifyThrown,
  }
}

export const cloudflare = createCloudflare()
