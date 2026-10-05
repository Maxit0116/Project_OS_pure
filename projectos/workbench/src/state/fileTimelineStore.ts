import { create } from 'zustand'
import type {
  FileTimelineEntry,
  FileTimelineSnapshotContent,
  GeneratedDiff,
  GeneratedDiffFile,
} from '@contracts/index'
import { useWorkbenchStore } from './workbenchStore'

type LoadForFileOptions = {
  force?: boolean
}

interface FileTimelineStore {
  entriesByFile: Record<string, FileTimelineEntry[]>
  loadingFiles: Record<string, boolean>
  previewDiff: GeneratedDiff | null
  loadForFile: (filePath: string, options?: LoadForFileOptions) => Promise<void>
  refresh: (filePath: string) => Promise<void>
  appendProposedFromDiff: (diff: GeneratedDiff, runId: string) => Promise<void>
  clear: () => void
  compareEntry: (entry: FileTimelineEntry) => Promise<void>
  restoreEntry: (entry: FileTimelineEntry) => Promise<void>
}

const inFlight = new Map<string, Promise<void>>()

function toDiffFile(
  filePath: string,
  before: string | undefined,
  after: string | undefined,
): GeneratedDiffFile {
  return {
    path: filePath,
    changeType: before == null ? 'create' : after == null ? 'delete' : 'modify',
    before,
    after,
  }
}

async function loadTimelineEntries(
  filePath: string,
  showLoading: boolean,
  set: (
    partial:
      | Partial<FileTimelineStore>
      | ((state: FileTimelineStore) => Partial<FileTimelineStore>),
  ) => void,
): Promise<void> {
  const { client, project } = useWorkbenchStore.getState()
  if (!project) return

  if (showLoading) {
    set((state) => ({
      loadingFiles: { ...state.loadingFiles, [filePath]: true },
    }))
  }

  try {
    const entries = await client.listFileTimeline(project.projectId, filePath)
    set((state) => ({
      entriesByFile: { ...state.entriesByFile, [filePath]: entries },
      loadingFiles: { ...state.loadingFiles, [filePath]: false },
    }))
  } catch (error) {
    console.warn('[fileTimelineStore] failed to load timeline', error)
    set((state) => ({
      entriesByFile: { ...state.entriesByFile, [filePath]: [] },
      loadingFiles: { ...state.loadingFiles, [filePath]: false },
    }))
  }
}

export const useFileTimelineStore = create<FileTimelineStore>((set, get) => ({
  entriesByFile: {},
  loadingFiles: {},
  previewDiff: null,

  loadForFile: async (filePath, options) => {
    if (!filePath) return

    const force = options?.force ?? false
    const cached = get().entriesByFile[filePath]

    if (cached !== undefined && !force) {
      const existing = inFlight.get(filePath)
      if (existing) {
        await existing
        return
      }
      const refresh = loadTimelineEntries(filePath, false, set)
      inFlight.set(filePath, refresh)
      try {
        await refresh
      } finally {
        inFlight.delete(filePath)
      }
      return
    }

    const existing = inFlight.get(filePath)
    if (existing) {
      await existing
      return
    }

    const showLoading = cached === undefined
    const promise = loadTimelineEntries(filePath, showLoading, set)
    inFlight.set(filePath, promise)
    try {
      await promise
    } finally {
      inFlight.delete(filePath)
    }
  },

  refresh: async (filePath) => {
    await get().loadForFile(filePath, { force: true })
  },

  appendProposedFromDiff: async (diff, runId) => {
    void runId
    for (const file of diff.files) {
      await get().loadForFile(file.path, { force: true })
    }
  },

  clear: () => {
    inFlight.clear()
    set({ entriesByFile: {}, loadingFiles: {}, previewDiff: null })
  },

  compareEntry: async (entry) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!project) return

    let snapshot: FileTimelineSnapshotContent = {}
    try {
      snapshot = await client.getFileTimelineSnapshot(project.projectId, entry.id)
    } catch {
      snapshot = {}
    }

    const previewDiff: GeneratedDiff = {
      runId: entry.runId ?? 'timeline-preview',
      summary: entry.label,
      files: [toDiffFile(entry.filePath, snapshot.before, snapshot.after)],
    }

    set({ previewDiff })
    useWorkbenchStore.setState({
      centerTab: 'code',
      codeSubTab: 'diff',
      generatedDiff: previewDiff,
      diffReady: true,
    })
  },

  restoreEntry: async (entry) => {
    const { client, project } = useWorkbenchStore.getState()
    if (!project) return

    const snapshot = await client.getFileTimelineSnapshot(project.projectId, entry.id)
    const restored = snapshot.before ?? snapshot.after
    if (restored == null) return

    useWorkbenchStore.getState().updateEditorBuffer(entry.filePath, restored)
    useWorkbenchStore.setState({
      centerTab: 'code',
      codeSubTab: 'editor',
      selectedFilePath: entry.filePath,
      highlightedFilePaths: [entry.filePath],
    })
  },
}))
