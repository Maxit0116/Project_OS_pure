import { describe, expect, it } from 'vitest'
import type { RequestIntent } from '@contracts/index'
import { canSubmitAgentPrompt, conversationScopeFromSelection } from './workbenchStore'
import { architectureFileNodeId } from '../components/FunctionMap/architectureView'

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

describe('the scope of a question asked with a code-level box selected', () => {
  const base = {
    selectedFilePath: null,
    pendingFileOwnerChoice: null,
    fileScopeError: null,
    graph: { fileIndex: [{ path: 'frontend/tests/config.ts', nodeIds: ['comp_e2e_tests'] }] },
  }
  const id = architectureFileNodeId('comp_e2e_tests', 'frontend/tests/config.ts')

  it('is the file and its component, not the id the server has never heard of', () => {
    expect(conversationScopeFromSelection({ ...base, selectedNodeId: id })).toEqual({
      kind: 'file',
      nodeId: 'comp_e2e_tests',
      selectedFilePath: 'frontend/tests/config.ts',
    })
  })

  it('falls back to the whole project when the graph cannot say what the box is', () => {
    expect(conversationScopeFromSelection({ ...base, selectedNodeId: 'code_file_comp_gone_x_py_1abc' })).toEqual({ kind: 'global' })
    expect(conversationScopeFromSelection({ ...base, selectedNodeId: id, graph: null })).toEqual({ kind: 'global' })
  })

  it('leaves ordinary selections as they were', () => {
    expect(conversationScopeFromSelection({ ...base, selectedNodeId: null })).toEqual({ kind: 'global' })
    expect(conversationScopeFromSelection({ ...base, selectedNodeId: 'comp_e2e_tests' })).toEqual({ kind: 'node', nodeId: 'comp_e2e_tests' })
    expect(conversationScopeFromSelection({ ...base, selectedNodeId: 'comp_e2e_tests', selectedFilePath: 'a.ts' })).toEqual({
      kind: 'file', nodeId: 'comp_e2e_tests', selectedFilePath: 'a.ts',
    })
  })
})
