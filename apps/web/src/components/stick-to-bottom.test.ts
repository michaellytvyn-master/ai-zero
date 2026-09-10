import { describe, expect, it } from 'vitest'
import { contentLength, isAtBottom } from './use-stick-to-bottom'

describe('isAtBottom', () => {
  it('is true when the pane is scrolled all the way down', () => {
    expect(isAtBottom(2000, 1500, 500)).toBe(true)
  })

  it('tolerates the sub-pixel gap a browser leaves at the bottom', () => {
    expect(isAtBottom(2000, 1480, 500)).toBe(true)
  })

  it('is false once the reader has scrolled up to read something', () => {
    // The point of the whole hook: this reader must not be dragged back down.
    expect(isAtBottom(2000, 900, 500)).toBe(false)
  })

  it('is true when there is nothing to scroll', () => {
    expect(isAtBottom(400, 0, 400)).toBe(true)
  })
})

describe('contentLength', () => {
  it('grows as a reply streams in, which is what re-triggers the scroll', () => {
    const before = contentLength([{ content: 'Yes' }])
    const after = contentLength([{ content: 'Yes, because' }])
    expect(after).toBeGreaterThan(before)
  })

  it('grows when reasoning streams before any answer exists', () => {
    const before = contentLength([{ content: '', reasoning: 'we' }])
    const after = contentLength([{ content: '', reasoning: 'weighing' }])
    expect(after).toBeGreaterThan(before)
  })

  it('grows when a new turn appears, even an empty one', () => {
    expect(contentLength([{ content: 'a' }, { content: '' }])).toBeGreaterThan(
      contentLength([{ content: 'a' }]),
    )
  })
})
