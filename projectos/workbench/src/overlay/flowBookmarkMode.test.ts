import { describe, expect, it } from 'vitest'
import { flowBookmarkMode } from './flowBookmarkMode'
import type { CompactFlowStep } from './coarseFlow'

const running: CompactFlowStep = { id: 'a', label: 'Thinking', status: 'running' }
const done: CompactFlowStep = { id: 'a', label: 'Thinking', status: 'complete' }

describe('flowBookmarkMode', () => {
  it('shows the current step while a flow is running and collapsed', () => {
    expect(flowBookmarkMode({ steps: [running], phase: 'thinking', open: false })).toBe('current')
  })

  it('opens the full flow on demand', () => {
    expect(flowBookmarkMode({ steps: [running, done], phase: 'thinking', open: true })).toBe('open')
    expect(flowBookmarkMode({ steps: [done], phase: 'done', open: true })).toBe('open')
  })

  it('keeps only a tab after the flow finishes', () => {
    expect(flowBookmarkMode({ steps: [done], phase: 'done', open: false })).toBe('tab')
  })

  it('stays hidden before any flow exists', () => {
    expect(flowBookmarkMode({ steps: [], phase: null, open: false })).toBe('hidden')
  })
})
