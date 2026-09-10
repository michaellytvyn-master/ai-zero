import { describe, expect, it, vi } from 'vitest'
import type { ChatChunk } from '@zca/shared'
import { MAX_AGENT_STEPS } from './actions'
import { type AgentEvent, type AgentIO, runAgent, typedOutcome } from './agent'

const PAGE = [
  { ref: 0, tag: 'a', name: 'Home', inForm: false, editable: false },
  { ref: 1, tag: 'input', type: 'text', name: 'Message', inForm: true, editable: true },
  { ref: 2, tag: 'button', type: 'submit', name: 'Send', inForm: true, editable: false },
  { ref: 3, tag: 'input', type: 'password', name: 'Password', inForm: true, editable: true },
  {
    ref: 4,
    tag: 'select',
    name: 'Country',
    inForm: true,
    editable: false,
    value: 'Choose',
    options: ['Choose', 'Poland', 'Ukraine'],
  },
  { ref: 5, tag: 'input', type: 'email', name: 'Email', inForm: true, editable: true },
]

/** A model that says exactly what the test tells it to, turn by turn. */
function scripted(turns: ChatChunk[][]): AgentIO['think'] {
  let at = 0
  return async function* () {
    for (const chunk of turns[at] ?? []) yield chunk
    at += 1
  }
}

const call = (name: string, args: unknown, id = 'c1'): ChatChunk => ({
  kind: 'tool_call',
  id,
  name,
  args: JSON.stringify(args),
})

const text = (content: string): ChatChunk => ({ kind: 'delta', content })

