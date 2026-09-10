/**
 * Splits reasoning out of a streamed answer.
 *
 * Models that think in-band (Cloudflare's QwQ, and anything on Groq asked for
 * `reasoning_format: "raw"`) wrap it in <think>…</think> inside the ordinary
 * content field. The tag can arrive split across SSE chunks — "<thi" then
 * "nk>" — so this keeps a small buffer rather than matching per chunk.
 */

const OPEN = '<think>'
const CLOSE = '</think>'

export interface SplitPiece {
  readonly kind: 'delta' | 'reasoning'
  readonly content: string
}

export class ThinkSplitter {
  /** Text held back because it might be the start of a tag. */
  private pending = ''
  private inside = false

  push(chunk: string): SplitPiece[] {
    this.pending += chunk
    const out: SplitPiece[] = []

    for (;;) {
      const tag = this.inside ? CLOSE : OPEN
      const at = this.pending.indexOf(tag)

      if (at !== -1) {
        this.emit(out, this.pending.slice(0, at))
        this.pending = this.pending.slice(at + tag.length)
        this.inside = !this.inside
        continue
      }

      // No complete tag. Release everything that cannot be the start of one,
      // and keep the tail that still could be.
      const keep = partialTagLength(this.pending, tag)
      this.emit(out, this.pending.slice(0, this.pending.length - keep))
      this.pending = this.pending.slice(this.pending.length - keep)
      return out
    }
  }

  /** Releases the held-back tail once the provider has stopped sending. */
  end(): SplitPiece[] {
    const out: SplitPiece[] = []
    this.emit(out, this.pending)
    this.pending = ''
    return out
  }

  private emit(out: SplitPiece[], text: string): void {
    if (text.length === 0) return
    out.push({ kind: this.inside ? 'reasoning' : 'delta', content: text })
  }
}

/**
 * How many trailing characters could still grow into `tag`. "a<thi" keeps 4,
 * "a<b" keeps 0 — anything that already cannot match is safe to release.
 */
function partialTagLength(text: string, tag: string): number {
  const most = Math.min(tag.length - 1, text.length)
  for (let length = most; length > 0; length--) {
    if (tag.startsWith(text.slice(text.length - length))) return length
  }
  return 0
}
