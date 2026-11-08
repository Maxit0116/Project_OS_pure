import { describe, expect, it } from 'vitest'

import { AgentFlowStepKindSchema } from '@contracts/index'
import en from '../../i18n/locales/en'
import zh from '../../i18n/locales/zh'
import { agentFlowStepLabel } from './stepLabel'

describe('the name of a step in the Agent flow', () => {
  it('is the plain-language name for the step kind, in the interface language', () => {
    expect(agentFlowStepLabel({ kind: 'locate_plan', label: 'Locate Plan' }, zh.agentFlow.stepKind)).toBe('找到要改的地方')
    expect(agentFlowStepLabel({ kind: 'locate_plan', label: 'Locate Plan' }, en.agentFlow.stepKind)).toBe('Finding what to change')
  })

  it('keeps the name the server gave when the kind has no plain name', () => {
    expect(agentFlowStepLabel({ kind: 'something_new', label: 'Something new' }, zh.agentFlow.stepKind)).toBe('Something new')
    expect(agentFlowStepLabel({ kind: 'locate_plan', label: 'Locate Plan' }, undefined)).toBe('Locate Plan')
  })

  it('has a plain name, in both languages, for every kind a run can report', () => {
    for (const kind of AgentFlowStepKindSchema.options) {
      expect((zh.agentFlow.stepKind as Record<string, string>)[kind], `zh ${kind}`).toBeTruthy()
      expect((en.agentFlow.stepKind as Record<string, string>)[kind], `en ${kind}`).toBeTruthy()
    }
  })
})
