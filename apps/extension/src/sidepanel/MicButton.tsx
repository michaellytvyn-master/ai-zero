import { MAX_RECORDING_SECONDS } from '@zca/providers'
import { type ActiveRecording, MicrophoneError, startRecording } from '@zca/shared'
import { useRef, useState } from 'react'
import type { Session } from '@/lib/session'
import { transcribe } from '@/lib/transcribe'

type State = 'idle' | 'recording' | 'transcribing'

export default function MicButton(props: {
  session: Session
  onText: (text: string) => void
  onError: (message: string | null) => void
}) {
  const [state, setState] = useState<State>('idle')
  const [needsPermission, setNeedsPermission] = useState(false)
  const active = useRef<ActiveRecording | null>(null)

  async function begin() {
    props.onError(null)
    setNeedsPermission(false)
    try {
      active.current = await startRecording(MAX_RECORDING_SECONDS)
      setState('recording')
    } catch (error) {
      // Chrome refuses to prompt from inside a side panel, so the fallback is
      // a one-purpose page that can.
      setNeedsPermission(error instanceof MicrophoneError)
      props.onError(error instanceof Error ? error.message : 'Could not start recording.')
    }
  }

  async function finish() {
    const recording = active.current
    active.current = null
    if (recording === null) return

    setState('transcribing')
    try {
      const { blob } = await recording.stop()
      const text = await transcribe(props.session, blob, new AbortController().signal)
      if (text.length === 0) props.onError('Nothing was recognised in that recording.')
      else props.onText(text)
    } catch (error) {
      props.onError(error instanceof Error ? error.message : 'Could not transcribe that.')
    } finally {
      setState('idle')
    }
  }

  if (needsPermission) {
    return (
      <button
        type="button"
        className="linklike"
        onClick={() => {
          void chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') })
        }}
      >
        Allow the microphone
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void (state === 'recording' ? finish() : begin())}
      disabled={state === 'transcribing'}
      className={state === 'recording' ? 'icon recording' : 'icon'}
      title={`Voice input, up to ${MAX_RECORDING_SECONDS} seconds`}
    >
      {state === 'recording' ? '■' : state === 'transcribing' ? '…' : '🎙'}
    </button>
  )
}
