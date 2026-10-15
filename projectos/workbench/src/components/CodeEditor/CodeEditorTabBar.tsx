import { Columns2, FileCode, Rows2, X } from 'lucide-react'
import { useCallback, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useTabStripDrag } from '../ui/tabStrip/useTabStripDrag'
import tabStyles from '../ui/tabStrip/TabStrip.module.css'
import CodeEditorTabItem from './CodeEditorTabItem'
import { editorTabScrollDelta, revealEditorTab } from './editorTabScroll'
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

  const tabListRef = useRef<HTMLDivElement>(null)
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

  const onTabListWheel = useCallback((event: WheelEvent) => {
    const list = event.currentTarget as HTMLDivElement
    if (list.scrollWidth <= list.clientWidth + 1) return
    const delta = editorTabScrollDelta(event.deltaX, event.deltaY)
    if (delta === 0) return
    event.preventDefault()
    list.scrollLeft += delta
  }, [])

  const setTabListNode = useCallback(
    (node: HTMLDivElement | null) => {
      const previous = tabListRef.current
      if (previous) {
        previous.removeEventListener('wheel', onTabListWheel)
      }
      tabListRef.current = node
      if (node) {
        node.addEventListener('wheel', onTabListWheel, { passive: false })
      }
    },
    [onTabListWheel],
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

    const list = tabListRef.current
    if (!activeEl || !list) return

    list.scrollLeft = revealEditorTab(list, activeEl, addedTab ? 'end' : 'nearest')
  }, [activeFilePath, isDragging, tabCount])

  if (!pane) return null

  const isFocused = focusedEditorPaneId === paneId
  const canSplit = editorPanes.length === 1 && isFocused

  return (
    <div className={styles.tabBar}>
      <div
        ref={setTabListNode}
        className={`${tabStyles.tabList} ${isDragging ? tabStyles.tabListDragging : ''}`}
        role="tablist"
      >
        {stripItems.map((item) => {
          if (item.kind === 'spacer') {
            return (
              <div
                key="tab-drag-spacer"
                className={tabStyles.tabSpacer}
                style={{ width: ghost?.width ?? 0 }}
                aria-hidden
              />
            )
          }

          const filePath = item.id
          return (
            <CodeEditorTabItem
              key={filePath}
              filePath={filePath}
              isActive={filePath === activeFilePath}
              isDirty={isEditorDirty(filePath)}
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
              <FileCode size={16} strokeWidth={1.75} className={tabStyles.tabIcon} aria-hidden />
              <span className={tabStyles.tabTitle}>{fileLabel(ghostFilePath)}</span>
              <span className={tabStyles.tabDragGhostClose} aria-hidden>
                <X size={14} strokeWidth={2} />
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
