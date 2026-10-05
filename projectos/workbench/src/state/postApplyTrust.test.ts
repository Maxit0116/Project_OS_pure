import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi } from '@contracts/index'
import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { useWorkbenchStore } from './workbenchStore'

const originalClient = useWorkbenchStore.getState().client

afterEach(() => {
  useWorkbenchStore.setState({
    client: originalClient,
    project: null,
    currentWork: null,
    activeRunId: null,
    generatedDiff: null,
    applyResult: null,
    verificationResult: null,
    verificationCommandApproval: null,
    verificationLoading: false,
    undoLoading: false,
    editorBuffers: {},
    toasts: [],
  })
})

function setup(client: ProjectOSApi) {
  const workspace = createMockSampleWorkspace()
  const path = 'app/login/page.tsx'
  useWorkbenchStore.setState({
    client,
    project: workspace.project,
    graph: workspace.graph,
    tree: workspace.semanticTree,
    currentWork: workspace.currentWork,
    activeRunId: 'run-trust',
    generatedDiff: {
      runId: 'run-trust',
      summary: 'Trust flow',
      files: [{ path, changeType: 'modify', before: 'before', after: 'after' }],
    },
    editorBuffers: { [path]: 'before' },
    locale: 'en',
  })
  return { workspace, path }
}

