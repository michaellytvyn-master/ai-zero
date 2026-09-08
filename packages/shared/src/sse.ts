export interface SseEvent {
  readonly name: string
  readonly data: Record<string, unknown>
}

/**
 * Reads SSE frames that carry an event name. The parser in @zca/providers
 * yields raw payloads for OpenAI-shaped provider streams; this one is for our
 * own endpoints, where the name distinguishes meta from delta from usage.
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
