export interface Recording {
  readonly blob: Blob
  readonly seconds: number
}

export class MicrophoneError extends Error {}

export interface ActiveRecording {
  /** Resolves once the recorder has flushed everything it captured. */
  stop(): Promise<Recording>
  /** Throws the recording away and releases the microphone. */
  cancel(): void
}

/** Whisper accepts all of these; the first the browser supports wins. */
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

export function pickMimeType(isSupported: (type: string) => boolean): string | undefined {
  return PREFERRED_TYPES.find(isSupported)
}

export async function startRecording(maxSeconds: number): Promise<ActiveRecording> {
  if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined) {
    throw new MicrophoneError('This browser cannot record audio.')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    // Chrome reports a refusal and an absent device the same way to the page,
    // so the message covers both rather than guessing.
    throw new MicrophoneError(
      error instanceof Error && error.name === 'NotAllowedError'
        ? 'Microphone access was refused.'
        : 'No microphone is available.',
    )
  }

  const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type))
  const recorder = new MediaRecorder(stream, mimeType === undefined ? {} : { mimeType })
  const chunks: Blob[] = []
  const startedAt = Date.now()

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  const release = () => {
    for (const track of stream.getTracks()) track.stop()
  }

  const finished = new Promise<Recording>((resolve) => {
    recorder.onstop = () => {
      release()
      resolve({
        blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }),
        seconds: Math.round((Date.now() - startedAt) / 1000),
      })
    }
  })

  recorder.start()
  // A forgotten recording would eat the daily audio-seconds allowance, so it
  // stops itself rather than running until the user notices.
  const timer = setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop()
  }, maxSeconds * 1000)

  return {
    stop() {
      clearTimeout(timer)
      if (recorder.state === 'recording') recorder.stop()
      return finished
    },
    cancel() {
      clearTimeout(timer)
      recorder.onstop = null
      if (recorder.state === 'recording') recorder.stop()
      release()
    },
  }
}
