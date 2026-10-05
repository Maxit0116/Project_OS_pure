import { describe, expect, it } from 'vitest'
import {
  closeEditorFileInLayout,
  initialEditorLayout,
  openFileInEditorLayout,
  reorderEditorFileInLayout,
  splitEditorLayout,
} from './editorPaneHelpers'

describe('editorPaneHelpers', () => {
  it('opens files in the focused pane without replacing existing tabs', () => {
    let layout = initialEditorLayout()
    layout = openFileInEditorLayout(layout, 'src/a.ts')
    layout = openFileInEditorLayout(layout, 'src/b.ts')

    const pane = layout.editorPanes[0]
    expect(pane.filePaths).toEqual(['src/a.ts', 'src/b.ts'])
    expect(pane.activeFilePath).toBe('src/b.ts')
  })

  it('closes a tab and collapses split when a pane becomes empty', () => {
    let layout = initialEditorLayout()
    layout = openFileInEditorLayout(layout, 'src/a.ts')
    layout = splitEditorLayout(layout, 'horizontal')

    const secondPaneId = layout.editorPanes[1].id
    layout = closeEditorFileInLayout(layout, 'src/a.ts', secondPaneId)

    expect(layout.editorPanes).toHaveLength(1)
    expect(layout.editorSplitDirection).toBeNull()
    expect(layout.editorPanes[0].filePaths).toEqual(['src/a.ts'])
  })

  it('reorders tabs within a pane', () => {
    let layout = initialEditorLayout()
    layout = openFileInEditorLayout(layout, 'src/a.ts')
    layout = openFileInEditorLayout(layout, 'src/b.ts')
    layout = openFileInEditorLayout(layout, 'src/c.ts')

    const paneId = layout.editorPanes[0].id
    layout = reorderEditorFileInLayout(layout, paneId, 'src/c.ts', 0)

    expect(layout.editorPanes[0].filePaths).toEqual(['src/c.ts', 'src/a.ts', 'src/b.ts'])
  })
})
