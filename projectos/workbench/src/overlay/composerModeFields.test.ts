import { describe, expect, it } from 'vitest'
import { pinComposerModeFields } from './composerModeFields'

describe('pinComposerModeFields', () => {
  it('keeps askSubMode for ask and clears agent', () => {
    expect(
      pinComposerModeFields({
        mode: 'ask',
        askSubMode: 'first_principles',
        agentDefinitionId: 'agent_x',
        agentDisplayName: 'Reviewer',
      }),
    ).toEqual({
      mode: 'ask',
      askSubMode: 'first_principles',
      agentDefinitionId: null,
      agentDisplayName: null,
    })
  })

  it('defaults askSubMode to chat', () => {
    expect(pinComposerModeFields({ mode: 'ask' }).askSubMode).toBe('chat')
  })

  it('keeps specialized agent for change', () => {
    expect(
      pinComposerModeFields({
        mode: 'change',
        askSubMode: 'first_principles',
        agentDefinitionId: 'agent_x',
        agentDisplayName: 'Reviewer',
      }),
    ).toEqual({
      mode: 'change',
      askSubMode: undefined,
      agentDefinitionId: 'agent_x',
      agentDisplayName: 'Reviewer',
    })
  })

  it('clears agent fields for plan/debug', () => {
    expect(
      pinComposerModeFields({
        mode: 'plan',
        agentDefinitionId: 'agent_x',
        agentDisplayName: 'Reviewer',
      }),
    ).toEqual({
      mode: 'plan',
      askSubMode: undefined,
      agentDefinitionId: null,
      agentDisplayName: null,
    })
  })
})
