import { describe, expect, it } from 'vitest'

import {
  emptyAgentProfileDraft,
  isAgentProfileDraftValid,
} from './agentProfileDraft'

describe('agent profile draft validation', () => {
  it('requires an explicitly selected model and fully resets every field', () => {
    const valid = {
      name: 'Frontend agent',
      kind: 'custom' as const,
      systemPrompt: 'Edit the frontend.',
      modelProfileId: 'model_one',
      enabledTools: ['readFile'],
    }
    expect(isAgentProfileDraftValid(valid)).toBe(true)
    expect(isAgentProfileDraftValid({ ...valid, modelProfileId: '' })).toBe(false)
    expect(emptyAgentProfileDraft()).toEqual({
      name: '',
      kind: 'feature_change',
      systemPrompt: '',
      modelProfileId: '',
      enabledTools: ['readFile', 'listFiles', 'getContext', 'features_scan', 'features_sync'],
    })
  })
})
