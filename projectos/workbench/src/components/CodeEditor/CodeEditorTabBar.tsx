import { Columns2, FileCode, Rows2, X } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useTabStripDrag } from '../ui/tabStrip/useTabStripDrag'
import { useTabStripLayout } from '../ui/tabStrip/useTabStripLayout'
import tabStyles from '../ui/tabStrip/TabStrip.module.css'
import CodeEditorTabItem from './CodeEditorTabItem'
import styles from './CodeEditorTabBar.module.css'

interface Props {
  paneId: string
}

function fileLabel(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

export default function CodeEditorTabBar({ paneId }: Props) {
  const { ts } = useI18n()
  const pane = useWorkbenchStore((s) => s.editorPanes.find((p) => p.id === paneId))
  const editorPanes = useWorkbenchStore((s) => s.editorPanes)
  const focusedEditorPaneId = useWorkbenchStore((s) => s.focusedEditorPaneId)
  const setActiveEditorFile = useWorkbenchStore((s) => s.setActiveEditorFile)
  const setFocusedEditorPane = useWorkbenchStore((s) => s.setFocusedEditorPane)
  const closeEditorFile = useWorkbenchStore((s) => s.closeEditorFile)
  const reorderEditorFile = useWorkbenchStore((s) => s.reorderEditorFile)
  const splitEditor = useWorkbenchStore((s) => s.splitEditor)
  const isEditorDirty = useWorkbenchStore((s) => s.isEditorDirty)

  const filePaths = pane?.filePaths ?? []
  const tabCount = filePaths.length
  const activeFilePath = pane?.activeFilePath ?? null

  const { tabListRef, tabWidth, isCompressed, isScrollable } = useTabStripLayout(tabCount, 0)
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevTabCountRef = useRef(tabCount)
  const prevActiveFileRef = useRef(activeFilePath)

  const activateFile = useCallback(
    (filePath: string) => {
      setFocusedEditorPane(paneId)
      setActiveEditorFile(paneId, filePath)
    },
    [paneId, setActiveEditorFile, setFocusedEditorPane],
  )

  const {
    stripItems,
    dragTabId,
    ghost,
    isDragging,
    onTitlePointerDown,
    onTitleClick,
    shouldSuppressTabClick,
  } = useTabStripDrag({
    tabIds: filePaths,
    tabListRef,
    tabRefs,
    onReorder: (filePath, toIndex) => reorderEditorFile(paneId, filePath, toIndex),
    onActivate: activateFile,
  })

  const ghostFilePath = ghost?.tabId ?? null

  const setTabRef = useCallback((filePath: string, el: HTMLDivElement | null) => {
    if (el) tabRefs.current.set(filePath, el)
    else tabRefs.current.delete(filePath)
  }, [])

  const handleSelectTab = useCallback(
    (filePath: string) => {
      if (!shouldSuppressTabClick()) {
        activateFile(filePath)
      }
    },
    [activateFile, shouldSuppressTabClick],
  )

  const handleCloseTab = useCallback(
    (filePath: string) => {
      closeEditorFile(filePath, paneId)
    },
    [closeEditorFile, paneId],
  )

  useLayoutEffect(() => {
    if (isDragging || !activeFilePath) return
    if (prevActiveFileRef.current === activeFilePath && prevTabCountRef.current === tabCount) {
      return
    }

    const activeEl = tabRefs.current.get(activeFilePath)
    prevActiveFileRef.current = activeFilePath

    const addedTab = tabCount > prevTabCountRef.current
    prevTabCountRef.current = tabCount

    if (!activeEl) return

    activeEl.scrollIntoView({
      inline: addedTab ? 'end' : 'nearest',
      block: 'nearest',
      behavior: 'auto',
    })
  }, [activeFilePath, isDragging, tabCount])

  if (!pane) return null

  const isFocused = focusedEditorPaneId === paneId
  const canSplit = editorPanes.length === 1 && isFocused

  return (
    <div className={styles.tabBar}>
      <div
        ref={tabListRef}
        className={`${tabStyles.tabList} ${isScrollable ? tabStyles.tabListScrollable : ''} ${
          isDragging ? tabStyles.tabListDragging : ''
        }`}
        style={{ '--tab-width': `${tabWidth}px` } as CSSProperties}
        role="tablist"
      >
        {stripItems.map((item) => {
          if (item.kind === 'spacer') {
            return <div key="tab-drag-spacer" className={tabStyles.tabSpacer} aria-hidden />
          }

          const filePath = item.id
          return (
            <CodeEditorTabItem
              key={filePath}
              filePath={filePath}
              isActive={filePath === activeFilePath}
              isDirty={isEditorDirty(filePath)}
              isCompressed={isCompressed}
              showClose
              onTitlePointerDown={onTitlePointerDown}
              onTitleClick={onTitleClick}
              onSelect={handleSelectTab}
              onClose={handleCloseTab}
              setTabRef={setTabRef}
            />
          )
        })}
      </div>

      {canSplit && (
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.toolBtn}
            aria-label={ts('code.splitDown')}
            title={ts('code.splitDown')}
            onClick={() => splitEditor('vertical')}
          >
            <Rows2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            aria-label={ts('code.splitRight')}
            title={ts('code.splitRight')}
            onClick={() => splitEditor('horizontal')}
          >
            <Columns2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}

      {ghost && ghostFilePath
        ? createPortal(
            <div
              className={`${tabStyles.tabDragGhost} ${
                ghostFilePath === activeFilePath || ghostFilePath === dragTabId
                  ? tabStyles.tabDragGhostActive
                  : ''
              }`}
              style={{
                width: ghost.width,
                height: ghost.height,
                transform: `translate(${ghost.x}px, ${ghost.y}px)`,
              }}
            >
              <FileCode size={12} strokeWidth={1.75} className={tabStyles.tabIcon} aria-hidden />
              <span
                className={`${tabStyles.tabTitle} ${
                  isCompressed ? tabStyles.tabTitleCompressed : ''
                }`}
              >
                {fileLabel(ghostFilePath)}
              </span>
              <span className={tabStyles.tabDragGhostClose} aria-hidden>
                <X size={16} strokeWidth={2.25} />
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
