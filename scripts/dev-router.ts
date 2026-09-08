/**
 * Phase 1 harness: serves the router core over plain node:http so the failover
 * can be exercised with curl. In Phase 6 the same handlers get mounted as
 * Next.js route handlers; nothing here is meant to ship.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import {
  CEREBRAS_BASE_URL,
  GROQ_BASE_URL,
  MISTRAL_BASE_URL,
  createCerebras,
  createGroq,
  createMistral,
  type Provider,
} from '@zca/providers'
import {
  MemoryCooldownStore,
  handleChatCompletions,
  handleHealth,
  handleModels,
  type FailoverDeps,
  type ProviderKey,
} from '@zca/router-core'
import type { UsageEvent } from '@zca/shared'

const config = {
  port: Number(process.env['PORT'] ?? 8787),
  firstTokenTimeoutMs: Number(process.env['FIRST_TOKEN_TIMEOUT_MS'] ?? 8000),
  cooldownSeconds: Number(process.env['PROVIDER_COOLDOWN_SECONDS'] ?? 60),
} as const

// Base URLs default to the values verified against each provider's docs; the
// override exists so the failover can be driven against local stubs.
const providers: readonly Provider[] = [
  createMistral(process.env['MISTRAL_BASE_URL'] ?? MISTRAL_BASE_URL),
  createGroq(process.env['GROQ_BASE_URL'] ?? GROQ_BASE_URL),
  createCerebras(process.env['CEREBRAS_BASE_URL'] ?? CEREBRAS_BASE_URL),
].sort((a, b) => a.priority - b.priority)

const keyFor = (provider: Provider): ProviderKey | null => {
  const key = process.env[provider.keyEnvVar]?.trim()
  return key ? { key, owner: 'operator' } : null
}

const deps: FailoverDeps = {
  providers,
  keyFor,
  cooldowns: new MemoryCooldownStore(),
  recordUsage: async (event: UsageEvent) => {
    // Constraint 3: provider, model, tokens, latency, status, timestamp. Nothing else.
    console.log(
      `usage ${event.providerId} ${event.model} in=${event.inputTokens} out=${event.outputTokens} ${event.latencyMs}ms ${event.status}`,
    )
  },
  firstTokenTimeoutMs: config.firstTokenTimeoutMs,
  cooldownSeconds: config.cooldownSeconds,
  now: Date.now,
}

const server = createServer((req, res) => {
  void route(req, res).catch((error: unknown) => {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { type: 'internal_error', message: String(error) } }))
  })
})

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const request = toRequest(req)
  const path = new URL(request.url).pathname

  if (req.method === 'POST' && path === '/v1/chat/completions') {
    return send(res, await handleChatCompletions(request, deps))
  }
  if (req.method === 'GET' && path === '/v1/models') return send(res, handleModels())
  if (req.method === 'GET' && path === '/health') return send(res, handleHealth({ keyFor }))

  return send(res, Response.json({ error: { type: 'not_found' } }, { status: 404 }))
}

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value)
    else if (Array.isArray(value)) for (const one of value) headers.append(name, one)
  }
  const carriesBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(new URL(req.url ?? '/', `http://localhost:${config.port}`), {
    method: req.method ?? 'GET',
    headers,
    body: carriesBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : null,
    duplex: 'half',
  } as RequestInit)
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.flushHeaders()
  if (response.body === null) {
    res.end()
    return
  }
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    res.write(chunk)
  }
  res.end()
}

server.listen(config.port, () => {
  const configured = providers.filter((p) => keyFor(p) !== null).map((p) => p.id)
  console.log(`router listening on http://localhost:${config.port}`)
  console.log(`providers with keys: ${configured.join(', ') || '(none)'}`)
})
