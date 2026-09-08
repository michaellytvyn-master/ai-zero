import { describe, expect, it } from 'vitest'
import { panelTabId } from './tabs'

describe('panelTabId', () => {
  it('reads the tab this panel was opened for', () => {
    expect(panelTabId('?tabId=42')).toBe(42)
    expect(panelTabId('?other=1&tabId=7')).toBe(7)
  })

  /**
   * A panel with no tab reads no page and starts no tab-bound chat, which is
   * safer than guessing at whichever tab happens to be in front.
   */
  it('is null when there is no usable id, rather than falling back to a guess', () => {
    for (const search of ['', '?', '?tabId=', '?tabId=abc', '?tabid=9']) {
      expect(panelTabId(search)).toBeNull()
    }
  })

  it('rejects anything that is not a whole number, rather than rounding it', () => {
    for (const search of ['?tabId=1.5', '?tabId=12x', '?tabId=-1', '?tabId= 3', '?tabId=0x10']) {
      expect(panelTabId(search)).toBeNull()
    }
  })

  it('accepts zero, which is a valid tab id', () => {
    expect(panelTabId('?tabId=0')).toBe(0)
  })
})
