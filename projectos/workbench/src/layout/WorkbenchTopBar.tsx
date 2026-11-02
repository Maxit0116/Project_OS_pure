import { isMacElectronShell } from '../data/clientMode'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useI18n } from '../i18n'
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
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const selectedFilePath = useWorkbenchStore((s) => s.selectedFilePath)
  const globalAgentActive = useWorkbenchStore((s) => s.globalAgentActive)
  const { ts } = useI18n()

  const nodeName = selectedNodeId
    ? graph?.nodes.find((n) => n.id === selectedNodeId)?.name
    : null
  const fileName = selectedFilePath?.split('/').pop()

  // Mac: level navigator + settings live on DesktopTitleBar; stage rail is separate.
  if (isMacDesktop) {
    return null
  }

  const showMapLevelNavigator = centerTab === 'function-map' && !!graph
  const showContext = globalAgentActive || projectName || nodeName || fileName

  return (
    <header className={`${styles.topBar} glass-slide-down`}>
      {showMapLevelNavigator && (
        <div className={styles.topBarLeading}>
          <FunctionMapLevelNavigator />
        </div>
      )}

      {showContext && (
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

      <div className={styles.actions}>
        <WorkbenchChromeActions onOpenSettings={onOpenSettings} />
      </div>
    </header>
  )
}
