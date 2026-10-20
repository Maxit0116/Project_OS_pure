import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi } from '@contracts/index'
import { emptyComposerDraft } from '@contracts/index'
import { useWorkbenchStore } from './workbenchStore'

describe('Live Graph Phase 3 interaction', () => {
  beforeEach(() => {
    useWorkbenchStore.setState({
      composerDraft: emptyComposerDraft(),
      graph: {
        nodes: [
          {
            id: 'code_login',
            name: 'LoginPage',
            level: 'code',
            elementType: 'code_element',
            linkedFiles: [{ path: 'app/login/page.tsx', role: 'implements', summary: '' }],
          },
        ],
      } as never,
      flowStatus: 'idle',
      activeRunId: null,
      liveGraphPausedRunId: null,
      verificationCommandApproval: null,
      rightPanelTab: 'chat',
      pushToast: vi.fn(),
      locale: 'en',
    })
  })

  it('addGraphContextFromNode attaches a file without inventing write scope', () => {
    useWorkbenchStore.getState().addGraphContextFromNode('code_login')
    const draft = useWorkbenchStore.getState().composerDraft
    expect(draft.attachments).toHaveLength(1)
    expect(draft.attachments[0]?.ref).toEqual({
      kind: 'file',
      path: 'app/login/page.tsx',
    })
  })

  it('pauseAgentFromGraph interrupts and keeps paused run id for resume', async () => {
    const dispose = vi.fn()
    const pauseAgentRun = vi.fn(async () => ({
      runId: 'run_pause',
      projectId: 'proj_1',
      kind: 'feature_change' as const,
      status: 'interrupted' as const,
      relatedNodeIds: [],
      relatedFiles: [],
      scope: { kind: 'global' as const },
      startedAt: '2026-10-20T00:00:00.000Z',
      completedAt: '2026-10-20T00:00:01.000Z',
    }))
    useWorkbenchStore.setState({
      client: { pauseAgentRun } as unknown as ProjectOSApi,
      activeRunId: 'run_pause',
      flowStatus: 'running',
      runDisposable: { dispose },
      executionOverlay: null,
      graph: useWorkbenchStore.getState().graph,
    })

    await useWorkbenchStore.getState().pauseAgentFromGraph()

    expect(dispose).toHaveBeenCalledOnce()
    expect(pauseAgentRun).toHaveBeenCalledWith('run_pause')
    expect(useWorkbenchStore.getState().activeRunId).toBeNull()
    expect(useWorkbenchStore.getState().liveGraphPausedRunId).toBe('run_pause')
    expect(useWorkbenchStore.getState().flowStatus).toBe('idle')
  })

  it('rejectFromGraph clears verification approval without approving', () => {
    useWorkbenchStore.setState({
      verificationCommandApproval: {
        status: 'approval_required',
        projectId: 'proj_1',
        commandSetHash: `sha256:${'a'.repeat(64)}`,
        commands: [{ command: 'npm', args: ['test'], timeoutMs: 60_000 }],
      },
    })
    useWorkbenchStore.getState().rejectFromGraph()
    expect(useWorkbenchStore.getState().verificationCommandApproval).toBeNull()
  })
})
