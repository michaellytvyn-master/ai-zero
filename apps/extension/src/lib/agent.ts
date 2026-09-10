import type { ChatChunk, ChatMessage } from '@zca/shared'
import {
  AGENT_SYSTEM_PROMPT,
  AGENT_TOOLS,
  type ElementDescriptor,
  MAX_AGENT_STEPS,
  classifyClick,
  classifySelect,
  classifyType,
  describePage,
  looksLikeCardNumber,
} from './actions'

/**
 * Everything the loop needs from the outside world. Injected so the whole
 * sequence — step limits, refusals, the confirmation gate — can be exercised
 * against a scripted model and a page that does not exist.
 */
export interface AgentIO {
  index(): Promise<ElementDescriptor[]>
  click(ref: number): Promise<boolean>
  /** Resolves to what the field holds afterwards, or null if it is gone. */
  type(ref: number, text: string): Promise<string | null>
  /** Resolves to the option actually chosen, or null if none matched. */
  select(ref: number, option: string): Promise<string | null>
  scroll(direction: 'up' | 'down'): Promise<boolean>
  /** The confirmation gate. Resolves true only if the person said yes. */
  confirm(question: string): Promise<boolean>
  think(messages: readonly ChatMessage[]): AsyncIterable<ChatChunk>
}

export type AgentEvent =
  | { readonly kind: 'step'; readonly n: number }
  | { readonly kind: 'say'; readonly text: string }
  | { readonly kind: 'acted'; readonly what: string }
  | { readonly kind: 'refused'; readonly what: string; readonly because: string }
  | { readonly kind: 'declined'; readonly what: string }
  | { readonly kind: 'done'; readonly reason: 'answered' | 'step_limit' }

interface Parsed {
  readonly ref?: number
  readonly text?: string
  readonly option?: string
  readonly direction?: 'up' | 'down'
}

/**
 * Drives one instruction to completion, or to the step ceiling.
 *
 * The page is re-read before every step, because acting changes it and a stale
 * element number points at whatever now sits in that place. The ceiling is not
 * a nicety: each step re-sends the page, so a loop that wanders spends a free
 * tier's daily allowance rather than merely taking a while.
 */
export async function* runAgent(
  io: AgentIO,
  goal: string,
  history: readonly ChatMessage[] = [],
): AsyncGenerator<AgentEvent> {
  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: goal },
  ]

  for (let step = 1; step <= MAX_AGENT_STEPS; step++) {
    yield { kind: 'step', n: step }

    const elements = await io.index()
    messages.push({
      role: 'user',
      content: `The page now offers these elements:\n${describePage(elements)}`,
    })

    let said = ''
    const calls: { id: string; name: string; args: string }[] = []
    for await (const chunk of io.think(messages)) {
      if (chunk.kind === 'delta') said += chunk.content
      else if (chunk.kind === 'tool_call') {
        calls.push({ id: chunk.id, name: chunk.name, args: chunk.args })
      }
    }

    if (calls.length === 0) {
      // No action asked for: the model has answered rather than acted.
      if (said.trim().length > 0) yield { kind: 'say', text: said.trim() }
      yield { kind: 'done', reason: 'answered' }
      return
    }

    if (said.trim().length > 0) yield { kind: 'say', text: said.trim() }
    messages.push({ role: 'assistant', content: said, toolCalls: calls })

    for (const call of calls) {
      const outcome = await perform(io, call, elements)
      for (const event of outcome.events) yield event
      messages.push({ role: 'tool', content: outcome.result, toolCallId: call.id })
    }
  }

  yield { kind: 'done', reason: 'step_limit' }
}

interface Outcome {
  readonly result: string
  readonly events: AgentEvent[]
}

