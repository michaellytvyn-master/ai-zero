import { type ResponseMode, responseMode, responseModes } from '@zca/shared'
import type { ModelOption } from '@/lib/models'
import type { PageMode } from '@/lib/page-context'
import type { Session } from '@/lib/session'
import MicButton from './MicButton'

export default function Composer(props: {
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  busy: boolean
  pageMode: PageMode
  onPageMode: (mode: PageMode) => void
  models: ModelOption[]
  model: string
  onModel: (id: string) => void
  showModelPicker: boolean
  responseMode: ResponseMode
  onResponseMode: (mode: ResponseMode) => void
  attached: string | null
  session: Session
  onError: (message: string | null) => void
}) {
  return (
    <div className="composer">
      <div className="inputrow">
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
        <MicButton
          session={props.session}
          onText={(text) => props.onDraft(props.draft ? `${props.draft} ${text}` : text)}
          onError={props.onError}
        />
        <button
          type="button"
          className="primary"
          disabled={props.busy || props.draft.trim().length === 0}
          onClick={props.onSend}
          title="Send"
        >
          ↑
        </button>
      </div>

      <div className="controls">
        <select
          value={props.responseMode}
          onChange={(event) => props.onResponseMode(event.target.value as ResponseMode)}
          aria-label="Answer length"
          title={`Caps the reply at ${responseMode(props.responseMode).maxTokens} tokens`}
        >
          {responseModes.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label}
            </option>
          ))}
        </select>

        <select
          value={props.pageMode}
          onChange={(event) => props.onPageMode(event.target.value as PageMode)}
          aria-label="Page context"
        >
          <option value="off">Page: off</option>
          <option value="text">Page: text</option>
          <option value="html">Page: HTML</option>
        </select>

        {props.showModelPicker && (
          <select
            value={props.model}
            onChange={(event) => props.onModel(event.target.value)}
            aria-label="Model"
            style={{ maxWidth: 150 }}
          >
            <option value="auto">Auto</option>
            {props.models.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}

        {props.attached !== null && <span className="attached spacer">sent: {props.attached}</span>}
      </div>
    </div>
  )
}
