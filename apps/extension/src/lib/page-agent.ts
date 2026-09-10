import type { ElementDescriptor } from './actions'

/**
 * The page half of the agent. Every function here is serialised and injected by
 * chrome.scripting, so each must be self-contained: no imports, no closures
 * over module scope. That is why the constants are repeated inside them.
 */

/**
 * Capped so one crowded page cannot spend a large share of a daily token
 * allowance in a single step. Wikipedia offers 516 visible controls, which is
 * about 2 500 tokens; 150 keeps a step near 800.
 */
export const MAX_ELEMENTS = 150

export async function indexPage(tabId: number): Promise<ElementDescriptor[]> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collect,
    args: [MAX_ELEMENTS],
  })
  return (result?.result as ElementDescriptor[] | undefined) ?? []
}

export async function clickRef(tabId: number, ref: number): Promise<boolean> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: doClick,
    args: [ref],
  })
  return result?.result === true
}

/**
 * Returns what the field holds afterwards, or null if the element is gone.
 * The contents rather than a yes/no, because "typed" is not the same as
 * "accepted": a page can reject a value or reformat it, and the model should
 * see that instead of reporting success.
 */
export async function typeRef(tabId: number, ref: number, text: string): Promise<string | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: doType,
    args: [ref, text],
  })
  return typeof result?.result === 'string' ? result.result : null
}

/** What happened: 'submitted', 'handled' by the page, 'pressed', or 'missing'. */
export async function pressKey(tabId: number, key: string, ref: number | null): Promise<string> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: doPressKey,
    args: [ref, key],
  })
  return typeof result?.result === 'string' ? result.result : 'missing'
}

export async function navigateTab(tabId: number, url: string): Promise<void> {
  await chrome.tabs.update(tabId, { url })
}

export async function goBackTab(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.goBack(tabId)
    return true
  } catch {
    // No history to go back to.
    return false
  }
}

/**
 * Waits for the tab to finish loading before the page is read again. An action
 * may have started a navigation, and indexing mid-load reads the old document
 * as it is torn down, or nothing at all. A page that routes on the client never
 * reports "loading", so there is a short pause after it says complete.
 */
export async function waitForSettled(tabId: number, timeoutMs = 10_000): Promise<string> {
  const started = Date.now()
  let tab = await chrome.tabs.get(tabId)
  while (tab.status !== 'complete' && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    tab = await chrome.tabs.get(tabId)
  }
  await new Promise((resolve) => setTimeout(resolve, 400))
  return tab.url ?? ''
}

/** Returns the text of the option actually chosen, or null if none matched. */
export async function selectRef(
  tabId: number,
  ref: number,
  option: string,
): Promise<string | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: doSelect,
    args: [ref, option],
  })
  return typeof result?.result === 'string' ? result.result : null
}

export async function scrollPage(tabId: number, direction: 'up' | 'down'): Promise<boolean> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: doScroll,
    args: [direction],
  })
  return result?.result === true
}

// ---------------------------------------------------------------------------
// Injected. Written in plain DOM, and stamped with an attribute so that a later
// click addresses the same element even after the page has re-rendered.
// ---------------------------------------------------------------------------

