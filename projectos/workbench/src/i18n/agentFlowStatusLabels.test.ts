import { describe, expect, it } from 'vitest'

import type { FlowStatus } from '../state/handleRunEvent'
import { getStoreMessage } from './storeMessages'

// A flow status without a label renders as its raw key ("agentFlow.status.cancelled") in the Agent flow
// header. Typing the table by FlowStatus makes adding a status without a label here a compile error.
const STATUSES: Record<FlowStatus, true> = {
  idle: true,
  running: true,
  complete: true,
  awaiting_review: true,
  error: true,
  cancelled: true,
  interrupted: true,
}

describe('the Agent flow status chip', () => {
  it.each(['zh', 'en'] as const)('has a label for every flow status in %s', (locale) => {
    for (const status of Object.keys(STATUSES)) {
      const key = `agentFlow.status.${status}`
      expect(getStoreMessage(locale, key), `${locale} ${key}`).not.toBe(key)
    }
  })

  it('calls a stopped run "stopped", the word the chat already uses, and not a failure', () => {
    expect(getStoreMessage('zh', 'agentFlow.status.cancelled')).toBe('已停止')
    expect(getStoreMessage('en', 'agentFlow.status.cancelled')).toBe('Stopped')
    expect(getStoreMessage('zh', 'agentFlow.status.cancelled')).not.toBe(getStoreMessage('zh', 'agentFlow.status.error'))
  })
})
