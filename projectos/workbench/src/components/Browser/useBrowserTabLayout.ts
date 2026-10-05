import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { computeBrowserTabLayout, type BrowserTabLayoutResult } from './browserTabLayout'

export function useBrowserTabLayout(tabCount: number) {
  const tabListRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useLayoutEffect(() => {
    const el = tabListRef.current
    if (!el) return

    const measure = () => {
      setContainerWidth(el.clientWidth)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tabCount])

  const layout = useMemo<BrowserTabLayoutResult>(
    () => computeBrowserTabLayout(tabCount, containerWidth),
    [tabCount, containerWidth],
  )

  return { tabListRef, ...layout }
}
