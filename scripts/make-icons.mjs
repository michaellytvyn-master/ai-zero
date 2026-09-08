/**
 * Draws the extension icons. There is no SVG rasteriser on this machine and a
 * whole image library would be a heavy dependency for four small squares, so
 * this renders at 4x and averages down, which is enough anti-aliasing for a
 * flat mark to stay clean at 16px.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const SUPERSAMPLE = 4
const BACKGROUND = [47, 91, 215]
const FOREGROUND = [255, 255, 255]

/** Normalised bolt, clockwise from the top point. */
const BOLT = [
  [0.58, 0.06],
  [0.26, 0.55],
  [0.45, 0.55],
  [0.4, 0.94],
  [0.74, 0.43],
  [0.54, 0.43],
]

function roundedSquareAlpha(x, y, size) {
  const inset = size * 0.045
  const radius = size * 0.235
  const min = inset
  const max = size - inset
  const cx = Math.min(Math.max(x, min + radius), max - radius)
  const cy = Math.min(Math.max(y, min + radius), max - radius)
  if (x < min || x > max || y < min || y > max) return 0
  return Math.hypot(x - cx, y - cy) <= radius ? 1 : 0
}

function insidePolygon(px, py, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function render(size) {
  const big = size * SUPERSAMPLE
  const samples = new Float64Array(big * big * 4)

  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const px = x + 0.5
      const py = y + 0.5
      const offset = (y * big + x) * 4

      if (roundedSquareAlpha(px, py, big) === 0) continue

      const onBolt = insidePolygon(px / big, py / big, BOLT)
      const [r, g, b] = onBolt ? FOREGROUND : BACKGROUND
      samples[offset] = r
      samples[offset + 1] = g
      samples[offset + 2] = b
      samples[offset + 3] = 255
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x += 1) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const o = ((y * SUPERSAMPLE + sy) * big + x * SUPERSAMPLE + sx) * 4
          r += samples[o]
          g += samples[o + 1]
          b += samples[o + 2]
          a += samples[o + 3]
        }
      }
      const n = SUPERSAMPLE * SUPERSAMPLE
      const out = y * (size * 4 + 1) + 1 + x * 4
      // Premultiplied average divided back out, so edge pixels keep their hue.
      const alpha = a / n
      const scale = alpha === 0 ? 0 : 255 / alpha
      raw[out] = Math.round(Math.min(255, (r / n) * scale))
      raw[out + 1] = Math.round(Math.min(255, (g / n) * scale))
      raw[out + 2] = Math.round(Math.min(255, (b / n) * scale))
      raw[out + 3] = Math.round(alpha)
    }
  }
  return raw
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    crc = crc >>> 0
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function png(size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = new URL('../apps/extension/public/icons/', import.meta.url)
mkdirSync(outDir, { recursive: true })
for (const size of [16, 32, 48, 128, 256]) {
  const file = new URL(`${size}.png`, outDir)
  writeFileSync(file, png(size))
  console.log(`${size}x${size}`.padEnd(9), `${(png(size).length / 1024).toFixed(1)} kB`)
}
