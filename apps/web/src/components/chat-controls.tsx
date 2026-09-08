'use client'

import type { ModelChoice } from '@zca/providers'
import { type ResponseMode, responseMode, responseModes } from '@zca/shared'
import ModelPicker from './model-picker'

const SELECT_STYLE = {
  font: 'inherit',
  padding: '5px 8px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
} as const

export default function ChatControls(props: {
  mode: ResponseMode
  onMode: (mode: ResponseMode) => void
  models: ModelChoice[]
  model: string
  onModel: (id: string) => void
  usingOwnKeys: boolean
}) {
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <label className="row" style={{ fontSize: 13, gap: 8 }}>
          <span className="muted">Answer</span>
          <select
            value={props.mode}
            onChange={(event) => props.onMode(event.target.value as ResponseMode)}
            style={SELECT_STYLE}
          >
            {responseModes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} — {item.hint}
              </option>
            ))}
          </select>
        </label>
        <span className="muted" style={{ fontSize: 12 }}>
          caps the reply at {responseMode(props.mode).maxTokens} tokens
        </span>
      </div>

      <ModelPicker
        models={props.models}
        value={props.usingOwnKeys ? props.model : 'auto'}
        onChange={props.onModel}
        disabled={!props.usingOwnKeys}
        disabledReason="the shared pool runs the smallest model; add your own key to choose"
      />
    </>
  )
}
