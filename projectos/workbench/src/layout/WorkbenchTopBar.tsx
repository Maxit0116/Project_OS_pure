import { isDesktopApp, isMacElectronShell } from '../data/clientMode'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
import TabBar from '../components/ui/TabBar'
import FunctionMapToolbar from '../components/FunctionMap/FunctionMapToolbar'
import FunctionMapLevelNavigator from '../components/FunctionMap/FunctionMapLevelNavigator'
import WorkbenchChromeActions from './WorkbenchChromeActions'
import styles from './AppShell.module.css'

const isMacDesktop = isMacElectronShell()

interface Props {
  onOpenSettings: () => void
}

export default function WorkbenchTopBar({
  onOpenSettings,
}: Props) {
  const projectName = useWorkbenchStore((s) => s.project?.displayName)
  const graph = useWorkbenchStore((s) => s.graph)
  const centerTab = useWorkbenchStore((s) => s.centerTab)
  const setCenterTab = useWorkbenchStore((s) => s.setCenterTab)
  const diffReady = useWorkbenchStore((s) => s.diffReady)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const globalAgentActive = useWorkbenchStore((s) => s.globalAgentActive)
  const { ts } = useI18n()

  const nodeName = selectedNodeId
    ? graph?.nodes.find((n) => n.id === selectedNodeId)?.name
    : null
  const fileName = selectedFilePath?.split('/').pop()

  const centerTabs = [
    { id: 'function-map', label: ts('centerTabs.functionMap') },
    { id: 'spatial-captures', label: ts('centerTabs.spatialCaptures') },
    { id: 'code', label: ts('centerTabs.codeDiff'), dot: diffReady },
    ...(isDesktopApp()
      ? [
          { id: 'browser', label: ts('centerTabs.browser') },
        ]
      : []),
  ]

  const showMapToolbar = centerTab === 'function-map' && !!graph
  const showMapLevelNavigator = showMapToolbar && !isMacDesktop

  return (
    <header className={`${styles.topBar} glass-slide-down`}>
      {showMapLevelNavigator && (
        <div className={styles.topBarLeading}>
          <FunctionMapLevelNavigator />
        </div>
      )}
      <div className={styles.topBarPrimary}>
        <TabBar
          tabs={centerTabs}
          activeId={centerTab}
          onChange={(id) => setCenterTab(id as typeof centerTab)}
          size="sm"
          chrome="nested"
        />

        {showMapToolbar && (
          <>
            <span className={styles.topBarDivider} aria-hidden />
            <div className={styles.mapChrome}>
              <FunctionMapToolbar variant="inline" />
            </div>
          </>
        )}
      </div>

      {!isMacDesktop && (globalAgentActive || projectName || nodeName || fileName) && (
        <div className={styles.topBarContextCentered}>
          {globalAgentActive && (
            <span className={styles.projectName}>{ts('context.scopeGlobal')}</span>
          )}
          {!globalAgentActive && projectName && !nodeName && !fileName && (
            <span className={styles.projectName}>{projectName}</span>
          )}
          {!globalAgentActive && (nodeName || fileName) && (
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              {nodeName && <span>{nodeName}</span>}
              {nodeName && fileName && <span className={styles.sep}>{ts('topBar.breadcrumbSep')}</span>}
              {fileName && <span className={styles.fileCrumb}>{fileName}</span>}
            </nav>
          )}
        </div>
      )}

      <div className={styles.spacer} />

      {!isMacDesktop && (
        <div className={styles.actions}>
          <WorkbenchChromeActions onOpenSettings={onOpenSettings} />
        </div>
      )}

    </header>
  )
}
