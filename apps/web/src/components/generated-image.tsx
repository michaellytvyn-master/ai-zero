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

export default function GeneratedImage(props: {
  url: string
  /** Null when it went to the user's own account, where nothing expires. */
  expiresAt: string | null
  model: string
}) {
  const kept = props.expiresAt === null
  const [label, setLabel] = useState(() =>
    props.expiresAt === null ? 'kept in your account' : remaining(props.expiresAt),
  )

  // Counts down rather than showing a fixed figure, so the warning stays true
  // as the hour runs out. A kept picture has nothing to count.
  useEffect(() => {
    const at = props.expiresAt
    if (at === null) return
    const timer = setInterval(() => setLabel(remaining(at)), 30_000)
    return () => clearInterval(timer)
  }, [props.expiresAt])

  return (
    <figure className="genimage" style={{ margin: 0 }}>
      <img src={props.url} alt="Generated" loading="lazy" />
      <figcaption className="meta">
        <span
          title={
            kept
              ? 'Stored in your own Cloudinary account, for as long as you keep it there'
              : 'Images in the shared test pool are removed automatically to keep storage free'
          }
          className={kept ? 'ok' : ''}
        >
          {label}
        </span>
        <span className="spacer" style={{ marginLeft: 'auto' }} />
        <a href={asDownloadUrl(props.url, 'zero-cost-ai')} download className="row">
          <Icon shape={DOWNLOAD} size={14} />
          Download
        </a>
      </figcaption>
    </figure>
  )
}
