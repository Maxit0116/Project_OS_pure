import { describe, expect, it } from 'vitest'
import { editorTabScrollDelta, revealEditorTab } from './editorTabScroll'

describe('editorTabScrollDelta', () => {
  it('turns a vertical wheel into a horizontal scroll', () => {
    expect(editorTabScrollDelta(0, 40)).toBe(40)
    expect(editorTabScrollDelta(0, -24)).toBe(-24)
  })

  it('keeps a horizontal swipe on the horizontal axis', () => {
    expect(editorTabScrollDelta(80, 4)).toBe(80)
    expect(editorTabScrollDelta(-30, 2)).toBe(-30)
  })

  it('returns zero when the wheel did not move', () => {
    expect(editorTabScrollDelta(0, 0)).toBe(0)
  })
})

describe('revealEditorTab', () => {
  const list = { scrollLeft: 0, clientWidth: 200 }

  it('scrolls a newly opened tab to the end of the strip', () => {
    expect(revealEditorTab(list, { offsetLeft: 480, offsetWidth: 120 }, 'end')).toBe(400)
  })

  it('leaves a fully visible tab where it is', () => {
    expect(revealEditorTab(list, { offsetLeft: 40, offsetWidth: 80 }, 'nearest')).toBe(0)
  })

  it('pulls a clipped tab fully into view', () => {
    const scrolled = { scrollLeft: 300, clientWidth: 200 }
    expect(revealEditorTab(scrolled, { offsetLeft: 40, offsetWidth: 80 }, 'nearest')).toBe(40)
    expect(revealEditorTab(scrolled, { offsetLeft: 420, offsetWidth: 100 }, 'nearest')).toBe(320)
  })
})
