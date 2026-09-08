'use client'

import type { ModelChoice } from '@zca/providers'

export default function ModelPicker(props: {
  models: ModelChoice[]
  value: string
  onChange: (value: string) => void
  disabled: boolean
  disabledReason?: string
}) {
  const byProvider = new Map<string, ModelChoice[]>()
  for (const model of props.models) {
    const existing = byProvider.get(model.providerLabel) ?? []
    existing.push(model)
    byProvider.set(model.providerLabel, existing)
  }

  return (
    <label className="row" style={{ fontSize: 13, gap: 8 }}>
      <span className="muted">Model</span>
      <select
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        style={{
          font: 'inherit',
          padding: '5px 8px',
          borderRadius: 7,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text)',
          maxWidth: 320,
        }}
      >
        <option value="auto">Automatic (first available)</option>
        {[...byProvider.entries()].map(([providerLabel, models]) => (
          <optgroup key={providerLabel} label={providerLabel}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} · {Math.round(model.contextWindow / 1000)}k
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {props.disabled && props.disabledReason !== undefined && (
        <span className="muted">{props.disabledReason}</span>
      )}
    </label>
  )
}
