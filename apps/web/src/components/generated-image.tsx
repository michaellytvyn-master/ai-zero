'use client'

import { DOWNLOAD } from '@zca/shared'
import { useEffect, useState } from 'react'
import { asDownloadUrl } from '@/lib/download-url'
import Icon from './icon'

function remaining(expiresAt: string): string {
  const minutes = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000)
  if (minutes <= 0) return 'expired'
  if (minutes === 1) return 'deleted in a minute'
  return `deleted in ${minutes} min`
}

export default function GeneratedImage(props: { url: string; expiresAt: string; model: string }) {
  const [label, setLabel] = useState(() => remaining(props.expiresAt))

  // Counts down rather than showing a fixed figure, so the warning stays true
  // as the hour runs out.
  useEffect(() => {
    const timer = setInterval(() => setLabel(remaining(props.expiresAt)), 30_000)
    return () => clearInterval(timer)
  }, [props.expiresAt])

  return (
    <figure className="genimage" style={{ margin: 0 }}>
      <img src={props.url} alt="Generated" loading="lazy" />
      <figcaption className="meta">
        <span title="Images are removed automatically to keep storage free">{label}</span>
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <a href={asDownloadUrl(props.url, 'zero-cost-ai')} download className="row">
          <Icon shape={DOWNLOAD} size={14} />
          Download
        </a>
      </figcaption>
    </figure>
  )
}