function collect(limit: number): unknown[] {
  const SELECTOR =
    'a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=checkbox],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true]'

  // Input types that take typed text. Anything else — checkbox, radio, file,
  // range, color — is clicked or chosen, never typed into.
  const TYPEABLE = [
    '',
    'text',
    'search',
    'email',
    'tel',
    'url',
    'number',
    'password',
    'date',
    'time',
    'datetime-local',
    'month',
    'week',
  ]

  const clean = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim()

  // A label's own words, without those of any control inside it. A <select>
  // wrapped in its label would otherwise contribute every one of its options.
  const labelText = (label: Element): string => {
    const copy = label.cloneNode(true) as Element
    for (const control of Array.from(copy.querySelectorAll('input,select,textarea,button'))) {
      control.remove()
    }
    return clean(copy.textContent)
  }

  /**
   * What a screen reader would announce, in the order the accessibility spec
   * resolves it. A form field has no text of its own: its name lives in a
   * <label>, which the first version of this function never looked at — so on
   * any properly built form every field reached the model as "".
   */
  const accessibleName = (element: HTMLElement, tag: string, type: string | undefined): string => {
    const labelledBy = element.getAttribute('aria-labelledby')
    if (labelledBy !== null) {
      const text = clean(
        labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' '),
      )
      if (text !== '') return text
    }

    const aria = clean(element.getAttribute('aria-label'))
    if (aria !== '') return aria

    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      // .labels covers both <label for="id"> and a label wrapped around it.
      const labels = (element as HTMLInputElement).labels
      if (labels !== null && labels.length > 0) {
        const text = clean(Array.from(labels).map(labelText).join(' '))
        if (text !== '') return text
      }
      const placeholder = clean(element.getAttribute('placeholder'))
      if (placeholder !== '') return placeholder
      const title = clean(element.getAttribute('title'))
      if (title !== '') return title
      if (tag === 'input' && ['submit', 'button', 'reset'].includes(type ?? '')) {
        const value = clean((element as HTMLInputElement).value)
        if (value !== '') return value
      }
      // Last resort: the name or id a developer gave it, usually readable.
      return clean((element.getAttribute('name') ?? element.id).replace(/[-_]+/g, ' '))
    }

    const text = clean(element.textContent)
    return text !== '' ? text : clean(element.getAttribute('title'))
  }

  const out: unknown[] = []
  let ref = 0

  for (const node of Array.from(document.querySelectorAll(SELECTOR))) {
    if (out.length >= limit) break
    const element = node as HTMLElement

    const box = element.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) continue
    const style = window.getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    if ((element as HTMLInputElement).disabled === true) continue
    if (element.getAttribute('aria-hidden') === 'true') continue

    const tag = element.tagName.toLowerCase()
    const type = element.getAttribute('type')?.toLowerCase() ?? undefined
    const role = element.getAttribute('role') ?? undefined
    const name = accessibleName(element, tag, type).slice(0, 120)

    const readOnly =
      (element as HTMLInputElement).readOnly === true ||
      element.getAttribute('aria-readonly') === 'true'
    const editable =
      !readOnly &&
      (tag === 'textarea' ||
        element.isContentEditable ||
        role === 'textbox' ||
        (tag === 'input' && TYPEABLE.includes(type ?? '')))

    // What the field holds now, so the model can tell whether its typing
    // landed. Never a password: that would hand an autofilled secret to the
    // model provider. Further filtering happens before anything is sent.
    let value: string | undefined
    let options: string[] | undefined
    let checked: boolean | undefined
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
      // A checkbox's value attribute is "on" whatever its state; what matters
      // is whether it is ticked.
      checked = (element as HTMLInputElement).checked
    } else if (tag === 'select') {
      const select = element as HTMLSelectElement
      options = Array.from(select.options)
        .map((option) => clean(option.textContent))
        .filter((text) => text !== '')
        .slice(0, 20)
      value = clean(select.selectedOptions[0]?.textContent)
    } else if (tag === 'textarea' || (tag === 'input' && type !== 'password' && editable)) {
      value = clean((element as HTMLInputElement).value).slice(0, 60)
    } else if (element.isContentEditable) {
      value = clean(element.textContent).slice(0, 60)
    }

    // Absolute, so it can be compared with an address the model asks to open.
    const href = tag === 'a' ? (element as HTMLAnchorElement).href : undefined

    element.setAttribute('data-zca-ref', String(ref))
    out.push({
      ref,
      tag,
      ...(type === undefined ? {} : { type }),
      ...(role === undefined ? {} : { role }),
      name,
      inForm: element.closest('form') !== null,
      editable,
      ...(value === undefined ? {} : { value }),
      ...(options === undefined ? {} : { options }),
      ...(checked === undefined ? {} : { checked }),
      ...(href === undefined || href === '' ? {} : { href }),
    })
    ref += 1
  }

  return out
}

function doClick(ref: number): boolean {
  const target = document.querySelector(`[data-zca-ref="${ref}"]`) as HTMLElement | null
  if (target === null) return false
  target.scrollIntoView({ block: 'center', behavior: 'instant' })
  // The agent works in one tab. A link that opens another would take the page
  // it just asked for somewhere it can never see, so it opens here instead.
  if (
    target instanceof HTMLAnchorElement &&
    target.target === '_blank' &&
    /^https?:/.test(target.href)
  ) {
    target.removeAttribute('target')
  }
  target.click()
  return true
}

