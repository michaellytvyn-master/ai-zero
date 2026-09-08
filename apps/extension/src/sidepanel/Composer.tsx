import { type ResponseMode, responseMode, responseModes } from '@zca/shared'
import type { ModelOption } from '@/lib/models'
import type { PageMode } from '@/lib/page-context'

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
}) {
  const spec = responseMode(props.responseMode)
  return (
    <div className="composer">
      <select
        value={props.pageMode}
        onChange={(event) => props.onPageMode(event.target.value as PageMode)}
        aria-label="Page context"
      >
        <option value="off">Do not read the page</option>
        <option value="text">Read this page (text)</option>
        <option value="html">Read this page (HTML source)</option>
      </select>

      {props.showModelPicker && (
        <select
          value={props.model}
          onChange={(event) => props.onModel(event.target.value)}
          aria-label="Model"
        >
          <option value="auto">Automatic (first available)</option>
          {props.models.map((option) => (
            <option key={option.id} value={option.id}>
              {option.providerLabel} · {option.label} · {Math.round(option.contextWindow / 1000)}k
            </option>
          ))}
        </select>
      )}

      <div className="row">
        <select
          value={props.responseMode}
          onChange={(event) => props.onResponseMode(event.target.value as ResponseMode)}
          aria-label="Response length"
          style={{ flex: 1 }}
        >
          {responseModes.map((mode) => (
            <option key={mode.id} value={mode.id}>
              {mode.label} — {mode.hint}
            </option>
          ))}
        </select>
        <span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          ≤{spec.maxTokens}t
        </span>
      </div>

      <textarea
        rows={3}
        value={props.draft}
        placeholder="Ask something"
        onChange={(event) => props.onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            props.onSend()
          }
        }}
      />

      <div className="row">
        {props.attached !== null && <span className="muted attached">sent: {props.attached}</span>}
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <button type="button" className="primary" disabled={props.busy} onClick={props.onSend}>
          Send
        </button>
      </div>
    </div>
  )
}
