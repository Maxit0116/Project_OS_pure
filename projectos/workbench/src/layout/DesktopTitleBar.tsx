import { useWorkbenchStore } from '../state/workbenchStore'
import DesktopTitleBarLabel from './DesktopTitleBarLabel'
import FunctionMapLevelNavigator from '../components/FunctionMap/FunctionMapLevelNavigator'
import WorkbenchChromeActions from './WorkbenchChromeActions'
import { useDesktopWindowChrome } from './useDesktopWindowChrome'
import { useSyncDesktopWindowTitle } from './useSyncDesktopWindowTitle'
import styles from './DesktopTitleBar.module.css'

interface Props {
  variant?: 'welcome' | 'workbench'
  onOpenSettings?: () => void
}

/** Thin macOS window chrome above the workbench toolbar (Cursor-style). */
export default function DesktopTitleBar({ variant = 'welcome', onOpenSettings }: Props) {
  const { isMacDesktop, isFullScreen } = useDesktopWindowChrome()
  const project = useWorkbenchStore((s) => s.project)
  const centerTab = useWorkbenchStore((s) => s.centerTab)
  const graph = useWorkbenchStore((s) => s.graph)

  useSyncDesktopWindowTitle(project, isFullScreen)

  if (!isMacDesktop) return null

  const isWorkbench = variant === 'workbench' && !!onOpenSettings
  const showMapLevelNavigator = isWorkbench && centerTab === 'function-map' && !!graph

  return (
    <header
      className={`${styles.titleBar} ${!isFullScreen ? styles.titleBarWindowed : ''}`}
      data-desktop-title-bar
    >
      {isWorkbench && (
        <div className={styles.leading}>
          {showMapLevelNavigator && <FunctionMapLevelNavigator />}
        </div>
      )}
      {isWorkbench && (
        <div className={styles.centerLabel}>
          <DesktopTitleBarLabel />
        </div>
      )}
      <div className={styles.spacer} aria-hidden />
      {isWorkbench && <WorkbenchChromeActions onOpenSettings={onOpenSettings} compact />}
    </header>
  )
}
