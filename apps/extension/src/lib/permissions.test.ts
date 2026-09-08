import { describe, expect, it } from 'vitest'
import { describeSite, originPatternFor } from './permissions'

describe('originPatternFor', () => {
  it('asks for one site, not every site', () => {
    expect(originPatternFor('https://example.com/some/article?x=1')).toBe('https://example.com/*')
    expect(originPatternFor('http://localhost:3000/dashboard')).toBe('http://localhost/*')
  })

  it('keeps subdomains separate, so one grant does not cover a sibling', () => {
    expect(originPatternFor('https://docs.example.com/a')).toBe('https://docs.example.com/*')
    expect(originPatternFor('https://docs.example.com/a')).not.toBe(
      originPatternFor('https://api.example.com/a'),
    )
  })

  it('refuses schemes an extension cannot read anyway', () => {
    for (const url of [
      'chrome://extensions',
      'chrome-extension://abc/panel.html',
      'about:blank',
      'file:///Users/me/notes.txt',
      'devtools://devtools/bundled/x.html',
    ]) {
      expect(originPatternFor(url)).toBeNull()
    }
  })

  it('refuses a value that is not a URL', () => {
    expect(originPatternFor('')).toBeNull()
    expect(originPatternFor('not a url')).toBeNull()
  })
})

describe('describeSite', () => {
  it('names the host, which is what the user is being asked about', () => {
    expect(describeSite('https://news.example.com/article/1')).toBe('news.example.com')
  })

  it('falls back to something readable rather than throwing', () => {
    expect(describeSite('garbage')).toBe('this page')
  })
})
