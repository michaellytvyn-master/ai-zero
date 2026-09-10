import { describe, expect, it } from 'vitest'
import { contextCharBudget } from './context-budget'
import { asContextMessage, type PageContext } from './page-context'

const page: PageContext = {
  title: 'Example article',
  url: 'https://example.test/article',
  mode: 'text',
  content: 'The body of the page.',
  truncated: false,
  originalLength: 21,
}

const models = [
  {
    id: 'groq:big',
    label: 'Big',
    providerId: 'groq',
    providerLabel: 'Groq',
    contextWindow: 131072,
  },
  {
    id: 'cf:small',
    label: 'Small',
    providerId: 'cf',
    providerLabel: 'Cloudflare',
    contextWindow: 7968,
  },
]

describe('asContextMessage', () => {
  it('says where the content came from, so the model can cite the page', () => {
    const message = asContextMessage(page)

    expect(message).toContain('Example article')
    expect(message).toContain('https://example.test/article')
    expect(message).toContain('The body of the page.')
  })

  it('fences the content, so page text is material and not instructions', () => {
    expect(asContextMessage(page)).toContain('```')
    expect(asContextMessage({ ...page, mode: 'html' })).toContain('```html')
  })

  it('admits when the page was cut short', () => {
    const cut = { ...page, truncated: true, originalLength: 90_000 }

    expect(asContextMessage(cut)).toContain('Truncated')
    expect(asContextMessage(cut)).toContain('90000')
    expect(asContextMessage(page)).not.toContain('Truncated')
  })
})

describe('contextCharBudget', () => {
  it('gives a large model far more room than a small one', () => {
    expect(contextCharBudget(models, 'groq:big')).toBeGreaterThan(
      contextCharBudget(models, 'cf:small'),
    )
  })

  /** An 8k-token model cannot take 80k characters; the request just fails. */
  it('keeps the smallest model within its own context window', () => {
    const budget = contextCharBudget(models, 'cf:small')
    expect(budget / 4).toBeLessThan(7968)
  })

  it('is conservative when the model is auto or unknown', () => {
    const auto = contextCharBudget(models, 'auto')
    expect(auto).toBe(contextCharBudget(models, 'not-a-model'))
    expect(auto).toBeLessThan(contextCharBudget(models, 'groq:big'))
  })

  it('never returns something uselessly small or absurdly large', () => {
    expect(contextCharBudget([], 'auto')).toBeGreaterThanOrEqual(2000)
    expect(
      contextCharBudget(
        [{ id: 'x', label: 'x', providerId: 'x', providerLabel: 'x', contextWindow: 10_000_000 }],
        'x',
      ),
    ).toBeLessThanOrEqual(120_000)
  })
})
