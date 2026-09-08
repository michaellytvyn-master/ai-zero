import { describe, expect, it } from 'vitest'
import type { ChatRequest } from './chat'
import {
  DEFAULT_RESPONSE_MODE,
  applyResponseMode,
  isResponseMode,
  responseMode,
  responseModes,
} from './response-mode'

const REQUEST: ChatRequest = {
  model: 'auto',
  messages: [{ role: 'user', content: 'why is the sky blue' }],
  temperature: null,
  maxTokens: null,
}

describe('the modes themselves', () => {
  it('cost strictly more as they get more thorough', () => {
    const caps = responseModes.map((mode) => mode.maxTokens)
    expect(caps).toEqual([...caps].sort((a, b) => a - b))
    expect(new Set(caps).size).toBe(caps.length)
  })

  it('each carries a label, a hint and an actual instruction', () => {
    for (const mode of responseModes) {
      expect(mode.label.length).toBeGreaterThan(0)
      expect(mode.hint.length).toBeGreaterThan(0)
      expect(mode.systemPrompt.length).toBeGreaterThan(40)
      expect(mode.maxTokens).toBeGreaterThan(0)
    }
  })

  it('falls back to the default rather than throwing on junk', () => {
    expect(DEFAULT_RESPONSE_MODE).toBe('eco')
    expect(responseMode('nonsense').id).toBe(DEFAULT_RESPONSE_MODE)
    expect(responseMode(null).id).toBe(DEFAULT_RESPONSE_MODE)
    expect(responseMode(undefined).id).toBe(DEFAULT_RESPONSE_MODE)
  })

  it('recognises only ids it actually has', () => {
    expect(isResponseMode('eco')).toBe(true)
    expect(isResponseMode('ECO')).toBe(false)
    expect(isResponseMode('')).toBe(false)
    expect(isResponseMode(undefined)).toBe(false)
  })
})

describe('applyResponseMode', () => {
  it('caps the reply, which is what protects the daily allowance', () => {
    expect(applyResponseMode(REQUEST, 'eco').maxTokens).toBe(400)
    expect(applyResponseMode(REQUEST, 'max').maxTokens).toBe(4000)
  })

  it('leads with the instruction and keeps the conversation intact', () => {
    const applied = applyResponseMode(REQUEST, 'eco')

    expect(applied.messages[0]?.role).toBe('system')
    expect(applied.messages[0]?.content).toContain('as few words')
    expect(applied.messages.slice(1)).toEqual(REQUEST.messages)
  })

  /** Page context arrives as a system message; it is material, not an override. */
  it('keeps a system message the caller already added, after its own', () => {
    const withPage: ChatRequest = {
      ...REQUEST,
      messages: [{ role: 'system', content: 'The page says X.' }, ...REQUEST.messages],
    }
    const applied = applyResponseMode(withPage, 'thinking')

    expect(applied.messages[0]?.content).toContain('Work the problem through')
    expect(applied.messages[1]?.content).toBe('The page says X.')
    expect(applied.messages).toHaveLength(3)
  })

  it('does not override a cap the caller set deliberately', () => {
    expect(applyResponseMode({ ...REQUEST, maxTokens: 50 }, 'max').maxTokens).toBe(50)
  })

  it('leaves the original request untouched', () => {
    applyResponseMode(REQUEST, 'max')
    expect(REQUEST.messages).toHaveLength(1)
    expect(REQUEST.maxTokens).toBeNull()
  })
})
