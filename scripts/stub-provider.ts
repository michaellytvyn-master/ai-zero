/**
 * Phase 1 only: fake OpenAI-compatible endpoints, so the failover chain can be
 * driven over real HTTP without burning anyone's free-tier quota.
 *
 * STUB_SPEC="9001:429:groq,9002:stream:cloudflare"
 */
import { appendFileSync } from 'node:fs'
import { type ServerResponse, createServer } from 'node:http'

interface Stub {
  readonly port: number
  readonly mode: string
  readonly name: string
}

const stubs: Stub[] = (process.env.STUB_SPEC ?? '9001:stream:stub').split(',').map((entry) => {
  const [port, mode, name] = entry.split(':')
  return { port: Number(port), mode: mode ?? 'stream', name: name ?? 'stub' }
})

const failures: Record<string, number> = { '429': 429, '401': 401, '500': 500 }

for (const stub of stubs) {
  createServer((req, res) => {
    // Lets a check assert what the router actually put on the wire.
    if (process.env.STUB_LOG !== undefined) {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        appendFileSync(process.env.STUB_LOG as string, `${Buffer.concat(chunks).toString()}\n`)
      })
    }

    // Whisper is a plain JSON endpoint, not a stream, so it answers separately.
    if ((req.url ?? '').includes('/audio/transcriptions')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ text: `transcribed by ${stub.name}` }))
      return
    }

    const status = failures[stub.mode]
    if (status !== undefined) {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (status === 429) headers['retry-after'] = '30'
      res.writeHead(status, headers)
      res.end(JSON.stringify({ error: { message: `${stub.name} says ${stub.mode}` } }))
      return
    }
    streamAnswer(res, stub)
    req.on('close', () => res.destroy())
  }).listen(stub.port, () => console.log(`stub ${stub.name} (${stub.mode}) on ${stub.port}`))
}

function streamAnswer(res: ServerResponse, stub: Stub): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const words = ['This ', 'answer ', 'came ', 'from ', `${stub.name}.`]
  let sent = 0

  const timer = setInterval(() => {
    if (stub.mode === 'slow') return // never produces a first token
    if (sent < words.length) {
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: words[sent] }, finish_reason: null }] })}\n\n`,
      )
      sent += 1
      return
    }
    res.write(
      `data: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: words.length },
      })}\n\n`,
    )
    res.write('data: [DONE]\n\n')
    res.end()
    clearInterval(timer)
  }, 30)

  res.on('close', () => clearInterval(timer))
}
