'use client'

import { DEFAULT_RESPONSE_MODE, type ResponseMode, isResponseMode } from '@zca/shared'
import { useEffect, useState } from 'react'

/**
 * How you like answers is a preference about you, not a property of any one
 * conversation, so it is remembered per browser rather than stored per chat.
 */
export function useRememberedMode(): [ResponseMode, (next: ResponseMode) => void] {
  const [mode, setMode] = useState<ResponseMode>(DEFAULT_RESPONSE_MODE)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('responseMode')
      if (isResponseMode(saved)) setMode(saved)
    } catch {
      // Private windows and blocked storage both land here; the default is fine.
    }
  }, [])

  return [
    mode,
    (next) => {
      setMode(next)
      try {
        localStorage.setItem('responseMode', next)
      } catch {
        // Failing to remember the choice must not stop them making it.
      }
    },
  ]
}
