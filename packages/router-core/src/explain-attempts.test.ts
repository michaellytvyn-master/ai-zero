import { describe, expect, it } from 'vitest'
import { AllProvidersFailedError, type AttemptRecord, explainAttempts } from './errors'

const attempt = (
  providerId: string,
  reason: AttemptRecord['reason'],
  detail: string | null = null,
): AttemptRecord => ({ providerId, reason, detail })

describe('explainAttempts', () => {
  it('names the fix when nothing has a key — the commonest first-run failure', () => {
    const message = explainAttempts([
      attempt('groq', 'no_key', 'GROQ_API_KEY'),
      attempt('cloudflare', 'no_key', 'CF_API_TOKEN'),
    ])
    expect(message).toContain('groq and cloudflare')
    expect(message).toContain('Provider keys')
  })

  it('says to wait when every provider is cooling down', () => {
    const message = explainAttempts([
      attempt('groq', 'cooldown'),
      attempt('cloudflare', 'cooldown'),
    ])
    expect(message).toContain('cooling down')
    expect(message).toContain('Try again')
  })

  it('names the model nobody serves', () => {
    expect(explainAttempts([attempt('groq', 'unsupported_model', 'gpt-9')])).toBe(
      'No configured provider serves gpt-9.',
    )
  })

  it('lists each cause when they differ, because the fix differs too', () => {
    const message = explainAttempts([attempt('groq', 'no_key'), attempt('cloudflare', 'cooldown')])
    expect(message).toContain('groq: no API key set')
    expect(message).toContain('cloudflare: cooling down')
  })

  it('explains an empty attempt log rather than saying nothing', () => {
    expect(explainAttempts([])).toContain('No providers are configured')
  })

  it('is what the thrown error actually reports', () => {
    // The whole point: the message a user sees is the explanation, not a stub.
    const error = new AllProvidersFailedError([attempt('groq', 'no_key')])
    expect(error.message).toContain('Provider keys')
    expect(error.message).not.toBe('every provider was skipped or failed')
  })
})
