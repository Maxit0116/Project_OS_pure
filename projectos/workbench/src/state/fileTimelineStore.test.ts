import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FileTimelineEntry, ProjectOSApi } from '@contracts/index'
import { useFileTimelineStore } from './fileTimelineStore'
import { useWorkbenchStore } from './workbenchStore'

const listFileTimeline = vi.fn(async (): Promise<FileTimelineEntry[]> => [
  {
    id: 'entry_1',
    filePath: 'src/a.ts',
    kind: 'manual_save',
    label: 'Save',
    timestamp: new Date().toISOString(),
  },
])

function setupProject() {
  useWorkbenchStore.setState({
    project: {
      projectId: 'proj_1',
      workspaceRoot: '/tmp',
      name: 'Demo',
    },
    client: { listFileTimeline } as unknown as ProjectOSApi,
  })
}

afterEach(() => {
  useFileTimelineStore.getState().clear()
  listFileTimeline.mockClear()
  useWorkbenchStore.setState({ project: null })
})

describe('fileTimelineStore.loadForFile', () => {
  it('does not show loading when cached entries are refreshed', async () => {
    setupProject()

    await useFileTimelineStore.getState().loadForFile('src/a.ts')
    expect(useFileTimelineStore.getState().loadingFiles['src/a.ts']).toBe(false)

    await useFileTimelineStore.getState().loadForFile('src/a.ts')

    expect(useFileTimelineStore.getState().loadingFiles['src/a.ts']).toBe(false)
    expect(listFileTimeline).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent loads for the same file', async () => {
    setupProject()

    await Promise.all([
      useFileTimelineStore.getState().loadForFile('src/b.ts'),
      useFileTimelineStore.getState().loadForFile('src/b.ts'),
    ])

    expect(listFileTimeline).toHaveBeenCalledTimes(1)
  })
})
