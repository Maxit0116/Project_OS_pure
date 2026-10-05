import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  computeTabStripLayout,
  type BrowserTabLayoutResult,
} from '../../Browser/browserTabLayout'

export function useTabStripLayout(tabCount: number, trailingReserve = 0) {
  const tabListRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useLayoutEffect(() => {
    const el = tabListRef.current
    if (!el) return

    const measure = () => setContainerWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo<BrowserTabLayoutResult>(
    () => computeTabStripLayout(tabCount, containerWidth, trailingReserve),
    [tabCount, containerWidth, trailingReserve],
  )

  return { tabListRef, ...layout }
}
