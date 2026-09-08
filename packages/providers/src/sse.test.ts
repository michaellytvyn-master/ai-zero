import { describe, expect, it } from 'vitest'
import { sseData } from './sse'

function streamOf(...pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece))
      controller.close()
    },
  })
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = []
  for await (const data of sseData(stream)) out.push(data)
  return out
}

describe('sseData', () => {
  it('yields the data payload of each event', async () => {
    expect(await drain(streamOf('data: one\n\ndata: two\n\n'))).toEqual(['one', 'two'])
  })

  it('reassembles an event split across chunk boundaries', async () => {
    expect(await drain(streamOf('data: hel', 'lo\n', '\ndata: world\n\n'))).toEqual([
      'hello',
      'world',
    ])
  })

  it('holds a half-received CRLF delimiter until the rest arrives', async () => {
    expect(await drain(streamOf('data: a\r\n\r', '\ndata: b\r\n\r\n'))).toEqual(['a', 'b'])
  })

  it('ignores comments and non-data fields', async () => {
    expect(await drain(streamOf(': keep-alive\n\nevent: ping\n\ndata: real\n\n'))).toEqual(['real'])
  })

  it('emits a trailing event that arrives without a delimiter', async () => {
    expect(await drain(streamOf('data: [DONE]'))).toEqual(['[DONE]'])
  })

  it('joins multi-line data fields with newlines', async () => {
    expect(await drain(streamOf('data: line one\ndata: line two\n\n'))).toEqual([
      'line one\nline two',
    ])
  })

  it('does not split a multi-byte character across chunks', async () => {
    const bytes = new TextEncoder().encode('data: héllo\n\n')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 8))
        controller.enqueue(bytes.slice(8))
        controller.close()
      },
    })
    expect(await drain(stream)).toEqual(['héllo'])
  })
})