describe('post-apply trust store', () => {
  it('stores graph-stale metadata returned after apply', async () => {
    const workspace = createMockSampleWorkspace()
    const staleWork = {
      ...workspace.currentWork,
      graphFreshness: {
        stale: true,
        lastAnalyzedAt: workspace.graph.analyzedAt,
        staleSince: '2026-07-18T00:00:00.000Z',
      },
    }
    const client = {
      applyDiff: vi.fn(async () => ({
        runId: 'run-trust',
        applied: true,
        filesChanged: ['app/login/page.tsx'],
        verificationStatus: 'not_run' as const,
        outcome: 'applied' as const,
        backupId: 'backup-trust',
      })),
      getProjectGraph: vi.fn(async () => workspace.graph),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getCurrentWork: vi.fn(async () => staleWork),
    } as unknown as ProjectOSApi
    setup(client)

    await useWorkbenchStore.getState().applyCurrentDiff()

    expect(useWorkbenchStore.getState().currentWork?.graphFreshness).toEqual(
      staleWork.graphFreshness,
    )
    expect(useWorkbenchStore.getState().applyResult?.backupId).toBe('backup-trust')
  })

  it('applies a reviewed delegated group without requiring a synthetic parent diff', async () => {
    const workspace = createMockSampleWorkspace()
    const applyDiff = vi.fn(async () => ({
      runId: 'run-trust',
      applied: true,
      filesChanged: ['app/login/page.tsx', 'lib/auth.ts'],
      verificationStatus: 'not_run' as const,
      outcome: 'applied' as const,
      backupId: 'backup-group',
    }))
    const client = {
      applyDiff,
      getProjectGraph: vi.fn(async () => workspace.graph),
      getSemanticTree: vi.fn(async () => workspace.semanticTree),
      getCurrentWork: vi.fn(async () => workspace.currentWork),
    } as unknown as ProjectOSApi
    setup(client)
    useWorkbenchStore.setState({ generatedDiff: null })

    await useWorkbenchStore.getState().applyCurrentDiff()

    expect(applyDiff).toHaveBeenCalledWith('run-trust')
    expect(useWorkbenchStore.getState().applyResult).toMatchObject({
      backupId: 'backup-group',
      filesChanged: ['app/login/page.tsx', 'lib/auth.ts'],
    })
  })

  it('keeps undo available when explicit verification fails', async () => {
    const getVerificationCommandApproval = vi.fn(async () => ({
      projectId: 'sample-graph-saas',
      status: 'approved' as const,
      commandSetHash: `sha256:${'a'.repeat(64)}`,
      commands: [{ command: 'npm', args: ['test'], timeoutMs: 10_000 }],
    }))
    const runVerification = vi.fn(async () => ({
      runId: 'run-trust',
      status: 'failed' as const,
      results: [{
        command: { command: 'npm', args: ['test'], timeoutMs: 10_000 },
        status: 'failed' as const,
        exitCode: 1,
        durationMs: 20,
        timedOut: false,
        outputTruncated: false,
      }],
    }))
    setup({ getVerificationCommandApproval, runVerification } as unknown as ProjectOSApi)
    useWorkbenchStore.setState({
      applyResult: {
        runId: 'run-trust',
        applied: true,
        filesChanged: ['app/login/page.tsx'],
        verificationStatus: 'not_run',
        outcome: 'applied',
        backupId: 'backup-trust',
      },
    })

    await useWorkbenchStore.getState().runCurrentVerification()

    expect(useWorkbenchStore.getState().verificationResult?.status).toBe('failed')
    expect(useWorkbenchStore.getState().applyResult?.backupId).toBe('backup-trust')
  })

  it('surfaces exact commands and waits for explicit approval before verification', async () => {
    const projectId = createMockSampleWorkspace().project.projectId
    const commands = [{ command: './project-check', args: ['--all'], timeoutMs: 10_000 }]
    const commandSetHash = `sha256:${'b'.repeat(64)}`
    const getVerificationCommandApproval = vi.fn(async () => ({
      projectId,
      status: 'approval_required' as const,
      commandSetHash,
      commands,
    }))
    const approveVerificationCommands = vi.fn(async () => ({
      projectId,
      status: 'approved' as const,
      commandSetHash,
      commands,
    }))
    const runVerification = vi.fn(async () => ({
      runId: 'run-trust',
      status: 'passed' as const,
      results: [{
        command: commands[0]!,
        status: 'passed' as const,
        exitCode: 0,
        durationMs: 20,
        timedOut: false,
        outputTruncated: false,
      }],
    }))
    setup({
      getVerificationCommandApproval,
      approveVerificationCommands,
      runVerification,
    } as unknown as ProjectOSApi)

    await useWorkbenchStore.getState().runCurrentVerification()

    expect(runVerification).not.toHaveBeenCalled()
    expect(useWorkbenchStore.getState().verificationCommandApproval).toEqual({
      projectId,
      status: 'approval_required',
      commandSetHash,
      commands,
    })

    await useWorkbenchStore.getState().approveAndRunCurrentVerification()

    expect(approveVerificationCommands).toHaveBeenCalledWith(
      projectId,
      commandSetHash,
    )
    expect(runVerification).toHaveBeenCalledWith('run-trust')
    expect(useWorkbenchStore.getState().verificationResult?.status).toBe('passed')
  })

  it('restores editor state and clears the applied result after undo', async () => {
    const workspace = createMockSampleWorkspace()
    const restoreApplyBackup = vi.fn(async () => ({
      backupId: 'backup-trust',
      restored: true,
      filesRestored: ['app/login/page.tsx'],
      outcome: 'restored' as const,
    }))
    const getCurrentWork = vi.fn(async () => ({
      ...workspace.currentWork,
      recentChanges: [{
        path: 'app/login/page.tsx',
        action: 'reverted' as const,
        runId: 'run-trust',
        timestamp: '2026-07-18T00:00:00.000Z',
      }],
    }))
    setup({ restoreApplyBackup, getCurrentWork } as unknown as ProjectOSApi)
    useWorkbenchStore.setState({
      applyResult: {
        runId: 'run-trust',
        applied: true,
        filesChanged: ['app/login/page.tsx'],
        verificationStatus: 'failed',
        outcome: 'applied',
        backupId: 'backup-trust',
      },
      editorBuffers: { 'app/login/page.tsx': 'after' },
    })

    await useWorkbenchStore.getState().undoCurrentApply()

    expect(restoreApplyBackup).toHaveBeenCalledWith(
      workspace.project.projectId,
      'backup-trust',
    )
    expect(useWorkbenchStore.getState().editorBuffers['app/login/page.tsx']).toBe('before')
    expect(useWorkbenchStore.getState().applyResult).toBeNull()
  })
})
