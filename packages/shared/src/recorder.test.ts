import { describe, expect, it } from 'vitest'
import { pickMimeType } from './recorder'

describe('pickMimeType', () => {
  it('prefers opus in webm, which is what Chrome produces and Whisper accepts', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('falls back through the list when the first choices are unsupported', () => {
    expect(pickMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4')
    expect(pickMimeType((type) => !type.includes('codecs'))).toBe('audio/webm')
  })

  it('returns undefined so the recorder can fall back to the browser default', () => {
    expect(pickMimeType(() => false)).toBeUndefined()
  })

  it('only offers formats the transcription API accepts', () => {
    const accepted = ['webm', 'ogg', 'mp4', 'mp3', 'wav', 'flac', 'mpeg', 'm4a']
    for (const only of [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]) {
      const chosen = pickMimeType((type) => type === only)
      expect(chosen).toBe(only)
      expect(accepted.some((format) => only.includes(format))).toBe(true)
    }
  })
})
