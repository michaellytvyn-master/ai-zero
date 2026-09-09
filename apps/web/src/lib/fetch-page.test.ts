import { describe, expect, it } from 'vitest'
import { extractUrls } from './fetch-page'

describe('extractUrls', () => {
  it('finds a link in ordinary prose', () => {
    expect(extractUrls('have a look at https://example.com/a and tell me')).toEqual([
      'https://example.com/a',
    ])
  })

  it('drops the punctuation a sentence ends with', () => {
    expect(extractUrls('see https://example.com/a.')).toEqual(['https://example.com/a'])
    expect(extractUrls('(https://example.com/b)')).toEqual(['https://example.com/b'])
    expect(extractUrls('https://example.com/c, and more')).toEqual(['https://example.com/c'])
  })

  it('keeps order and removes duplicates', () => {
    expect(extractUrls('https://b.test https://a.test https://b.test')).toEqual([
      'https://b.test',
      'https://a.test',
    ])
  })

  /** Reading twenty pages into one prompt would blow any context window. */
  it('takes only the first few', () => {
    const many = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`).join(' ')
    expect(extractUrls(many)).toHaveLength(3)
    expect(extractUrls(many, 5)).toHaveLength(5)
  })

  it('ignores schemes that are not the web', () => {
    expect(extractUrls('file:///etc/passwd and ftp://x.test')).toEqual([])
  })

  it('finds nothing in a message without links', () => {
    expect(extractUrls('just a question about cats')).toEqual([])
  })
})
