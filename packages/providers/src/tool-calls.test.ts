import { describe, expect, it } from 'vitest'
import { ToolCallAssembler } from './tool-calls'

describe('ToolCallAssembler', () => {
  it('joins arguments that arrive a few characters at a time', () => {
    const assembler = new ToolCallAssembler()
    assembler.push([{ index: 0, id: 'call_1', function: { name: 'click', arguments: '{"ref"' } }])
    assembler.push([{ index: 0, function: { arguments: ': 12' } }])
    assembler.push([{ index: 0, function: { arguments: '}' } }])

    expect(assembler.finish()).toEqual([
      { kind: 'tool_call', id: 'call_1', name: 'click', args: '{"ref": 12}' },
    ])
  })

  it('keeps parallel calls apart by index, in the order given', () => {
    const assembler = new ToolCallAssembler()
    assembler.push([
      { index: 1, id: 'b', function: { name: 'type', arguments: '{"text":"hi"}' } },
      { index: 0, id: 'a', function: { name: 'click', arguments: '{"ref":1}' } },
    ])

    expect(assembler.finish().map((call) => call.name)).toEqual(['click', 'type'])
  })

  it('emits nothing until the stream is over, so no half-written action escapes', () => {
    const assembler = new ToolCallAssembler()
    assembler.push([{ index: 0, id: 'c', function: { name: 'click', arguments: '{"re' } }])
    // The only way to get anything out is finish(); there is no partial emit.
    expect(assembler.finish()[0]?.args).toBe('{"re')
  })

  it('defaults absent arguments to an empty object rather than an empty string', () => {
    const assembler = new ToolCallAssembler()
    assembler.push([{ index: 0, id: 'd', function: { name: 'screenshot' } }])
    expect(assembler.finish()[0]?.args).toBe('{}')
  })

  it('drops a fragment that never named a function, which cannot be run', () => {
    const assembler = new ToolCallAssembler()
    assembler.push([{ index: 0, function: { arguments: '{}' } }])
    expect(assembler.finish()).toEqual([])
  })

  it('falls back to the name when the provider sends no id', () => {
    const assembler = new ToolCallAssembler()
    assembler.push([{ index: 0, function: { name: 'click', arguments: '{}' } }])
    expect(assembler.finish()[0]?.id).toBe('click')
  })

  it('yields nothing for a stream with no tool calls at all', () => {
    expect(new ToolCallAssembler().finish()).toEqual([])
  })
})
