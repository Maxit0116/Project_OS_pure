import { Fragment } from 'react'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { hasOpenEditorFiles } from './editorPaneHelpers'
import CodeEditorTabBar from './CodeEditorTabBar'
import FileEditorPanel from './FileEditorPanel'
import styles from './CodeEditorWorkspace.module.css'

export default function CodeEditorWorkspace() {
  const editorPanes = useWorkbenchStore((s) => s.editorPanes)
  const editorSplitDirection = useWorkbenchStore((s) => s.editorSplitDirection)
  const focusedEditorPaneId = useWorkbenchStore((s) => s.focusedEditorPaneId)
  const editorBuffers = useWorkbenchStore((s) => s.editorBuffers)
  const setFocusedEditorPane = useWorkbenchStore((s) => s.setFocusedEditorPane)
  const updateEditorBuffer = useWorkbenchStore((s) => s.updateEditorBuffer)

  if (!hasOpenEditorFiles(editorPanes)) {
    return null
  }

  const splitClass =
    editorSplitDirection === 'vertical'
      ? styles.splitVertical
      : editorSplitDirection === 'horizontal'
        ? styles.splitHorizontal
        : ''

  return (
    <div className={`${styles.workspace} ${splitClass}`}>
      {editorPanes.map((pane, index) => {
        const activeFilePath = pane.activeFilePath
        const content =
          activeFilePath && editorBuffers[activeFilePath] !== undefined
            ? editorBuffers[activeFilePath]
            : null
        const isFocused = focusedEditorPaneId === pane.id

        return (
          <Fragment key={pane.id}>
            {index > 0 ? <div className={styles.paneDivider} aria-hidden /> : null}
            <div
              className={`${styles.pane} ${isFocused ? styles.paneFocused : ''}`}
              onMouseDown={() => setFocusedEditorPane(pane.id)}
            >
              {pane.filePaths.length > 0 ? (
                <>
                  <CodeEditorTabBar paneId={pane.id} />
                  {activeFilePath && content !== null ? (
                    <FileEditorPanel
                      filePath={activeFilePath}
                      content={content}
                      showHeader={false}
                      onChange={(value) => updateEditorBuffer(activeFilePath, value)}
                    />
                  ) : (
                    <div className={styles.paneEmpty} />
                  )}
                </>
              ) : (
                <div className={styles.paneEmpty} />
              )}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
