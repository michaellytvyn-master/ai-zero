import { describe, expect, it } from 'vitest'
import { ThinkSplitter } from './think-split'

/** Feeds the text one character at a time — the worst case for tag splitting. */
function byCharacter(text: string): { delta: string; reasoning: string } {
  const splitter = new ThinkSplitter()
  const pieces = [...text].flatMap((character) => splitter.push(character))
  pieces.push(...splitter.end())
  return {
    delta: pieces
      .filter((piece) => piece.kind === 'delta')
      .map((piece) => piece.content)
      .join(''),
    reasoning: pieces
      .filter((piece) => piece.kind === 'reasoning')
      .map((piece) => piece.content)
      .join(''),
  }
}

describe('ThinkSplitter', () => {
  it('passes text through untouched when there is no reasoning', () => {
    expect(byCharacter('Just an answer.')).toEqual({ delta: 'Just an answer.', reasoning: '' })
  })

  it('separates a reasoning block from the answer', () => {
    expect(byCharacter('<think>weighing it up</think>The answer.')).toEqual({
      delta: 'The answer.',
      reasoning: 'weighing it up',
    })
  })

  it('handles a tag split across chunks', () => {
    const splitter = new ThinkSplitter()
    const pieces = ['<thi', 'nk>why</thi', 'nk>done'].flatMap((chunk) => splitter.push(chunk))
    pieces.push(...splitter.end())
    expect(pieces).toEqual([
      { kind: 'reasoning', content: 'why' },
      { kind: 'delta', content: 'done' },
    ])
  })

  it('keeps text that only looks like the start of a tag', () => {
    expect(byCharacter('a < b and c <thinking is fun')).toEqual({
      delta: 'a < b and c <thinking is fun',
      reasoning: '',
    })
  })

  it('treats an unclosed block as reasoning rather than leaking it as the answer', () => {
    // Happens whenever max_tokens cuts the model off mid-thought.
    expect(byCharacter('<think>ran out of room')).toEqual({
      delta: '',
      reasoning: 'ran out of room',
    })
  })

  it('handles several blocks in one reply', () => {
    expect(byCharacter('<think>one</think>A<think>two</think>B')).toEqual({
      delta: 'AB',
      reasoning: 'onetwo',
    })
  })

  it('emits nothing for an empty stream', () => {
    const splitter = new ThinkSplitter()
    expect(splitter.push('')).toEqual([])
    expect(splitter.end()).toEqual([])
  })
})
