import { describe, expect, it } from 'vitest'
import type { RequestIntent } from '@contracts/index'
import { canSubmitAgentPrompt } from './workbenchStore'

const base = {
  chatMode: 'change' as const,
  globalAgentActive: true,
  selectedNodeId: null,
  selectedFilePath: null,
  pendingFileOwnerChoice: null,
  fileScopeError: null,
  pendingPlan: null,
  pendingIntent: null as RequestIntent | null,
}
const intent = { id: 'intent_1', status: 'draft' } as unknown as RequestIntent

describe('canSubmitAgentPrompt and a pending approval card', () => {
  it('holds Agent mode until the card is answered', () => {
    expect(canSubmitAgentPrompt({ ...base, pendingIntent: intent })).toBe(false)
    expect(canSubmitAgentPrompt(base)).toBe(true)
  })

  it.each(['plan', 'ask', 'debug', 'anchored'] as const)(
    'does not hold %s mode, where the card is not shown',
    (chatMode) => {
      expect(canSubmitAgentPrompt({ ...base, chatMode, pendingIntent: intent })).toBe(true)
    },
  )
})
