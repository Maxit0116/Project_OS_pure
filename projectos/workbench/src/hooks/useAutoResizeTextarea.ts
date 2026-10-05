import { useEffect, useMemo, useState, type RefCallback } from 'react'

export function syncTextareaHeight(
  textarea: Pick<HTMLTextAreaElement, 'scrollHeight' | 'style'>,
  maxHeight: number,
  allowShrink: boolean,
): boolean {
  if (allowShrink) {
    textarea.style.height = '0px'
  }
  const nextHeight = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  if (textarea.style.height === nextHeight) return false
  textarea.style.height = nextHeight
  return true
}

type AutoResizeTextareaRef = RefCallback<HTMLTextAreaElement> & {
  current: HTMLTextAreaElement | null
}

export function useAutoResizeTextarea(value: string, maxHeight = 240, resizeKey?: string) {
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null)
  const textareaRef = useMemo<AutoResizeTextareaRef>(() => {
    const callback = ((next: HTMLTextAreaElement | null) => {
      callback.current = next
      setTextarea(next)
    }) as AutoResizeTextareaRef
    callback.current = null
    return callback
  }, [])

  useEffect(() => {
    if (!textarea) return
    syncTextareaHeight(textarea, maxHeight, true)
  }, [textarea, value, maxHeight, resizeKey])

  useEffect(() => {
    if (!textarea) return

    let lastWidth = textarea.getBoundingClientRect().width
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? textarea.getBoundingClientRect().width
      const widthChanged = Math.abs(width - lastWidth) > 0.5
      lastWidth = width
      syncTextareaHeight(textarea, maxHeight, widthChanged)
    })
    observer.observe(textarea)
    return () => observer.disconnect()
  }, [textarea, maxHeight])

  return textareaRef
}
