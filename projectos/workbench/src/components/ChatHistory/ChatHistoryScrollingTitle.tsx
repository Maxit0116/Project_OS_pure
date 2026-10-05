import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import styles from './ChatHistoryMenu.module.css'
import { measureScrollingTextOverflow } from './measureScrollingTextOverflow'

const SCROLL_DELAY_MS = 400
const SCROLL_SPEED_PX_PER_SEC = 48
const MIN_SCROLL_DURATION_SEC = 1.2

interface Props {
  title: string
  containerClassName?: string
  textClassName?: string
  scrollableTextClassName?: string
  scrollingTextClassName?: string
}

export default function ChatHistoryScrollingTitle({
  title,
  containerClassName,
  textClassName,
  scrollableTextClassName,
  scrollingTextClassName,
}: Props) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const delayTimerRef = useRef<number | null>(null)
  const [canScroll, setCanScroll] = useState(false)
  const [scrollDistance, setScrollDistance] = useState(0)
  const [isScrolling, setIsScrolling] = useState(false)

  const clearDelayTimer = () => {
    if (delayTimerRef.current !== null) {
      window.clearTimeout(delayTimerRef.current)
      delayTimerRef.current = null
    }
  }

  const updateOverflowState = () => {
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) {
      setCanScroll(false)
      setScrollDistance(0)
      setIsScrolling(false)
      return
    }

    const overflow = measureScrollingTextOverflow(container, text)
    setCanScroll(overflow > 0)
    setScrollDistance(overflow)
    if (overflow <= 0) {
      setIsScrolling(false)
    }
  }

  useLayoutEffect(() => {
    clearDelayTimer()
    setIsScrolling(false)
    updateOverflowState()
  }, [title])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => updateOverflowState())
    observer.observe(container)
    return () => {
      observer.disconnect()
      clearDelayTimer()
    }
  }, [title])

  const handleMouseEnter = () => {
    clearDelayTimer()
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) return

    const overflow = measureScrollingTextOverflow(container, text)
    if (overflow <= 0) return

    setScrollDistance(overflow)
    delayTimerRef.current = window.setTimeout(() => {
      delayTimerRef.current = null
      setIsScrolling(true)
    }, SCROLL_DELAY_MS)
  }

  const handleMouseLeave = () => {
    clearDelayTimer()
    setIsScrolling(false)
  }

  const scrollDurationSec = Math.max(MIN_SCROLL_DURATION_SEC, scrollDistance / SCROLL_SPEED_PX_PER_SEC)

  const textStyle: CSSProperties =
    canScroll && isScrolling
      ? {
          transform: `translateX(-${scrollDistance}px)`,
          transitionDuration: `${scrollDurationSec}s`,
        }
      : canScroll
        ? {
            transform: 'translateX(0)',
            transitionDuration: '0.25s',
          }
        : undefined

  return (
    <span
      ref={containerRef}
      className={[styles.itemTitle, containerClassName].filter(Boolean).join(' ')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        ref={textRef}
        className={[
          styles.itemTitleText,
          textClassName,
          canScroll ? styles.itemTitleTextScrollable : '',
          canScroll && scrollableTextClassName ? scrollableTextClassName : '',
          isScrolling ? styles.itemTitleTextScrolling : '',
          isScrolling && scrollingTextClassName ? scrollingTextClassName : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={textStyle}
      >
        {title}
      </span>
    </span>
  )
}
