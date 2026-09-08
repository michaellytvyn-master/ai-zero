import { describe, expect, it } from 'vitest'
import { ALL_SITES, describeSite, isReadable } from './permissions'

describe('ALL_SITES', () => {
  /**
   * One prompt covering every site, rather than one per domain. It is in
   * optional_host_permissions, so nothing is granted until the user says yes.
   */
  it('covers ordinary web pages and nothing else', () => {
    expect(ALL_SITES).toEqual(['http://*/*', 'https://*/*'])
    expect(ALL_SITES).not.toContain('<all_urls>')
  })
})

describe('isReadable', () => {
  it('accepts ordinary pages', () => {
    expect(isReadable('https://example.com/a')).toBe(true)
    expect(isReadable('http://localhost:3000/x')).toBe(true)
  })

  it('rejects what no extension can read, whatever is granted', () => {
    for (const url of [
      'chrome://extensions',
      'chrome-extension://abc/panel.html',
      'about:blank',
      'file:///Users/me/notes.txt',
      'devtools://devtools/bundled/x.html',
      '',
    ]) {
      expect(isReadable(url)).toBe(false)
    }
  })
})

describe('describeSite', () => {
  it('names the host, which is what a message should mention', () => {
    expect(describeSite('https://news.example.com/article/1')).toBe('news.example.com')
  })

  it('falls back to something readable rather than throwing', () => {
    expect(describeSite('garbage')).toBe('this page')
  })
})
