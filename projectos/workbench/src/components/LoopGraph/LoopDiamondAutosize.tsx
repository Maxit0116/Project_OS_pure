import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import {
  diamondSizeForContent,
  type DiamondBox,
} from './loopDiamondGeometry'

type Props = {
  children: ReactNode
  shellClassName: string
  bodyClassName: string
  /** Fires when the diamond AABB needed to wrap content changes. */
  onBoxSize: (size: DiamondBox) => void
}

/**
 * Measures intrinsic content and reports the flat-diamond AABB that wraps it.
 * Parent owns position/size; this only renders shell + body.
 */
export default function LoopDiamondAutosize({
  children,
  shellClassName,
  bodyClassName,
  onBoxSize,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const onBoxSizeRef = useRef(onBoxSize)
  onBoxSizeRef.current = onBoxSize
  const lastRef = useRef<DiamondBox | null>(null)

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return

    const publish = () => {
      const next = diamondSizeForContent(el.offsetWidth, el.offsetHeight)
      const prev = lastRef.current
      if (
        prev &&
        prev.width === next.width &&
        prev.height === next.height
      ) {
        return
      }
      lastRef.current = next
      onBoxSizeRef.current(next)
    }

    publish()
    const ro = new ResizeObserver(() => publish())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <>
      <svg
        className={shellClassName}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <polygon
          points="50,1.2 98.8,50 50,98.8 1.2,50"
          data-loop-diamond-hit
        />
      </svg>
      <div ref={bodyRef} className={bodyClassName}>
        {children}
      </div>
    </>
  )
}
