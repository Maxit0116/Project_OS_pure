import { describe, expect, it } from 'vitest'
import type { ExecutorOption } from '@contracts/index'
import { selectExecutorForRequest } from './workbenchStore'

const scripted: ExecutorOption = {
  kind: 'runtime',
  executorId: 'scripted',
  runtimeProfileId: 'scripted',
  label: 'Scripted executor (dev, no model)',
  devOnly: true,
}

function state(overrides: Partial<Parameters<typeof selectExecutorForRequest>[0]> = {}) {
  return {
    chatMode: 'change' as const,
    selectedModelProfileId: 'model_1',
    selectedRuntimeId: 'scripted',
    executorOptions: [scripted],
    settings: null,
    ...overrides,
  }
}

describe('selectExecutorForRequest', () => {
  it('sends the chosen runtime for an Agent-mode change', () => {
    expect(selectExecutorForRequest(state())).toEqual({ kind: 'runtime', runtimeProfileId: 'scripted' })
  })

  it('keeps Ask, Plan and Debug on the selected model', () => {
    for (const chatMode of ['ask', 'plan', 'debug'] as const) {
      expect(selectExecutorForRequest(state({ chatMode }))).toEqual({ kind: 'model', modelProfileId: 'model_1' })
    }
  })

  it('ignores a runtime that is no longer registered and works with no model profile', () => {
    expect(selectExecutorForRequest(state({ executorOptions: [] }))).toEqual({ kind: 'model', modelProfileId: 'model_1' })
    expect(selectExecutorForRequest(state({ selectedModelProfileId: null, executorOptions: [] }))).toBeUndefined()
    expect(selectExecutorForRequest(state({ selectedModelProfileId: null }))).toEqual({ kind: 'runtime', runtimeProfileId: 'scripted' })
  })
})
