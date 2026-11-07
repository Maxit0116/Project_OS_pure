/**
 * SYNTHETIC acceptance — not a real model/provider proof.
 * Drives the Diff→Apply→Undo UI/store contract with a deterministic mock client
 * and real temp-file backup/restore bytes.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectOSApi } from '@contracts/index'
import { AgentRunEventSchema } from '@contracts/index'
import { handleRunEvent } from './handleRunEvent'
import { useWorkbenchStore } from './workbenchStore'

const dirs: string[] = []

afterEach(() => {
  useWorkbenchStore.setState({
    activeRunId: null,
    generatedDiff: null,
    diffReady: false,
    diffReviewOnlyReason: null,
    applyResult: null,
    delegatedRunTraces: {},
    centerTab: 'function-map',
    codeSubTab: 'editor',
    flowStatus: 'idle',
  })
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

describe('SYNTHETIC Diff→Apply→Undo state machine (deterministic mock; not real AI)', () => {
  it('blocks Apply while validating, then applies with backup and undoes bytes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pos-synth-diff-'))
    dirs.push(dir)
    const target = join(dir, 'Package.swift')
    const original = '// original\n'
    writeFileSync(target, original, 'utf8')
    const proposed = '// original\n// batch-synth-probe\n'
    const runId = 'run_synth_leaf'
    const backupId = 'backup_synth_1'

    const client = {
      getDiff: vi.fn(async () => ({
        runId,
        summary: 'SYNTHETIC proposed edit',
        files: [
          {
            path: 'Package.swift',
            operation: 'modify' as const,
            before: original,
            after: proposed,
            additions: 1,
            deletions: 0,
          },
        ],
      })),
      applyDiff: vi.fn(async () => {
        writeFileSync(target, proposed, 'utf8')
        writeFileSync(join(dir, `${backupId}.original`), original, 'utf8')
        return {
          runId,
          applied: true,
          filesChanged: ['Package.swift'],
          backupId,
          outcome: 'applied' as const,
          verificationStatus: 'not_run' as const,
        }
      }),
      restoreApplyBackup: vi.fn(async () => {
        const restored = readFileSync(join(dir, `${backupId}.original`), 'utf8')
        writeFileSync(target, restored, 'utf8')
        return { restored: true, filesRestored: ['Package.swift'] }
      }),
      listFileTimeline: vi.fn(async () => []),
      getProjectGraph: vi.fn(async () => ({ nodes: [], edges: [], fileIndex: [] })),
      getSemanticTree: vi.fn(async () => ({ roots: [] })),
      getCurrentWork: vi.fn(async () => null),
    } as unknown as ProjectOSApi

    useWorkbenchStore.setState({
      client,
      project: {
        projectId: 'proj_synth',
        name: 'SYNTHETIC',
        rootPath: dir,
      } as never,
      activeRunId: runId,
      locale: 'en',
      messages: [],
      conversationCheckpoints: [],
      toasts: [],
      editorBuffers: {},
      delegatedRunTraces: {},
      selectedNodeId: null,
    })

    const set = useWorkbenchStore.setState
    const get = useWorkbenchStore.getState

    const proposedEvent = AgentRunEventSchema.parse({
      eventId: 'evt_synth_proposed',
      runId,
      timestamp: '2026-11-07T13:00:00.000Z',
      type: 'diff_proposed',
      payload: { files: [{ path: 'Package.swift', operation: 'modify' }] },
    })
    handleRunEvent(proposedEvent, set, get)
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().generatedDiff?.files.length).toBe(1)
    })
    expect(useWorkbenchStore.getState().diffReviewOnlyReason).toMatch(/validation/i)
    expect(useWorkbenchStore.getState().diffReady).toBe(false)
    // Apply must refuse while review-only / validating.
    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(client.applyDiff).not.toHaveBeenCalled()
    expect(readFileSync(target, 'utf8')).toBe(original)

    const readyEvent = AgentRunEventSchema.parse({
      eventId: 'evt_synth_ready',
      runId,
      timestamp: '2026-11-07T13:00:01.000Z',
      type: 'diff_ready',
      payload: { fileCount: 1, paths: ['Package.swift'] },
    })
    handleRunEvent(readyEvent, set, get)
    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().diffReady).toBe(true)
    })
    expect(useWorkbenchStore.getState().diffReviewOnlyReason).toBeNull()

    await useWorkbenchStore.getState().applyCurrentDiff()
    expect(client.applyDiff).toHaveBeenCalledWith(runId)
    expect(readFileSync(target, 'utf8')).toBe(proposed)
    expect(useWorkbenchStore.getState().applyResult?.backupId).toBe(backupId)

    await useWorkbenchStore.getState().undoCurrentApply()
    expect(client.restoreApplyBackup).toHaveBeenCalled()
    expect(readFileSync(target, 'utf8')).toBe(original)
  })
})
