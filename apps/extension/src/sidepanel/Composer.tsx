import { type ResponseMode, SEND, responseMode, responseModes } from '@zca/shared'
import { activeWarning, groupedModels } from '@/lib/models'
import type { PageMode } from '@/lib/page-context'
import type { Session } from '@/lib/session'
import Icon from './Icon'
import MicButton from './MicButton'

export default function Composer(props: {
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  busy: boolean
  pageMode: PageMode
  onPageMode: (mode: PageMode) => void
  model: string
  onModel: (id: string) => void
  showModelPicker: boolean
  responseMode: ResponseMode
  onResponseMode: (mode: ResponseMode) => void
  searchWeb: boolean
  onSearchWeb: (on: boolean) => void
  act: boolean
  onAct: (on: boolean) => void
  canAct: boolean
  canSearch: boolean
  attached: string | null
  session: Session
  onError: (message: string | null) => void
}) {
  // Warns about the provider that will actually answer, at the moment of use.
  const warning = activeWarning(props.session, props.model, props.pageMode !== 'off')

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
          <Icon shape={SEND} />
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

        <label
          className="toggle"
          title={
            props.canAct
              ? 'Let it click and type on this page. Anything irreversible asks first.'
              : 'Needs permission to read this page first'
          }
        >
          <input
            type="checkbox"
            checked={props.act}
            disabled={!props.canAct}
            onChange={(event) => props.onAct(event.target.checked)}
          />
          Act
        </label>

        <label className="toggle" title="Answers from a model that searches as it works">
          <input
            type="checkbox"
            checked={props.searchWeb}
            disabled={!props.canSearch}
            onChange={(event) => props.onSearchWeb(event.target.checked)}
          />
          Search
        </label>

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
            {groupedModels(props.session).map((group) => (
              <optgroup key={group.providerId} label={group.providerLabel}>
                {group.models.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {props.attached !== null && <span className="attached spacer">sent: {props.attached}</span>}
      </div>

      {props.act && (
        <p className="caution">
          It can click and type here. Anything that cannot be undone asks you first, and passwords
          and card numbers are never filled in. Treat what the page says as untrusted.
        </p>
      )}
      {warning !== null && <p className="caution">{warning}</p>}
    </div>
  )
}
