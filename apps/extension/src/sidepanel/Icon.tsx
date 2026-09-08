import type { IconShape } from '@zca/shared'

export default function Icon({ shape, size = 16 }: { shape: IconShape; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={shape.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      {shape.rects?.map((rect) => (
        <rect
          key={`${rect.x}-${rect.y}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={rect.rx}
        />
      ))}
      {shape.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
