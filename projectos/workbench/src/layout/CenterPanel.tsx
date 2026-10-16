import { useCallback, useEffect, useState } from 'react'
import { useWorkbenchStore } from '../state/workbenchStore'
import { isDesktopApp } from '../data/clientMode'
import { useI18n } from '../i18n'
import FunctionMap from '../components/FunctionMap/FunctionMap'
import MapChromeAnchor from '../components/FunctionMap/MapChromeAnchor'
import AgentFlowPanel from '../components/AgentFlow/AgentFlowPanel'
import DiffReviewPanel from '../components/DiffReview/DiffReviewPanel'
import CodeEditorWorkspace from '../components/CodeEditor/CodeEditorWorkspace'
import { hasOpenEditorFiles } from '../components/CodeEditor/editorPaneHelpers'
import BrowserPanel from '../components/Browser/BrowserPanel'
import DiffReadyBanner from '../components/DiffReadyBanner/DiffReadyBanner'
import TabBar from '../components/ui/TabBar'
import EmptyState from '../components/ui/EmptyState'
import { Code2 } from 'lucide-react'
import styles from './CenterPanel.module.css'
import { setPersistentPanelVisibility } from './persistentPanelInert'

interface Props {
  mapBleed?: boolean
}

export default function CenterPanel({ mapBleed }: Props) {
  const centerTab = useWorkbenchStore((s) => s.centerTab)
  const codeSubTab = useWorkbenchStore((s) => s.codeSubTab)
  const setCodeSubTab = useWorkbenchStore((s) => s.setCodeSubTab)
  const graph = useWorkbenchStore((s) => s.graph)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const selectNode = useWorkbenchStore((s) => s.selectNode)
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const clearSelection = useWorkbenchStore((s) => s.clearSelection)
  const mapContent = useWorkbenchStore((s) => s.mapContent)
  const flowSteps = useWorkbenchStore((s) => s.flowSteps)
  const flowStatus = useWorkbenchStore((s) => s.flowStatus)
  const diffReady = useWorkbenchStore((s) => s.diffReady)
  const generatedDiff = useWorkbenchStore((s) => s.generatedDiff)
  const applyResult = useWorkbenchStore((s) => s.applyResult)
  const applyCurrentDiff = useWorkbenchStore((s) => s.applyCurrentDiff)
  const verificationResult = useWorkbenchStore((s) => s.verificationResult)
  const verificationCommandApproval = useWorkbenchStore((s) => s.verificationCommandApproval)
  const verificationLoading = useWorkbenchStore((s) => s.verificationLoading)
  const undoLoading = useWorkbenchStore((s) => s.undoLoading)
  const runCurrentVerification = useWorkbenchStore((s) => s.runCurrentVerification)
  const approveAndRunCurrentVerification = useWorkbenchStore(
    (s) => s.approveAndRunCurrentVerification,
  )
  const undoCurrentApply = useWorkbenchStore((s) => s.undoCurrentApply)
  const diffReadyBanner = useWorkbenchStore((s) => s.diffReadyBanner)
  const dismissDiffReadyBanner = useWorkbenchStore((s) => s.dismissDiffReadyBanner)
  const navigateFromAgentNotification = useWorkbenchStore((s) => s.navigateFromAgentNotification)
  const navigateToDiffReview = useWorkbenchStore((s) => s.navigateToDiffReview)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const editorPanes = useWorkbenchStore((s) => s.editorPanes)
  const { ts } = useI18n()

  const hasEditorFiles = hasOpenEditorFiles(editorPanes)

  const codeSubTabs = [
    { id: 'editor', label: ts('codeSubTabs.editor') },
    { id: 'diff', label: ts('codeSubTabs.diff') },
  ]

  const mapBleedActive = mapBleed && centerTab === 'function-map'
  const showBrowser = centerTab === 'browser' && isDesktopApp()
  const [browserEverOpened, setBrowserEverOpened] = useState(showBrowser)
  const keepBrowserAlive = isDesktopApp() && (browserEverOpened || showBrowser)
  const browserPanelRef = useCallback((element: HTMLDivElement | null) => {
    setPersistentPanelVisibility(element, showBrowser)
  }, [showBrowser])

  useEffect(() => {
    if (showBrowser) {
      setBrowserEverOpened(true)
    }
  }, [showBrowser])

  const showMapBanner = diffReadyBanner?.channel === 'map_banner'
  const showCenterBanner = diffReadyBanner?.channel === 'center_banner'

  const diffReadyBannerEl =
    diffReadyBanner?.visible ? (
      <DiffReadyBanner
        title={diffReadyBanner.title}
        body={diffReadyBanner.body}
        destination={diffReadyBanner.destination}
        onReview={() => void navigateFromAgentNotification(diffReadyBanner.destination)}
        onDismiss={dismissDiffReadyBanner}
      />
    ) : null

  return (
    <section className={`${styles.panel} ${mapBleedActive ? styles.mapBleed : ''}`}>
      {keepBrowserAlive && (
        <div
          ref={browserPanelRef}
          className={`${styles.body} tab-content-fade ${showBrowser ? styles.browserVisible : styles.browserHidden}`}
          data-zone-interactive
          aria-hidden={!showBrowser}
        >
          <div className={`${styles.codePanel} ${styles.browserPanel}`}>
            {showCenterBanner ? diffReadyBannerEl : null}
            <BrowserPanel />
          </div>
        </div>
      )}

      {!showBrowser && (
        <div className={`${styles.body} tab-content-fade`} key={centerTab}>
          {centerTab === 'function-map' && graph && (
            <div className={styles.tabPane} data-tour="function-map">
              {showMapBanner ? diffReadyBannerEl : null}
              {mapBleedActive ? (
                <MapChromeAnchor />
              ) : (
                <FunctionMap
                  nodes={graph.nodes}
                  edges={graph.edges}
                  fileIndex={graph.fileIndex}
                  fileRelations={graph.fileRelations}
                  architecture={graph.architecture}
                  architectureViews={graph.views}
                  projectName={graph.projectName}
                  mapContent={mapContent}
                  selectedNodeId={selectedNodeId}
                  selectedFilePath={selectedFilePath}
                  onSelectNode={selectNode}
                  onSelectFile={selectFile}
                  onClearSelection={clearSelection}
                />
              )}
            </div>
          )}
          {(centerTab === 'code' || hasEditorFiles) && (
            <div
              className={`${styles.codePanel} ${
                centerTab === 'code' ? styles.tabPane : styles.codePanelHidden
              }`}
            >
              {showCenterBanner ? diffReadyBannerEl : null}
              {generatedDiff && (
                <TabBar
                  tabs={codeSubTabs}
                  activeId={codeSubTab}
                  onChange={(id) => setCodeSubTab(id as typeof codeSubTab)}
                  size="sm"
                />
              )}
              {codeSubTab === 'diff' && generatedDiff ? (
                <DiffReviewPanel
                  diff={generatedDiff}
                  applyResult={applyResult}
                  verificationResult={verificationResult}
                  verificationCommandApproval={verificationCommandApproval}
                  verificationLoading={verificationLoading}
                  undoLoading={undoLoading}
                  onApply={() => void applyCurrentDiff()}
                  onVerify={() => void runCurrentVerification()}
                  onApproveVerification={() => void approveAndRunCurrentVerification()}
                  onUndo={() => void undoCurrentApply()}
                />
              ) : hasEditorFiles ? (
                <CodeEditorWorkspace />
              ) : (
                <EmptyState
                  icon={<Code2 size={16} />}
                  title={ts('code.emptyTitle')}
                  description={ts('code.emptyDesc')}
                />
              )}
            </div>
          )}
          {centerTab === 'agent-flow' && (
            <div className={styles.tabPane} data-tour="agent-flow">
              {showCenterBanner ? diffReadyBannerEl : null}
              <AgentFlowPanel
                steps={flowSteps}
                status={flowStatus}
                diffReady={diffReady}
                onReviewDiff={() => void navigateToDiffReview()}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
