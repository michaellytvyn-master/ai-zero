import { describe, expect, it, vi } from 'vitest'
import { ConfirmQueue } from './confirm-queue'

describe('ConfirmQueue', () => {
  it('resolves true only when someone actually says yes', async () => {
    const queue = new ConfirmQueue()
    const asked = queue.ask('Click Send?', () => {})
    queue.answer(true, () => {})
    await expect(asked).resolves.toBe(true)
  })

  it('resolves false on no', async () => {
    const queue = new ConfirmQueue()
    const asked = queue.ask('Click Send?', () => {})
    queue.answer(false, () => {})
    await expect(asked).resolves.toBe(false)
  })

  it('answers no when the panel goes away, never yes', async () => {
    // The worst possible default would be to let a closing panel approve.
    const queue = new ConfirmQueue()
    const asked = queue.ask('Buy it?', () => {})
    queue.abandon()
    await expect(asked).resolves.toBe(false)
  })

  it('declines the first question when a second arrives, rather than dangling', async () => {
    const queue = new ConfirmQueue()
    const first = queue.ask('One?', () => {})
    const second = queue.ask('Two?', () => {})
    await expect(first).resolves.toBe(false)

    queue.answer(true, () => {})
    await expect(second).resolves.toBe(true)
  })

  it('tells the panel what to show, and what to stop showing', () => {
    const onChange = vi.fn()
    const queue = new ConfirmQueue()
    void queue.ask('Send?', onChange)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ question: 'Send?' }))

    queue.answer(false, onChange)
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('leaves nothing pending once answered, so a stray abandon is harmless', async () => {
    const queue = new ConfirmQueue()
    const asked = queue.ask('Send?', () => {})
    queue.answer(true, () => {})
    queue.abandon()
    await expect(asked).resolves.toBe(true)
    expect(queue.pending).toBeNull()
  })
})
