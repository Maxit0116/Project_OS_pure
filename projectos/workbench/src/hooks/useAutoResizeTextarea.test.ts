import { describe, expect, it } from 'vitest'

import { syncTextareaHeight } from './useAutoResizeTextarea'

describe('auto-resize textarea measurement', () => {
  it('does not write height again when ResizeObserver echoes the applied size', () => {
    let writes = 0
    let height = ''
    const textarea = {
      scrollHeight: 96,
      style: {
        get height() {
          return height
        },
        set height(next: string) {
          writes += 1
          height = next
        },
      } as CSSStyleDeclaration,
    }

    expect(syncTextareaHeight(textarea, 240, true)).toBe(true)
    const writesAfterValueChange = writes
    expect(height).toBe('96px')

    expect(syncTextareaHeight(textarea, 240, false)).toBe(false)
    expect(writes).toBe(writesAfterValueChange)
  })

  it('updates an observed textarea when its measured content height really changes', () => {
    const textarea = {
      scrollHeight: 96,
      style: { height: '96px' } as CSSStyleDeclaration,
    }

    textarea.scrollHeight = 144
    expect(syncTextareaHeight(textarea, 120, false)).toBe(true)
    expect(textarea.style.height).toBe('120px')
  })
})
