const EVENT_DELIMITER = /\r?\n\r?\n/

/**
 * Yields the `data:` payload of each SSE event. A partial delimiter left at a
 * chunk boundary stays in the buffer until the rest of it arrives.
 */
export async function* sseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      for (;;) {
        const match = EVENT_DELIMITER.exec(buffer)
        if (match === null) break
        const event = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const data = payloadOf(event)
        if (data !== null) yield data
      }
    }
    const tail = payloadOf(buffer)
    if (tail !== null) yield tail
  } finally {
    reader.releaseLock()
  }
}

function payloadOf(event: string): string | null {
  const lines = event.split(/\r?\n/).filter((line) => line.startsWith('data:'))
  if (lines.length === 0) return null
  return lines.map((line) => line.slice('data:'.length).trimStart()).join('\n')
}
