import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/site'

export const alt = `${SITE_NAME} — your own free provider keys, one interface`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Generated rather than committed as a binary, so the card never drifts out of
 * step with the palette in globals.css.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: '#07080a',
        backgroundImage: 'radial-gradient(circle at 18% 12%, #0e2a1e 0%, #07080a 55%)',
        color: '#f4f6f5',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: '#21e58a' }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: '#21e58a',
            boxShadow: '0 0 36px 10px rgba(33,229,138,0.55)',
          }}
        />
        <div style={{ fontSize: 30, letterSpacing: 1 }}>{SITE_NAME}</div>
      </div>
      <div style={{ fontSize: 86, fontWeight: 700, marginTop: 34, lineHeight: 1.05 }}>
        Your keys. One interface.
      </div>
      <div style={{ fontSize: 34, color: '#9aa5a0', marginTop: 30, lineHeight: 1.35 }}>
        Chat, an OpenAI-compatible API and a browser side panel over the free provider accounts you
        already own.
      </div>
    </div>,
    size,
  )
}
