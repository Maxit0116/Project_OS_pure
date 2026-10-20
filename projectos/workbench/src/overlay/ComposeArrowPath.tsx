import type { AnnotationAnchor, ScreenRect } from '@contracts/spatial-pin'
import { routeComposeArrowCurve } from './composeArrowCurve'

export default function ComposeArrowPath({
  head,
  tail,
  color,
  index,
  preview,
  headAnchor,
  tailAnchor,
  obstacles,
}: {
  head: { x: number; y: number }
  tail: { x: number; y: number }
  color: string
  index: number
  preview?: boolean
  /** Region/stencil-side edge (drives tip control normal). */
  headAnchor?: AnnotationAnchor
  /** Compose-card edge (drives start control normal). */
  tailAnchor?: AnnotationAnchor
  /** Rects the curve must travel around (card, region, stubs). */
  obstacles?: ScreenRect[]
}) {
  const { d, mid, tipAngle } = routeComposeArrowCurve({
    from: tail,
    to: head,
    fromAnchor: tailAnchor,
    toAnchor: headAnchor,
    obstacles,
  })
  const size = 10
  const ax = head.x - size * Math.cos(tipAngle - Math.PI / 6)
  const ay = head.y - size * Math.sin(tipAngle - Math.PI / 6)
  const bx = head.x - size * Math.cos(tipAngle + Math.PI / 6)
  const by = head.y - size * Math.sin(tipAngle + Math.PI / 6)

  return (
    <g opacity={preview ? 0.85 : 1}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`${head.x},${head.y} ${ax},${ay} ${bx},${by}`}
        fill={color}
      />
      <circle cx={tail.x} cy={tail.y} r={3.5} fill={color} />
      <g transform={`translate(${mid.x + 6}, ${mid.y - 6})`}>
        <circle r={8} fill={color} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fill="#fff"
          fontSize="10"
          fontWeight="700"
        >
          {index}
        </text>
      </g>
    </g>
  )
}
