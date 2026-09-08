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
  attached: string | null
}) {
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
