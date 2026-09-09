/**
 * Lucide icon geometry, kept as data so each app can render it with its own
 * component. Copying two icons is cheaper than a whole icon library for them.
 * Source: https://lucide.dev/icons — MIT licensed.
 */
export interface IconShape {
  readonly viewBox: string
  readonly paths: readonly string[]
  readonly rects?: readonly { x: number; y: number; width: number; height: number; rx: number }[]
}

export const MIC: IconShape = {
  viewBox: '0 0 24 24',
  paths: ['M12 19v3', 'M19 10v2a7 7 0 0 1-14 0v-2'],
  rects: [{ x: 9, y: 2, width: 6, height: 13, rx: 3 }],
}

export const MIC_OFF: IconShape = {
  viewBox: '0 0 24 24',
  paths: [
    'M12 19v3',
    'M15 9.34V5a3 3 0 0 0-5.68-1.33',
    'M16.95 16.95A7 7 0 0 1 5 12v-2',
    'M18.89 13.23A7 7 0 0 0 19 12v-2',
    'm2 2 20 20',
    'M9 9v3a3 3 0 0 0 5.12 2.12',
  ],
}

export const IMAGE: IconShape = {
  viewBox: '0 0 24 24',
  paths: ['M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21', 'M9 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0z'],
  rects: [{ x: 3, y: 3, width: 18, height: 18, rx: 2 }],
}

export const SEND: IconShape = {
  viewBox: '0 0 24 24',
  paths: ['M12 19V5', 'm5 12 7-7 7 7'],
}

export const TRASH: IconShape = {
  viewBox: '0 0 24 24',
  paths: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  ],
}

export const DOWNLOAD: IconShape = {
  viewBox: '0 0 24 24',
  paths: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
}

export const PLUS: IconShape = {
  viewBox: '0 0 24 24',
  paths: ['M5 12h14', 'M12 5v14'],
}

export const CLOSE: IconShape = {
  viewBox: '0 0 24 24',
  paths: ['M18 6 6 18', 'm6 6 12 12'],
}

export const PAPERCLIP: IconShape = {
  viewBox: '0 0 24 24',
  paths: [
    'M13.234 20.252 21 12.3',
    'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551',
  ],
}

export const SPARKLE: IconShape = {
  viewBox: '0 0 24 24',
  paths: [
    'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
  ],
}
