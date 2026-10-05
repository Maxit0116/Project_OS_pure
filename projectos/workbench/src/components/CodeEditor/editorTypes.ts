export type EditorSplitDirection = 'horizontal' | 'vertical'

export interface EditorPane {
  id: string
  filePaths: string[]
  activeFilePath: string | null
}

export interface EditorLayoutState {
  editorPanes: EditorPane[]
  editorSplitDirection: EditorSplitDirection | null
  focusedEditorPaneId: string
}