async function doType(ref: number, text: string): Promise<string | null> {
  const target = document.querySelector(`[data-zca-ref="${ref}"]`) as HTMLElement | null
  if (target === null) return null
  target.scrollIntoView({ block: 'center', behavior: 'instant' })
  target.focus()

  const read = (): string =>
    (target.isContentEditable ? (target.textContent ?? '') : (target as HTMLInputElement).value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120)

  if (target.isContentEditable) {
    // Rich editors — Lexical, ProseMirror, Draft.js, the ones behind most
    // message boxes — keep their own document and redraw the DOM from it.
    // Writing textContent is thrown away: Lexical reverted it outright. Going
    // through the browser's editing pipeline is what real typing does, and
    // every editor listens to that.
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    selection?.removeAllRanges()
    selection?.addRange(range)
    // Editors sync their own selection from 'selectionchange', which fires
    // asynchronously. Inserting before it lands inserts nowhere — measured on
    // Lexical, where an immediate insert silently did nothing.
    await new Promise((resolve) => setTimeout(resolve, 80))
    document.execCommand('insertText', false, text)
    await new Promise((resolve) => setTimeout(resolve, 60))
    if (read().includes(text.replace(/\s+/g, ' ').trim())) return read()

    // A bare contenteditable with no editor model behind it.
    target.textContent = text
    target.dispatchEvent(new InputEvent('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 60))
    return read()
  }

  const field = target as HTMLInputElement | HTMLTextAreaElement
  // Assigning .value directly updates the DOM but not React's state, so the
  // field looks filled while the form submits the old value — measured on a
  // controlled MUI field. The native setter is what React's tracker watches.
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter === undefined) return null
  setter.call(field, text)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
  return read()
}

function doSelect(ref: number, wanted: string): string | null {
  const target = document.querySelector(`[data-zca-ref="${ref}"]`)
  if (!(target instanceof HTMLSelectElement)) return null

  const want = wanted.replace(/\s+/g, ' ').trim().toLowerCase()
  const options = Array.from(target.options)
  const label = (option: HTMLOptionElement) =>
    (option.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  // Exact text first, then the option's value, then a partial match — models
  // tend to say "Two" for an option reading "Two (recommended)".
  const chosen =
    options.find((option) => label(option) === want) ??
    options.find((option) => option.value.toLowerCase() === want) ??
    options.find((option) => label(option).includes(want))
  if (chosen === undefined) return null

  target.scrollIntoView({ block: 'center', behavior: 'instant' })
  // Through the native setter, for the same reason as doType: a framework
  // watching the element would otherwise miss the change.
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  if (setter === undefined) return null
  setter.call(target, chosen.value)
  target.dispatchEvent(new Event('input', { bubbles: true }))
  target.dispatchEvent(new Event('change', { bubbles: true }))
  return (chosen.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function doPressKey(ref: number | null, key: string): Promise<string> {
  const target =
    ref === null
      ? (document.activeElement as HTMLElement | null)
      : (document.querySelector(`[data-zca-ref="${ref}"]`) as HTMLElement | null)
  if (target === null) return 'missing'
  target.focus()

  const init = { key, code: key, bubbles: true, cancelable: true }
  const down = new KeyboardEvent('keydown', init)
  target.dispatchEvent(down)
  target.dispatchEvent(new KeyboardEvent('keyup', init))

  // A dispatched key reaches the page's own handlers — which is how chat boxes
  // and most apps respond to Enter — but the browser performs no default
  // action for it, so a plain form would never submit. Do what Enter would
  // have done, unless a handler already dealt with it.
  if (key === 'Enter' && !down.defaultPrevented) {
    const form = (target as HTMLInputElement).form ?? target.closest('form')
    if (form !== null && !(target instanceof HTMLTextAreaElement)) {
      form.requestSubmit()
      return 'submitted'
    }
  }
  return down.defaultPrevented ? 'handled' : 'pressed'
}

function doScroll(direction: 'up' | 'down'): boolean {
  window.scrollBy({
    top: direction === 'down' ? window.innerHeight * 0.85 : -window.innerHeight * 0.85,
    behavior: 'instant',
  })
  return true
}
