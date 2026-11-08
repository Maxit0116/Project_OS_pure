import { describe, expect, it, vi } from 'vitest'
import type { ProjectOSApi } from '@contracts/api'

import { useWorkbenchStore } from './workbenchStore'

function setup(confirmDebugFix: () => Promise<unknown>) {
  const sendPrompt = vi.fn(async () => undefined)
  useWorkbenchStore.setState({
    client: { confirmDebugFix, cancelAgentRun: vi.fn() } as unknown as ProjectOSApi,
    debugSession: {
      sessionId: 'debug_1',
      phase: 'fix',
      bugDescription: 'The /team page counts done tasks as open',
      proposedFix: { summary: 'Filter the count to todo and in_progress', touchedFiles: [], patchKind: 'root_cause' },
    } as never,
    chatMode: 'debug',
    flowStatus: 'idle',
    refineLoading: false,
    messages: [],
    locale: 'en',
    error: null,
    sendPrompt,
  } as never)
  return { sendPrompt }
}

describe('confirmDebugFix when no file can be resolved', () => {
  it('hands the fix to Agent with the bug and the diagnosis, instead of ending in an error', async () => {
    // Observed live: a bug reported with no file selected has no probes, hence no logs and no root-cause
    // call, hence no target file. Agent's discovery can find the file; the intent card keeps the person in charge.
    const error = Object.assign(new Error('No target file could be resolved for the debug fix'), { code: 'debug_target_unresolved' })
    const { sendPrompt } = setup(async () => { throw error })

    await useWorkbenchStore.getState().confirmDebugFix()

    expect(sendPrompt).toHaveBeenCalledTimes(1)
    const prompt = (sendPrompt.mock.calls[0] as unknown as [string])[0]
    expect(prompt).toContain('The /team page counts done tasks as open')
    expect(prompt).toContain('Filter the count to todo and in_progress')
    expect(useWorkbenchStore.getState().chatMode).toBe('change')
    expect(useWorkbenchStore.getState().error).toBeNull()
    expect(useWorkbenchStore.getState().messages.at(-1)?.content).toMatch(/handed the fix to Agent/u)
  })

  it('still shows any other failure as an error, and hands nothing over', async () => {
    const { sendPrompt } = setup(async () => { throw Object.assign(new Error('model down'), { code: 'model_unreachable' }) })

    await useWorkbenchStore.getState().confirmDebugFix()

    expect(sendPrompt).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().error).toBeTruthy()
    expect(useWorkbenchStore.getState().chatMode).toBe('debug')
  })
})
