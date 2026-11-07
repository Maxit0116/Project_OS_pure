import { type AnimationEvent, useEffect, useRef } from 'react'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
import SemanticFileTree from '../components/SemanticFileTree/SemanticFileTree'
import DirectoryTree from '../components/SemanticFileTree/DirectoryTree'
import CaptureMiscSidebar from '../components/SpatialCaptures/CaptureMiscSidebar'
import FunctionMapNodeDetailSidebar from '../components/FunctionMap/FunctionMapNodeDetailSidebar'
import BrowserSidebar from '../components/Browser/BrowserSidebar'
import TabBar from '../components/ui/TabBar'
import Button from '../components/ui/Button'
import { GlassPanelShell } from '../components/Glass'
import LeftSidebarSection from '../components/LeftSidebar/LeftSidebarSection'
import OutlinePanel from '../components/LeftSidebar/OutlinePanel'
import TimelinePanel from '../components/LeftSidebar/TimelinePanel'
import { getActiveEditorFilePath } from '../components/CodeEditor/editorPaneHelpers'
import type { PanelMotionPhase } from '../hooks/usePanelPresence'
import styles from './LeftPanel.module.css'

interface Props {
  graphBleed?: boolean
  drawer?: boolean
  /** Drawer slide runs on the WorkbenchSidePanels shell (semantic tree). */
  shellMotion?: boolean
  motionPhase?: PanelMotionPhase
  onMotionEnd?: (event: AnimationEvent<HTMLElement>) => void
  onClose?: () => void
}

export default function LeftPanel({
  graphBleed,
  drawer,
  shellMotion,
  motionPhase,
  onMotionEnd,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const treeViewMode = useWorkbenchStore((s) => s.treeViewMode)
  const setTreeViewMode = useWorkbenchStore((s) => s.setTreeViewMode)
  const centerTab = useWorkbenchStore((s) => s.centerTab)
  const editorPanes = useWorkbenchStore((s) => s.editorPanes)
  const focusedEditorPaneId = useWorkbenchStore((s) => s.focusedEditorPaneId)
  const editorSplitDirection = useWorkbenchStore((s) => s.editorSplitDirection)
  const outlineExpanded = useWorkbenchStore((s) => s.outlineExpanded)
  const timelineExpanded = useWorkbenchStore((s) => s.timelineExpanded)
  const setOutlineExpanded = useWorkbenchStore((s) => s.setOutlineExpanded)
  const setTimelineExpanded = useWorkbenchStore((s) => s.setTimelineExpanded)
  const { ts } = useI18n()

  const activeEditorFile = getActiveEditorFilePath({
    editorPanes,
    focusedEditorPaneId,
    editorSplitDirection,
  })
  const showCodeTree = centerTab === 'code'
  const showCaptureMisc = centerTab === 'spatial-captures'
  const showMapNodeDetail = centerTab === 'function-map'
  const showBrowserSidebar = centerTab === 'browser'

  useEffect(() => {
    if (motionPhase === 'enter') {
      panelRef.current?.style.removeProperty('visibility')
    }
  }, [motionPhase])

  const tabs = [
    { id: 'semantic', label: ts('tree.semantic') },
    { id: 'directory', label: ts('tree.directory') },
  ]

  const frostClass = graphBleed ? '' : drawer ? 'glass-panel-edge-right-drawer' : 'glass-panel-edge-right'
  const motionClass =
    drawer && !shellMotion
      ? motionPhase === 'exit'
        ? styles.drawerExit
        : motionPhase === 'enter'
          ? styles.drawerEnter
          : ''
      : drawer
        ? ''
        : 'glass-slide-left'

  const zone = showCaptureMisc
    ? 'capture-misc'
    : showMapNodeDetail
      ? 'map-node-detail'
      : showBrowserSidebar
        ? 'browser-sidebar'
        : 'file-tree'

  const panel = (
    <aside
      ref={panelRef}
      className={`${styles.panel} ${graphBleed ? styles.panelBleed : frostClass} ${motionClass}`}
      data-zone={zone}
      onAnimationEnd={shellMotion ? undefined : onMotionEnd}
    >
      <div className={styles.inner}>
        {showCaptureMisc ? (
          <>
            <div className={styles.header}>
              <div className={styles.headerTop}>
                <span className={styles.title}>{ts('spatialCaptures.miscTitle')}</span>
                {drawer && onClose && (
                  <Button variant="ghost" size="sm" onClick={onClose} aria-label={ts('common.close')}>
                    ×
                  </Button>
                )}
              </div>
            </div>
            <div className={styles.body}>
              <CaptureMiscSidebar />
            </div>
          </>
        ) : showMapNodeDetail ? (
          <>
            <div className={styles.header}>
              <div className={styles.headerTop}>
                <span className={styles.title}>{ts('map.c4Detail.title')}</span>
                {drawer && onClose && (
                  <Button variant="ghost" size="sm" onClick={onClose} aria-label={ts('common.close')}>
                    ×
                  </Button>
                )}
              </div>
            </div>
            <div className={styles.body}>
              <FunctionMapNodeDetailSidebar />
            </div>
          </>
        ) : showBrowserSidebar ? (
          <>
            <div className={styles.header}>
              <div className={styles.headerTop}>
                <span className={styles.title}>{ts('browser.sidebar.title')}</span>
                {drawer && onClose && (
                  <Button variant="ghost" size="sm" onClick={onClose} aria-label={ts('common.close')}>
                    ×
                  </Button>
                )}
              </div>
            </div>
            <div className={styles.body}>
              <BrowserSidebar />
            </div>
          </>
        ) : showCodeTree ? (
          <>
            <div className={styles.header}>
              <div className={styles.headerTop}>
                <span className={styles.title}>{ts('tree.title')}</span>
                {drawer && onClose && (
                  <Button variant="ghost" size="sm" onClick={onClose} aria-label={ts('common.close')}>
                    ×
                  </Button>
                )}
              </div>
              <TabBar
                tabs={tabs}
                activeId={treeViewMode}
                onChange={(id) => setTreeViewMode(id as 'semantic' | 'directory')}
                size="sm"
                chrome="nested"
              />
            </div>
            <div className={styles.body}>
              <div className={styles.treeLayout}>
                {treeViewMode === 'semantic' ? <SemanticFileTree /> : <DirectoryTree />}
              </div>
              <div className={styles.codeSections}>
                <LeftSidebarSection
                  title={ts('outline.title')}
                  expanded={outlineExpanded}
                  onToggle={() => setOutlineExpanded(!outlineExpanded)}
                >
                  <OutlinePanel filePath={activeEditorFile} />
                </LeftSidebarSection>
                <LeftSidebarSection
                  title={ts('timeline.title')}
                  expanded={timelineExpanded}
                  onToggle={() => setTimelineExpanded(!timelineExpanded)}
                >
                  <TimelinePanel filePath={activeEditorFile} />
                </LeftSidebarSection>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerTop}>
                <span className={styles.title}>{ts('tree.title')}</span>
                {drawer && onClose && (
                  <Button variant="ghost" size="sm" onClick={onClose} aria-label={ts('common.close')}>
                    ×
                  </Button>
                )}
              </div>
            </div>
            <div className={styles.body}>
              <div className={styles.sidebarUnavailable}>{ts('tree.unavailableForTab')}</div>
            </div>
          </>
        )}
      </div>
    </aside>
  )

  if (!graphBleed) {
    return panel
  }

  return (
    <GlassPanelShell active edge="right" className={styles.shell} zoneInteractive>
      {panel}
    </GlassPanelShell>
  )
}
