'use client'

import { MAX_RECORDING_SECONDS } from '@zca/providers'
import { MIC, MIC_OFF, MicrophoneError, type ActiveRecording, startRecording } from '@zca/shared'
import { useRef, useState } from 'react'
import Icon from './icon'

type State = 'idle' | 'recording' | 'transcribing'

export default function MicButton({
  onText,
  onError,
}: {
  onText: (text: string) => void
  onError: (message: string) => void
}) {
  const [state, setState] = useState<State>('idle')
  const active = useRef<ActiveRecording | null>(null)

  async function begin() {
    onError('')
    try {
      active.current = await startRecording(MAX_RECORDING_SECONDS)
      setState('recording')
    } catch (error) {
      onError(error instanceof MicrophoneError ? error.message : 'Could not start recording.')
    }
  }

  async function finish() {
    const recording = active.current
    active.current = null
    if (recording === null) return

    setState('transcribing')
    try {
      const { blob } = await recording.stop()
      const form = new FormData()
      form.append('file', blob, 'audio.webm')

      const response = await fetch('/api/transcribe', { method: 'POST', body: form })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { type?: string }
        } | null
        onError(
          body?.error?.type === 'demo_exhausted'
            ? "Today's free messages are used up, and voice input spends them too."
            : 'Could not transcribe that recording.',
        )
        return
      }
      const { text } = (await response.json()) as { text: string }
      if (text.length === 0) onError('Nothing was recognised in that recording.')
      else onText(text)
    } finally {
      setState('idle')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void (state === 'recording' ? finish() : begin())}
      disabled={state === 'transcribing'}
      title={`Voice input, up to ${MAX_RECORDING_SECONDS} seconds`}
      className="row"
      style={state === 'recording' ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : {}}
    >
      <Icon shape={state === 'recording' ? MIC_OFF : MIC} />
      {state === 'recording' ? 'Stop' : state === 'transcribing' ? '…' : 'Speak'}
    </button>
  )
}
