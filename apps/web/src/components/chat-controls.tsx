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
  makeImage: boolean
  onMakeImage: (on: boolean) => void
  searchWeb: boolean
  onSearchWeb: (on: boolean) => void
}) {
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <label className="row" style={{ fontSize: 13, gap: 6 }}>
          <input
            type="checkbox"
            checked={props.makeImage}
            onChange={(event) => props.onMakeImage(event.target.checked)}
            style={{ width: 'auto' }}
          />
          <span className="muted">Make an image</span>
        </label>

        <label
          className="row"
          style={{ fontSize: 13, gap: 6, opacity: props.usingOwnKeys ? 1 : 0.5 }}
          title={
            props.usingOwnKeys
              ? 'Answers from a model that searches as it works'
              : 'The shared pool runs the smallest model; add your own key to search'
          }
        >
          <input
            type="checkbox"
            checked={props.searchWeb && props.usingOwnKeys}
            disabled={!props.usingOwnKeys}
            onChange={(event) => props.onSearchWeb(event.target.checked)}
            style={{ width: 'auto' }}
          />
          <span className="muted">Search the web</span>
        </label>

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

      {props.searchWeb && props.usingOwnKeys && (
        <p className="muted small" style={{ margin: 0 }}>
          Answers come from a model that searches as it works. Paste a link in any mode and the page
          is read for you — no model can browse on its own.
        </p>
      )}

      {props.makeImage && (
        <p className="muted small" style={{ margin: 0 }}>
          Images are generated on Cloudflare and stored for one hour, then deleted automatically.
          Download anything you want to keep.
        </p>
      )}

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
