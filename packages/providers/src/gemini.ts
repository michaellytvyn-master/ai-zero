import { classifyThrown } from './errors'
import { openAICompatibleChat } from './openai-compatible'
import type { ModelSpec, Provider } from './types'

/** No trailing slash: the adapter appends `/chat/completions`. */
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'

/**
 * The stable Gemini 3.x line, all of which the pricing page marks "Free of
 * charge".
 *
 * The 2.5 models are deliberately absent. The pricing and model pages still
 * list them, but a live request on 2026-09-09 came back 404: "This model
 * models/gemini-2.5-pro is no longer available to new users", and the same for
 * gemini-2.5-flash and gemini-2.5-flash-lite. Google's own error suggested the
 * replacements now shipped here. Hard constraint 4 in practice: the docs were
 * the stale source, and the API was right.
 *
 * gemini-3.8-flash and gemini-3.5-flash-lite are confirmed answering; the rest
 * are their siblings on the same stable line and free tier.
 *
 * No Pro model ships. The only Pro with a free tier was 2.5, and its suggested
 * successor (gemini-3.1-pro-preview) is a preview whose free-tier status is not
 * documented — guessing that would be exactly the mistake above, in reverse.
 *
 * Every one of these thinks, and Google keeps the thought to itself, exposing
 * only `reasoning_effort` (minimal | low | medium | high | none). Hence mode
 * 'effort': grant the token headroom, pass the dial, ask for nothing else.
 *
 * Context windows are a floor; the runtime catalogue reads each model's real
 * window from /models and corrects them.
 */
const GEMINI_MODELS: readonly ModelSpec[] = [
  thinker('gemini-3.8-flash', 'Gemini 3.8 Flash'),
  thinker('gemini-3.7-flash', 'Gemini 3.7 Flash'),
  thinker('gemini-3.6-flash', 'Gemini 3.6 Flash'),
  thinker('gemini-3.5-flash', 'Gemini 3.5 Flash'),
  thinker('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'),
  thinker('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite'),
]

function thinker(id: string, label: string): ModelSpec {
  return {
    id,
    label,
    contextWindow: 1_048_576,
    free: true,
    reasoning: 'effort',
    reasoningEffort: true,
  }
}

export function createGemini(baseUrl: string = GEMINI_BASE_URL): Provider {
  return {
    id: 'gemini',
    label: 'Google Gemini',
    // Last of the three: it is the only one whose free tier reads what you send.
    priority: 30,
    signupUrl: 'https://aistudio.google.com/apikey',
    baseUrl,
    credentialHint: 'API key',
    keyEnvVar: 'GEMINI_API_KEY',
    // The Gemini API Additional Terms let you make "API Clients" — a website,
    // application or other service built on the API — available to users.
    termsAllowServingEndUsers: true,
    // Quoted, not paraphrased, from the same terms: this is the one thing a
    // user should know before pasting the key.
    privacyWarning:
      'On the free tier Google uses what you send to improve its products, and human reviewers ' +
      'may read it. Google’s own terms say not to submit sensitive, confidential or personal ' +
      'information to the unpaid service. Groq and Cloudflare make no such reservation.',
    models: GEMINI_MODELS,
    chat: openAICompatibleChat({
      providerId: 'gemini',
      baseUrl,
      usesStreamOptions: true,
      models: GEMINI_MODELS,
    }),
    classifyError: classifyThrown,
  }
}

export const gemini = createGemini()
