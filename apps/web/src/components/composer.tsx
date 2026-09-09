'use client'

import { type Attachment, SEND } from '@zca/shared'
import AttachButton from './attach-button'
import Icon from './icon'
import MicButton from './mic-button'

export default function Composer(props: {
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  busy: boolean
  files: Attachment[]
  onFiles: (update: (previous: Attachment[]) => Attachment[]) => void
  onError: (message: string | null) => void
}) {
  return (
    <>
      {props.files.length > 0 && (
        <div className="attachments">
          {props.files.map((file) => (
            <button
              key={file.name}
              type="button"
              className="chip"
              title={`${file.originalLength.toLocaleString()} characters — click to remove`}
              onClick={() => props.onFiles((previous) => previous.filter((f) => f !== file))}
            >
              {file.name} ✕
            </button>
          ))}
        </div>
      )}

      <div className="composer-box">
        <textarea
          rows={2}
          value={props.draft}
          placeholder="Ask anything"
          onChange={(event) => props.onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              props.onSend()
            }
          }}
        />
        <AttachButton
          disabled={props.busy}
          onAttach={(picked) => props.onFiles((previous) => [...previous, ...picked])}
          onError={props.onError}
        />
        <MicButton
          onText={(text) => props.onDraft(props.draft ? `${props.draft} ${text}` : text)}
          onError={(message) => props.onError(message.length > 0 ? message : null)}
        />
        <button
          type="button"
          className="primary send"
          disabled={props.busy || props.draft.trim().length === 0}
          onClick={props.onSend}
          title="Send"
        >
          {props.busy ? <span className="spin" /> : <Icon shape={SEND} />}
        </button>
      </div>
    </>
  )
}
