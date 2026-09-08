import { describe, expect, it } from 'vitest'
import { asDownloadUrl } from './download-url'

const URL_ = 'https://res.cloudinary.com/demo/image/upload/v1/zca/user/abc.png'

describe('asDownloadUrl', () => {
  it('adds the attachment flag so the browser saves rather than displays', () => {
    expect(asDownloadUrl(URL_, 'cat')).toBe(
      'https://res.cloudinary.com/demo/image/upload/fl_attachment:cat/v1/zca/user/abc.png',
    )
  })

  it('sanitises the filename, which lands in a URL path segment', () => {
    expect(asDownloadUrl(URL_, 'a photo/of..a cat?')).toContain('fl_attachment:a-photo-of..a-cat-')
    expect(asDownloadUrl(URL_, 'x'.repeat(200))).not.toContain('x'.repeat(61))
  })

  it('leaves a URL it does not recognise alone rather than corrupting it', () => {
    expect(asDownloadUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
  })
})
