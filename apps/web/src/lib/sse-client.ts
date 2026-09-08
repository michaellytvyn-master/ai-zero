export interface SseEvent {
  readonly name: string
  readonly data: Record<string, unknown>
}

/**
 * Browser-side counterpart to the parser in @zca/providers. Kept separate
 * because that one yields raw payload strings for OpenAI-shaped streams, while
 * the app's own endpoint uses named events.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer)
        if (match === null) break
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)

        let name = 'message'
        const dataLines: string[] = []
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith('event:')) name = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
        }
        if (dataLines.length === 0) continue

        try {
          yield { name, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> }
        } catch {
          // A malformed frame is skipped rather than killing the stream.
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
