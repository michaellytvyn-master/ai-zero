'use client'

import {
  ATTACHMENT_ACCEPT,
  type Attachment,
  AttachmentError,
  PAPERCLIP,
  readAttachment,
} from '@zca/shared'
import { useRef, useState } from 'react'
import Icon from './icon'

/** Split across however many files were picked, so several do not blow the window. */
const TOTAL_BUDGET = 24_000

export default function AttachButton(props: {
  onAttach: (files: Attachment[]) => void
  onError: (message: string) => void
  disabled: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(list: FileList | null) {
    if (list === null || list.length === 0) return
    setBusy(true)
    const budget = Math.floor(TOTAL_BUDGET / list.length)
    const read: Attachment[] = []

    for (const file of Array.from(list)) {
      try {
        read.push(await readAttachment(file, budget))
      } catch (error) {
        props.onError(
          error instanceof AttachmentError ? error.message : `Could not read ${file.name}.`,
        )
      }
    }

    if (read.length > 0) props.onAttach(read)
    setBusy(false)
    if (input.current !== null) input.current.value = ''
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        hidden
        onChange={(event) => void pick(event.target.files)}
      />
      <button
        type="button"
        className="item"
        title="Text files only — a browser can read those without a parser"
        disabled={props.disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <span className="spin" /> : <Icon shape={PAPERCLIP} />}
        {busy ? 'Reading…' : 'Attach a file'}
      </button>
    </>
  )
}