async function perform(
  io: AgentIO,
  call: { id: string; name: string; args: string },
  elements: readonly ElementDescriptor[],
): Promise<Outcome> {
  const args = parseArgs(call.args)
  if (args === null) {
    return { result: 'Those arguments were not valid JSON. Try again.', events: [] }
  }

  if (call.name === 'scroll') {
    const direction = args.direction === 'up' ? 'up' : 'down'
    await io.scroll(direction)
    return {
      result: `Scrolled ${direction}.`,
      events: [{ kind: 'acted', what: `scroll ${direction}` }],
    }
  }

  if (call.name === 'read_page') {
    // The loop re-reads before every step anyway; this just ends the turn.
    return { result: 'The page will be read again before the next step.', events: [] }
  }

  const element = elements.find((candidate) => candidate.ref === args.ref)
  if (element === undefined) {
    return { result: `There is no element ${String(args.ref)} on this page.`, events: [] }
  }
  const what = `${call.name} [${element.ref}] "${element.name}"`

  if (call.name === 'type') {
    const text = args.text ?? ''
    const verdict = classifyType(element, text)
    if (verdict.kind === 'refuse') {
      return {
        result: `Refused: ${verdict.because}`,
        events: [{ kind: 'refused', what, because: verdict.because }],
      }
    }
    if (verdict.kind === 'confirm' && !(await io.confirm(`${what} — ${verdict.because}`))) {
      return { result: 'The user declined that action.', events: [{ kind: 'declined', what }] }
    }
    const now = await io.type(element.ref, text)
    if (now === null) {
      return { result: 'That element is no longer on the page.', events: [] }
    }
    return typedOutcome(what, text, now)
  }

  if (call.name === 'select') {
    const verdict = classifySelect(element)
    if (verdict.kind === 'refuse') {
      return {
        result: `Refused: ${verdict.because}`,
        events: [{ kind: 'refused', what, because: verdict.because }],
      }
    }
    const chosen = await io.select(element.ref, args.option ?? '')
    if (chosen === null) {
      // Say what exists, so the model's next attempt can be right.
      const offered = element.options?.join(' | ') ?? 'none listed'
      return { result: `No option matched. The options are: ${offered}.`, events: [] }
    }
    return {
      result: `Chose "${chosen}".`,
      events: [{ kind: 'acted', what: `select [${element.ref}] "${element.name}" → ${chosen}` }],
    }
  }

  if (call.name === 'click') {
    const verdict = classifyClick(element)
    if (verdict.kind === 'refuse') {
      return {
        result: `Refused: ${verdict.because}`,
        events: [{ kind: 'refused', what, because: verdict.because }],
      }
    }
    if (verdict.kind === 'confirm' && !(await io.confirm(`${what} — ${verdict.because}`))) {
      return { result: 'The user declined that action.', events: [{ kind: 'declined', what }] }
    }
    const ok = await io.click(element.ref)
    return {
      result: ok ? 'Clicked it.' : 'That element is no longer on the page.',
      events: ok ? [{ kind: 'acted', what }] : [],
    }
  }

  return { result: `There is no tool called ${call.name}.`, events: [] }
}

/**
 * Typed is not the same as accepted. A page can reject a value, reformat it (a
 * phone mask), or — for a rich editor — ignore it entirely, and the model must
 * hear which, rather than moving on as though the field were filled.
 */
export function typedOutcome(what: string, typed: string, now: string): Outcome {
  // The field's contents go to the model; never echo back something shaped
  // like a card number, whatever put it there.
  const shown = looksLikeCardNumber(now) ? '(withheld)' : now
  const want = typed.replace(/\s+/g, ' ').trim()

  if (now.includes(want)) {
    return {
      result: `Typed it in. The field now reads "${shown}".`,
      events: [{ kind: 'acted', what }],
    }
  }
  if (now.length === 0) {
    return {
      result: 'Typed it, but the field is still empty — the page did not accept it.',
      events: [{ kind: 'refused', what, because: 'the page did not accept the text' }],
    }
  }
  return {
    result: `Typed it, but the field now reads "${shown}" — the page may have reformatted or rejected it.`,
    events: [{ kind: 'acted', what: `${what} → "${shown}"` }],
  }
}

function parseArgs(raw: string): Parsed | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) return null
    return {
      ...(typeof parsed.ref === 'number' ? { ref: parsed.ref } : {}),
      ...(typeof parsed.text === 'string' ? { text: parsed.text } : {}),
      ...(typeof parsed.option === 'string' ? { option: parsed.option } : {}),
      ...(parsed.direction === 'up' || parsed.direction === 'down'
        ? { direction: parsed.direction }
        : {}),
    }
  } catch {
    return null
  }
}

export { AGENT_TOOLS, MAX_AGENT_STEPS }
