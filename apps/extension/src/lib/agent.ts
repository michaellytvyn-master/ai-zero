import type { ChatChunk, ChatMessage } from '@zca/shared'
import {
  AGENT_SYSTEM_PROMPT,
  AGENT_TOOLS,
  type ElementDescriptor,
  MAX_AGENT_STEPS,
  classifyClick,
  classifyKey,
  classifyNavigate,
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
  /** What happened: 'submitted', 'handled', 'pressed' or 'missing'. */
  pressKey(key: string, ref: number | null): Promise<string>
  navigate(url: string): Promise<void>
  back(): Promise<boolean>
  /** The page's text, fenced and labelled as material rather than instruction. */
  readText(): Promise<string>
  /** Waits for any load an action started; resolves to the tab's address. */
  settle(): Promise<string>
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
  readonly key?: string
  readonly url?: string
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

    // An action may have started a navigation; reading mid-load reads the old
    // document as it is torn down.
    const address = where(await io.settle())
    let elements: ElementDescriptor[] = []
    try {
      elements = await io.index()
      messages.push({
        role: 'user',
        content: `You are on ${address}. The page offers these elements:\n${describePage(elements)}`,
      })
    } catch {
      // Browser pages, the extension store and PDF viewers cannot be scripted.
      // Say so, and let the model go back or answer, rather than ending here.
      messages.push({
        role: 'user',
        content: `You are on ${address}, which this extension cannot read or act on. Go back, open another address the user gave, or answer.`,
      })
    }

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
      const outcome = await perform(io, call, elements, goal)
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

/**
 * Where the tab is, for the model's bearings — without the query string, which
 * is where session tokens, reset links and OAuth codes live.
 */
export function where(address: string): string {
  try {
    const url = new URL(address)
    return `${url.origin}${url.pathname}`
  } catch {
    return 'an unknown page'
  }
}

async function perform(
  io: AgentIO,
  call: { id: string; name: string; args: string },
  elements: readonly ElementDescriptor[],
  goal: string,
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

  if (call.name === 'read_text') {
    try {
      return { result: await io.readText(), events: [{ kind: 'acted', what: 'read the page' }] }
    } catch {
      return { result: 'This page’s text could not be read.', events: [] }
    }
  }

  if (call.name === 'go_back') {
    const went = await io.back()
    return {
      result: went ? 'Went back.' : 'There is no earlier page in this tab.',
      events: went ? [{ kind: 'acted', what: 'go back' }] : [],
    }
  }

  if (call.name === 'navigate') {
    const url = args.url ?? ''
    const links = elements.flatMap((element) => (element.href === undefined ? [] : [element.href]))
    const verdict = classifyNavigate(url, links, goal)
    const what = `open ${url}`
    if (verdict.kind === 'refuse') {
      return {
        result: `Refused: ${verdict.because}`,
        events: [{ kind: 'refused', what, because: verdict.because }],
      }
    }
    if (verdict.kind === 'confirm' && !(await io.confirm(verdict.because))) {
      return {
        result: 'The user declined to open that address.',
        events: [{ kind: 'declined', what }],
      }
    }
    await io.navigate(url.includes('://') ? url : `https://${url}`)
    return { result: `Opening ${url}.`, events: [{ kind: 'acted', what }] }
  }

  if (call.name === 'press_key') {
    const key = args.key ?? ''
    const target = args.ref === undefined ? undefined : elements.find((e) => e.ref === args.ref)
    if (args.ref !== undefined && target === undefined) {
      return { result: `There is no element ${String(args.ref)} on this page.`, events: [] }
    }
    const verdict = classifyKey(key, target)
    const what =
      target === undefined ? `press ${key}` : `press ${key} on [${target.ref}] "${target.name}"`
    if (verdict.kind === 'refuse') {
      return {
        result: `Refused: ${verdict.because}`,
        events: [{ kind: 'refused', what, because: verdict.because }],
      }
    }
    if (verdict.kind === 'confirm' && !(await io.confirm(`${what} — ${verdict.because}`))) {
      return { result: 'The user declined that action.', events: [{ kind: 'declined', what }] }
    }
    const happened = await io.pressKey(key, target?.ref ?? null)
    if (happened === 'missing') {
      return { result: 'Nothing was focused to press it on.', events: [] }
    }
    const note =
      happened === 'submitted'
        ? 'The form was submitted.'
        : happened === 'handled'
          ? 'The page responded to it.'
          : 'Pressed.'
    return { result: note, events: [{ kind: 'acted', what }] }
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
      ...(typeof parsed.key === 'string' ? { key: parsed.key } : {}),
      ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      ...(parsed.direction === 'up' || parsed.direction === 'down'
        ? { direction: parsed.direction }
        : {}),
    }
  } catch {
    return null
  }
}

export { AGENT_TOOLS, MAX_AGENT_STEPS }
