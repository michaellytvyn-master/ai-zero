import { describe, expect, it } from 'vitest'
import { decodeEntities, readableText, titleOf } from './html-text'

describe('readableText', () => {
  it('keeps the words and drops the markup', () => {
    expect(readableText('<p>Hello <b>there</b></p>')).toBe('Hello there')
  })

  /** Script and style bodies are most of a page and none of its meaning. */
  it('discards script and style contents entirely', () => {
    const html = '<style>.a{color:red}</style><p>Visible</p><script>alert(1)</script>'
    const text = readableText(html)

    expect(text).toBe('Visible')
    expect(text).not.toContain('color')
    expect(text).not.toContain('alert')
  })

  it('turns block tags into line breaks so paragraphs survive', () => {
    expect(readableText('<p>One</p><p>Two</p>')).toBe('One\nTwo')
    expect(readableText('<li>a</li><li>b</li>')).toBe('a\nb')
  })

  it('collapses the whitespace a formatted document is full of', () => {
    // Two newlines survive as a paragraph break; a run of blank lines does not.
    expect(readableText('<p>a</p>\n\n\n\n<p>b</p>')).toBe('a\n\nb')
    expect(readableText('<p>lots     of      space</p>')).toBe('lots of space')
  })

  it('strips comments, which can hide entire drafts of a page', () => {
    expect(readableText('<!-- secret draft --><p>Published</p>')).toBe('Published')
  })
})

describe('decodeEntities', () => {
  it('decodes named, decimal and hex forms', () => {
    expect(decodeEntities('a &amp; b')).toBe('a & b')
    expect(decodeEntities('&#72;&#105;')).toBe('Hi')
    expect(decodeEntities('&#x48;&#x69;')).toBe('Hi')
    expect(decodeEntities('caf&eacute;')).toBe('caf&eacute;')
  })

  it('leaves an unknown entity alone rather than mangling it', () => {
    expect(decodeEntities('&notarealentity;')).toBe('&notarealentity;')
  })
})

describe('titleOf', () => {
  it('reads the title and decodes it', () => {
    expect(titleOf('<html><head><title>Ben &amp; Jerry</title></head>')).toBe('Ben & Jerry')
  })

  it('is empty when there is no title, rather than undefined', () => {
    expect(titleOf('<html><body>no title</body></html>')).toBe('')
  })
})
