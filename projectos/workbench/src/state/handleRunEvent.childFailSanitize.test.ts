import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentRunEventSchema } from '@contracts/index'
import { useWorkbenchStore } from './workbenchStore'
import { handleRunEvent } from './handleRunEvent'

describe('handleRunEvent child-fail display sanitize', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      messages: [],
      locale: 'en',
      toasts: [],
    } as never)
  })

  it('shows sanitized child-failure text in chat and toast, not secrets or home paths', () => {
    const pushToast = vi.fn()
    useWorkbenchStore.setState({ pushToast } as never)

    const event = AgentRunEventSchema.parse({
      eventId: 'evt_child_fail_sanitize',
      runId: 'run_child_fail',
      timestamp: '2026-11-08T00:00:00.000Z',
      type: 'step_failed',
      step: {
        id: 'step_delegate',
        label: 'Delegate',
        kind: 'delegate_tasks',
        status: 'error',
        relatedNodeIds: [],
        relatedFiles: [],
        outputSummary:
          'Delegated file task failed (1/2); task_a: /Users/terran/secret/proj/app/login/page.tsx api_key=sk-abcdefghijklmnop Bearer tok_live_123',
      },
      payload: {},
    })

    handleRunEvent(event, useWorkbenchStore.setState, () => ({
      ...useWorkbenchStore.getState(),
      pushToast,
    }))

    const failure = useWorkbenchStore.getState().messages.find((message) =>
      message.id === `failure_${event.eventId}`)
    expect(failure?.role).toBe('system')
    expect(failure?.content).toContain('[path]')
    expect(failure?.content).toContain('[redacted]')
    expect(failure?.content).not.toContain('/Users/terran')
    expect(failure?.content).not.toContain('sk-abcdefghijklmnop')
    expect(failure?.content).not.toContain('tok_live_123')
    expect(pushToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      message: expect.stringContaining('[path]'),
    }))
    const toastMessage = String(pushToast.mock.calls[0]?.[0]?.message ?? '')
    expect(toastMessage).not.toContain('/Users/terran')
    expect(toastMessage).not.toContain('sk-abcdefghijklmnop')
  })
})
