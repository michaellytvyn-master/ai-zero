'use client'

import type { ModelChoice } from '@zca/providers'
import type { ResponseMode } from '@zca/shared'
import EffortSlider from './effort-slider'
import ModelPicker from './model-picker'

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
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <EffortSlider value={props.mode} onChange={props.onMode} />

        <div className="stack" style={{ gap: 8 }}>
          <label className="row small" style={{ gap: 7 }}>
            <input
              type="checkbox"
              checked={props.makeImage}
              onChange={(event) => props.onMakeImage(event.target.checked)}
            />
            <span className="muted">Make an image</span>
          </label>

          <label
            className="row small"
            style={{ gap: 7, opacity: props.usingOwnKeys ? 1 : 0.45 }}
            title={
              props.usingOwnKeys
                ? 'Answers from a model that searches as it works'
                : 'The trial runs the smallest model; connect your own key to search'
            }
          >
            <input
              type="checkbox"
              checked={props.searchWeb && props.usingOwnKeys}
              disabled={!props.usingOwnKeys}
              onChange={(event) => props.onSearchWeb(event.target.checked)}
            />
            <span className="muted">Search the web</span>
          </label>
        </div>
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
