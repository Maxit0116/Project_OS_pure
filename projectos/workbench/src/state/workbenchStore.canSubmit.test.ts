import { describe, expect, it } from 'vitest'
import type { RequestIntent } from '@contracts/index'
import { canSubmitAgentPrompt, conversationScopeFromSelection, requestTargetFromSelection, serverNodeIdFor } from './workbenchStore'
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

describe('what an Agent request or a map note names when a code-level box is selected', () => {
  const graph = { fileIndex: [{ path: 'frontend/tests/config.ts', nodeIds: ['comp_e2e_tests'] }] }
  const id = architectureFileNodeId('comp_e2e_tests', 'frontend/tests/config.ts')

  it('names the file and its component, not the id the server has never heard of', () => {
    expect(requestTargetFromSelection({ selectedNodeId: id, selectedFilePath: null, graph })).toEqual({
      nodeId: 'comp_e2e_tests',
      filePath: 'frontend/tests/config.ts',
    })
    expect(serverNodeIdFor(graph.fileIndex, id)).toBe('comp_e2e_tests')
  })

  it('names nothing the graph cannot place', () => {
    expect(requestTargetFromSelection({ selectedNodeId: 'code_file_comp_gone_x_py_1abc', selectedFilePath: null, graph })).toEqual({})
    expect(requestTargetFromSelection({ selectedNodeId: id, selectedFilePath: null, graph: null })).toEqual({})
    expect(serverNodeIdFor(graph.fileIndex, 'code_file_comp_gone_x_py_1abc')).toBeUndefined()
  })

  it('keeps a chosen file and leaves ordinary selections as they were', () => {
    expect(requestTargetFromSelection({ selectedNodeId: id, selectedFilePath: 'other.ts', graph })).toEqual({
      nodeId: 'comp_e2e_tests',
      filePath: 'other.ts',
    })
    expect(requestTargetFromSelection({ selectedNodeId: null, selectedFilePath: null, graph })).toEqual({})
    expect(requestTargetFromSelection({ selectedNodeId: 'comp_e2e_tests', selectedFilePath: null, graph })).toEqual({ nodeId: 'comp_e2e_tests' })
    expect(requestTargetFromSelection({ selectedNodeId: null, selectedFilePath: 'a.ts', graph })).toEqual({ filePath: 'a.ts' })
    expect(serverNodeIdFor(graph.fileIndex, 'comp_e2e_tests')).toBe('comp_e2e_tests')
  })
})
