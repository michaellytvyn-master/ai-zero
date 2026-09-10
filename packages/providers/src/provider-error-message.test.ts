import { describe, expect, it } from 'vitest'
import { providerErrorMessage } from './openai-compatible'

describe('providerErrorMessage', () => {
  it("unwraps Google's array-of-error shape, which is what a retired model returns", () => {
    const body = JSON.stringify([
      {
        error: {
          code: 404,
          message:
            'This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use models/gemini-3.1-pro-preview',
          status: 'NOT_FOUND',
        },
      },
    ])
    expect(providerErrorMessage(body)).toBe(
      'This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use models/gemini-3.1-pro-preview',
    )
  })

  it('unwraps the OpenAI-shaped object Groq uses', () => {
    const body = JSON.stringify({
      error: { message: 'property id is unsupported', type: 'invalid' },
    })
    expect(providerErrorMessage(body)).toBe('property id is unsupported')
  })

  it("unwraps Cloudflare's errors array", () => {
    const body = JSON.stringify({ success: false, errors: [{ code: 7000, message: 'No route' }] })
    expect(providerErrorMessage(body)).toBe('No route')
  })

  it('falls back to the raw text when the shape is unfamiliar', () => {
    expect(providerErrorMessage('upstream connect error')).toBe('upstream connect error')
  })

  it('still truncates, so a verbose body cannot become a log of the request', () => {
    const long = JSON.stringify({ error: { message: 'x'.repeat(1000) } })
    expect(providerErrorMessage(long).length).toBe(300)
  })

  it('survives valid JSON carrying no message at all', () => {
    expect(providerErrorMessage('{"status":503}')).toBe('{"status":503}')
  })
})
