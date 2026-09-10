import type { ChatChunk } from '@zca/shared'

interface Fragment {
  readonly index: number
  readonly id?: string | null | undefined
  readonly function?:
    | { name?: string | null | undefined; arguments?: string | null | undefined }
    | undefined
}

/**
 * Reassembles streamed tool calls.
 *
 * Providers send them a piece at a time and address the pieces by `index`:
 * the first carries the id and the function name, the rest carry slices of the
 * JSON arguments. Emitting a call before its arguments are complete would hand
 * the caller a half-written action, so nothing leaves here until the stream is
 * over.
 */
export class ToolCallAssembler {
  private readonly byIndex = new Map<number, { id: string; name: string; args: string }>()

  push(fragments: readonly Fragment[]): void {
    for (const fragment of fragments) {
      const existing = this.byIndex.get(fragment.index) ?? { id: '', name: '', args: '' }
      this.byIndex.set(fragment.index, {
        id: fragment.id ?? existing.id,
        name: fragment.function?.name ?? existing.name,
        args: existing.args + (fragment.function?.arguments ?? ''),
      })
    }
  }

  /** Complete calls, in the order the provider numbered them. */
  finish(): Extract<ChatChunk, { kind: 'tool_call' }>[] {
    return (
      [...this.byIndex.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call)
        // A fragment that never carried a name is not a call we can run.
        .filter((call) => call.name.length > 0)
        .map((call) => ({
          kind: 'tool_call' as const,
          id: call.id.length > 0 ? call.id : call.name,
          name: call.name,
          args: call.args.length > 0 ? call.args : '{}',
        }))
    )
  }
}
