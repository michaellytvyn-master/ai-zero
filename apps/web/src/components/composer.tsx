'use client'

import type { ModelChoice } from '@zca/providers'
import {
  type Attachment,
  IMAGE,
  PLUS,
  type ResponseMode,
  SEND,
  SPARKLE,
  responseMode,
} from '@zca/shared'
import AttachButton from './attach-button'
import EffortSlider from './effort-slider'
import Icon from './icon'
import MicButton from './mic-button'
import Popover from './popover'

export default function Composer(props: {
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  busy: boolean
  files: Attachment[]
  onFiles: (update: (previous: Attachment[]) => Attachment[]) => void
  onError: (message: string | null) => void
  mode: ResponseMode
  onMode: (mode: ResponseMode) => void
  models: ModelChoice[]
  model: string
  onModel: (id: string) => void
  usingOwnKeys: boolean
  makeImage: boolean
  onMakeImage: (on: boolean) => void
  searchWeb: boolean
  onSearchWeb: (on: boolean) => void
}) {
  const canSend = !props.busy && props.draft.trim().length > 0

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

      <div className="bar">
        <Popover label={<Icon shape={PLUS} size={18} />} title="Add to this message">
          {(close) => (
            <>
              <AttachButton
                disabled={props.busy}
                onAttach={(picked) => {
                  props.onFiles((previous) => [...previous, ...picked])
                  close()
                }}
                onError={props.onError}
              />
              <button
                type="button"
                className={props.makeImage ? 'item on' : 'item'}
                onClick={() => {
                  props.onMakeImage(!props.makeImage)
                  close()
                }}
              >
                <Icon shape={IMAGE} />
                Make an image
                {props.makeImage && <span className="check">✓</span>}
              </button>
              <button
                type="button"
                className={props.searchWeb && props.usingOwnKeys ? 'item on' : 'item'}
                disabled={!props.usingOwnKeys}
                title={
                  props.usingOwnKeys
                    ? 'Answers from a model that searches as it works'
                    : 'The trial runs the smallest model; connect your own key to search'
                }
                onClick={() => {
                  props.onSearchWeb(!props.searchWeb)
                  close()
                }}
              >
                <Icon shape={SPARKLE} />
                Search the web
                {props.searchWeb && props.usingOwnKeys && <span className="check">✓</span>}
              </button>

              <div className="divider-line" />
              <label className="field">
                <span>Model</span>
                <select
                  value={props.usingOwnKeys ? props.model : 'auto'}
                  disabled={!props.usingOwnKeys}
                  onChange={(event) => props.onModel(event.target.value)}
                >
                  <option value="auto">Automatic</option>
                  {props.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.providerId} · {model.label}
                    </option>
                  ))}
                </select>
                {!props.usingOwnKeys && (
                  <small className="muted">The trial runs the smallest model.</small>
                )}
              </label>
            </>
          )}
        </Popover>

        <textarea
          rows={1}
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

        <Popover
          className="tag"
          title="How much effort to spend on the answer"
          label={
            <>
              <Icon shape={SPARKLE} size={15} />
              {responseMode(props.mode).label}
            </>
          }
        >
          {() => <EffortSlider value={props.mode} onChange={props.onMode} />}
        </Popover>

        <MicButton
          onText={(text) => props.onDraft(props.draft ? `${props.draft} ${text}` : text)}
          onError={(message) => props.onError(message.length > 0 ? message : null)}
        />

        <button
          type="button"
          className="round go"
          disabled={!canSend}
          onClick={props.onSend}
          title="Send"
        >
          {props.busy ? <span className="spin" /> : <Icon shape={SEND} size={17} />}
        </button>
      </div>
    </>
  )
}
