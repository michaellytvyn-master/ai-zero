import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./background.ts', import.meta.url), 'utf8')

function bodyOf(name: string): string {
  const start = source.indexOf(`function ${name}(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const opened = source.indexOf('{', start)
  let depth = 0
  for (let i = opened; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(opened, i + 1)
    }
  }
  throw new Error(`could not read the body of ${name}`)
}

/**
 * Chrome accepts sidePanel.open only while the user gesture is still on the
 * stack. A single await before it — even on setOptions — fails at runtime with
 * "may only be called in response to a user gesture", and nothing but a real
 * browser surfaces that. These assertions are the substitute.
 */
describe('opening the panel keeps the user gesture', () => {
  it('does not await anything before sidePanel.open', () => {
    const body = bodyOf('openOnTab')
    const beforeOpen = body.slice(0, body.indexOf('sidePanel.open'))

    expect(beforeOpen).not.toContain('await')
  })

  it('is a plain function, so it cannot be awaited into a later task', () => {
    expect(source).toContain('function openOnTab(')
    expect(source).not.toContain('async function openOnTab')
  })

  it('is called without await from every entry point a user can trigger', () => {
    const calls = [...source.matchAll(/(\w+\s+)?openOnTab\(/g)].map((match) => match[0])
    const invocations = calls.filter((call) => !call.startsWith('function'))

    expect(invocations.length).toBeGreaterThanOrEqual(3)
    for (const call of invocations) expect(call).not.toContain('await')
  })

  it('takes the tab from the command event instead of looking it up', () => {
    // chrome.tabs.query would have to be awaited, which loses the gesture.
    const listener = source.slice(source.indexOf('chrome.commands.onCommand'))
    expect(listener.slice(0, listener.indexOf('})'))).not.toContain('chrome.tabs.query')
  })
})
