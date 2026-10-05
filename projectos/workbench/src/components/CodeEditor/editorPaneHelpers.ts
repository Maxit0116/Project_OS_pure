import type { EditorLayoutState, EditorPane, EditorSplitDirection } from './editorTypes'
import { moveTabInArray } from '../Browser/browserTabReorder'

export function createEditorPane(): EditorPane {
  return { id: crypto.randomUUID(), filePaths: [], activeFilePath: null }
}

export function initialEditorLayout(): EditorLayoutState {
  const pane = createEditorPane()
  return {
    editorPanes: [pane],
    editorSplitDirection: null,
    focusedEditorPaneId: pane.id,
  }
}

export function hasOpenEditorFiles(panes: EditorPane[]): boolean {
  return panes.some((pane) => pane.filePaths.length > 0)
}

export function getActiveEditorFilePath(layout: EditorLayoutState): string | null {
  const focusedPane =
    layout.editorPanes.find((pane) => pane.id === layout.focusedEditorPaneId) ??
    layout.editorPanes[0]
  return focusedPane?.activeFilePath ?? null
}

export function openFileInEditorLayout(
  layout: EditorLayoutState,
  filePath: string,
): EditorLayoutState {
  const focusedIndex = layout.editorPanes.findIndex((p) => p.id === layout.focusedEditorPaneId)
  const paneIndex = focusedIndex >= 0 ? focusedIndex : 0

  const editorPanes = layout.editorPanes.map((pane, index) => {
    if (index !== paneIndex) return pane
    const filePaths = pane.filePaths.includes(filePath)
      ? pane.filePaths
      : [...pane.filePaths, filePath]
    return { ...pane, filePaths, activeFilePath: filePath }
  })

  return {
    editorPanes,
    editorSplitDirection: layout.editorSplitDirection,
    focusedEditorPaneId: layout.focusedEditorPaneId,
  }
}

export function setActiveEditorFileInLayout(
  layout: EditorLayoutState,
  paneId: string,
  filePath: string,
): EditorLayoutState {
  const editorPanes = layout.editorPanes.map((pane) => {
    if (pane.id !== paneId) return pane
    if (!pane.filePaths.includes(filePath)) return pane
    return { ...pane, activeFilePath: filePath }
  })

  return {
    ...layout,
    editorPanes,
    focusedEditorPaneId: paneId,
  }
}

export function closeEditorFileInLayout(
  layout: EditorLayoutState,
  filePath: string,
  paneId?: string,
): EditorLayoutState {
  const targetPane = paneId
    ? layout.editorPanes.find((pane) => pane.id === paneId)
    : layout.editorPanes.find((pane) => pane.filePaths.includes(filePath))

  if (!targetPane) return layout

  let editorPanes = layout.editorPanes.map((pane) => {
    if (pane.id !== targetPane.id) return pane
    const filePaths = pane.filePaths.filter((path) => path !== filePath)
    let activeFilePath = pane.activeFilePath
    if (activeFilePath === filePath) {
      activeFilePath = filePaths[filePaths.length - 1] ?? null
    }
    return { ...pane, filePaths, activeFilePath }
  })

  let editorSplitDirection = layout.editorSplitDirection
  let focusedEditorPaneId = layout.focusedEditorPaneId

  const emptyPane = editorPanes.find((pane) => pane.filePaths.length === 0)
  if (emptyPane && editorPanes.length > 1) {
    editorPanes = editorPanes.filter((pane) => pane.id !== emptyPane.id)
    editorSplitDirection = null
    if (focusedEditorPaneId === emptyPane.id) {
      focusedEditorPaneId = editorPanes[0]?.id ?? focusedEditorPaneId
    }
  }

  return {
    ...layout,
    editorPanes,
    editorSplitDirection,
    focusedEditorPaneId,
  }
}

export function reorderEditorFileInLayout(
  layout: EditorLayoutState,
  paneId: string,
  filePath: string,
  toIndex: number,
): EditorLayoutState {
  const editorPanes = layout.editorPanes.map((pane) => {
    if (pane.id !== paneId) return pane
    const fromIndex = pane.filePaths.indexOf(filePath)
    if (fromIndex < 0) return pane
    return {
      ...pane,
      filePaths: moveTabInArray(pane.filePaths, fromIndex, toIndex),
    }
  })

  return { ...layout, editorPanes, focusedEditorPaneId: paneId }
}

export function splitEditorLayout(
  layout: EditorLayoutState,
  direction: EditorSplitDirection,
): EditorLayoutState {
  if (layout.editorPanes.length >= 2) return layout

  const focused =
    layout.editorPanes.find((pane) => pane.id === layout.focusedEditorPaneId) ??
    layout.editorPanes[0]
  const newPane = createEditorPane()

  if (focused?.activeFilePath) {
    newPane.filePaths = [focused.activeFilePath]
    newPane.activeFilePath = focused.activeFilePath
  }

  return {
    editorPanes: [...layout.editorPanes, newPane],
    editorSplitDirection: direction,
    focusedEditorPaneId: newPane.id,
  }
}
