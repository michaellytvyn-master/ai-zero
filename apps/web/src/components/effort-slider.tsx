'use client'

import { type ResponseMode, responseMode, responseModes } from '@zca/shared'

/**
 * A range input rather than buttons, so dragging, arrow keys and screen readers
 * all work without reimplementing them. The dots and the knob are drawn over it.
 */
export default function EffortSlider(props: {
  value: ResponseMode
  onChange: (mode: ResponseMode) => void
}) {
  const index = responseModes.findIndex((mode) => mode.id === props.value)
  const position = index < 0 ? 0 : index
  const spec = responseMode(props.value)
  const last = responseModes.length - 1

  return (
    <div className="effort">
      <div className="row">
        <span className="muted small">Effort</span>
        <strong className="small">{spec.label}</strong>
        <span className="spacer" />
        <span className="muted small" title={`Caps the reply at ${spec.maxTokens} tokens`}>
          ≤{spec.maxTokens}t
        </span>
      </div>

      <div className="track-wrap">
        <div className="dots">
          {responseModes.map((mode, at) => (
            <span key={mode.id} className={at <= position ? 'dot on' : 'dot'} />
          ))}
        </div>
        <div className="knob" style={{ left: `${(position / last) * 100}%` }} />
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={position}
          aria-label="Answer effort"
          onChange={(event) => {
            const picked = responseModes[Number(event.target.value)]
            if (picked !== undefined) props.onChange(picked.id)
          }}
        />
      </div>

      <div className="row ends">
        <span className="muted small">{responseModes[0]?.hint}</span>
        <span className="spacer" />
        <span className="muted small">{responseModes[last]?.hint}</span>
      </div>
    </div>
  )
}