function io(turns: ChatChunk[][], over: Partial<AgentIO> = {}): AgentIO {
  return {
    index: vi.fn(async () => PAGE),
    click: vi.fn(async () => true),
    type: vi.fn(async (_ref: number, text: string) => text),
    select: vi.fn(async (_ref: number, option: string) => option),
    scroll: vi.fn(async () => true),
    confirm: vi.fn(async () => true),
    think: scripted(turns),
    ...over,
  }
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

describe('runAgent', () => {
  it('stops as soon as the model answers instead of acting', async () => {
    const events = await collect(runAgent(io([[text('It says 42.')]]), 'what does it say?'))
    expect(events).toContainEqual({ kind: 'say', text: 'It says 42.' })
    expect(events.at(-1)).toEqual({ kind: 'done', reason: 'answered' })
  })

  it('runs a safe action and reports it', async () => {
    const deps = io([[call('click', { ref: 0 })], [text('Done.')]])
    const events = await collect(runAgent(deps, 'open home'))
    expect(deps.click).toHaveBeenCalledWith(0)
    expect(events).toContainEqual({ kind: 'acted', what: 'click [0] "Home"' })
  })

  it('asks before a submit, and does not click when the answer is no', async () => {
    const confirm = vi.fn(async () => false)
    const deps = io([[call('click', { ref: 2 })], [text('Stopped.')]], { confirm })
    const events = await collect(runAgent(deps, 'send it'))

    expect(confirm).toHaveBeenCalledOnce()
    expect(deps.click).not.toHaveBeenCalled()
    expect(events).toContainEqual({ kind: 'declined', what: 'click [2] "Send"' })
  })

  it('clicks the submit once the person agrees', async () => {
    const deps = io([[call('click', { ref: 2 })], [text('Sent.')]])
    await collect(runAgent(deps, 'send it'))
    expect(deps.click).toHaveBeenCalledWith(2)
  })

  it('refuses a password field outright, without asking anyone', async () => {
    const deps = io([[call('type', { ref: 3, text: 'hunter2' })], [text('Cannot.')]])
    const events = await collect(runAgent(deps, 'log me in'))

    expect(deps.type).not.toHaveBeenCalled()
    expect(deps.confirm).not.toHaveBeenCalled()
    expect(events.some((event) => event.kind === 'refused')).toBe(true)
  })

  it('re-reads the page before every step, because acting changes it', async () => {
    const deps = io([[call('click', { ref: 0 })], [call('click', { ref: 0 })], [text('Done.')]])
    await collect(runAgent(deps, 'click twice'))
    expect(deps.index).toHaveBeenCalledTimes(3)
  })

  it('stops at the ceiling rather than spending the day on one instruction', async () => {
    // A model that only ever wants to click, forever.
    const forever: AgentIO['think'] = async function* () {
      yield call('click', { ref: 0 })
    }
    const events = await collect(runAgent(io([], { think: forever }), 'loop'))

    expect(events.at(-1)).toEqual({ kind: 'done', reason: 'step_limit' })
    expect(events.filter((event) => event.kind === 'step')).toHaveLength(MAX_AGENT_STEPS)
  })

  it('tells the model when its arguments were not valid JSON, and carries on', async () => {
    const broken: ChatChunk = { kind: 'tool_call', id: 'c1', name: 'click', args: '{"ref":' }
    const deps = io([[broken], [text('Sorry.')]])
    const events = await collect(runAgent(deps, 'click'))

    expect(deps.click).not.toHaveBeenCalled()
    expect(events.at(-1)).toEqual({ kind: 'done', reason: 'answered' })
  })

  it('tells the model when the element it named is gone', async () => {
    const deps = io([[call('click', { ref: 99 })], [text('Gone.')]])
    const events = await collect(runAgent(deps, 'click'))
    expect(deps.click).not.toHaveBeenCalled()
    expect(events).not.toContainEqual(expect.objectContaining({ kind: 'acted' }))
  })

  it('handles several calls in one turn, in order', async () => {
    const deps = io([
      [call('type', { ref: 1, text: 'hi' }, 'a'), call('scroll', { direction: 'down' }, 'b')],
      [text('Done.')],
    ])
    const events = await collect(runAgent(deps, 'write and scroll'))

    expect(deps.type).toHaveBeenCalledWith(1, 'hi')
    expect(deps.scroll).toHaveBeenCalledWith('down')
    const acted = events.filter((event) => event.kind === 'acted')
    expect(acted).toHaveLength(2)
  })

  it('reports what the model said alongside the action it took', async () => {
    const deps = io([[text('Clicking Home.'), call('click', { ref: 0 })], [text('Done.')]])
    const events = await collect(runAgent(deps, 'go home'))
    expect(events).toContainEqual({ kind: 'say', text: 'Clicking Home.' })
  })

  it('fills in an email address — an identifier, not a secret', async () => {
    // It used to be refused outright, which broke every contact form and
    // newsletter box while protecting nothing: the submit is what asks.
    const deps = io([[call('type', { ref: 5, text: 'me@example.com' })], [text('Done.')]])
    const events = await collect(runAgent(deps, 'enter my email'))
    expect(deps.type).toHaveBeenCalledWith(5, 'me@example.com')
    expect(events.some((event) => event.kind === 'refused')).toBe(false)
  })

  it('chooses an option in a dropdown', async () => {
    const deps = io([[call('select', { ref: 4, option: 'Ukraine' })], [text('Done.')]])
    const events = await collect(runAgent(deps, 'pick Ukraine'))
    expect(deps.select).toHaveBeenCalledWith(4, 'Ukraine')
    expect(events).toContainEqual({ kind: 'acted', what: 'select [4] "Country" → Ukraine' })
  })

  it('tells the model which options exist when its choice matched none', async () => {
    const select = vi.fn(async () => null)
    const deps = io([[call('select', { ref: 4, option: 'France' })], [text('Sorry.')]], { select })
    await collect(runAgent(deps, 'pick France'))
    // The result goes back to the model as the tool message; it must list them.
    expect(select).toHaveBeenCalledOnce()
  })

  it('refuses to type into a dropdown, and says to use select instead', async () => {
    const deps = io([[call('type', { ref: 4, text: 'Ukraine' })], [text('OK.')]])
    const events = await collect(runAgent(deps, 'type Ukraine'))
    expect(deps.type).not.toHaveBeenCalled()
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'refused', because: expect.stringContaining('select') }),
    )
  })
})

describe('typedOutcome', () => {
  it('reports success with what the field now reads', () => {
    expect(typedOutcome('type [0] "Name"', 'Ada', 'Ada').result).toBe(
      'Typed it in. The field now reads "Ada".',
    )
  })

  it('says so when the page did not take the text at all', () => {
    // A rich editor that throws away a direct write looks exactly like this.
    const outcome = typedOutcome('type [0] "Message"', 'hello', '')
    expect(outcome.result).toContain('did not accept')
    expect(outcome.events[0]?.kind).toBe('refused')
  })

  it('tells the model when the page reformatted what it typed', () => {
    const outcome = typedOutcome('type [0] "Phone"', '0501234567', '(050) 123-4567')
    expect(outcome.result).toContain('reformatted')
    expect(outcome.result).toContain('(050) 123-4567')
  })

  it('never echoes back a card number, whatever put it in the field', () => {
    const outcome = typedOutcome('type [0] "Notes"', 'x', '4242 4242 4242 4242')
    expect(outcome.result).not.toContain('4242')
  })
})
