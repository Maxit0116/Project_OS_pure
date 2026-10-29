import { useEffect } from 'react'
import { Crosshair, GitBranch, MessageSquare, PanelLeft, Settings, Terminal } from 'lucide-react'
import { isDesktopApp } from '../data/clientMode'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useBottomDockStore } from '../state/bottomDockStore'
import { useI18n } from '../i18n'
import styles from './WorkbenchChromeActions.module.css'

interface Props {
  onOpenSettings: () => void
  /** Slightly smaller controls for the 28px desktop title bar. */
  compact?: boolean
}

export default function WorkbenchChromeActions({ onOpenSettings, compact = false }: Props) {
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const setLeftPanelOpen = useWorkbenchStore((s) => s.setLeftPanelOpen)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const setSettingsOpen = useWorkbenchStore((s) => s.setSettingsOpen)
  const githubAuthStatus = useWorkbenchStore((s) => s.githubAuthStatus)
  const refreshGitHubAuthStatus = useWorkbenchStore((s) => s.refreshGitHubAuthStatus)
  const bottomDockOpen = useBottomDockStore((s) => s.open)
  const togglePanel = useBottomDockStore((s) => s.togglePanel)
  const { ts } = useI18n()

  useEffect(() => {
    void refreshGitHubAuthStatus()
  }, [refreshGitHubAuthStatus])

  const iconSize = compact ? 14 : 16
  const showSpatialPin = isDesktopApp()
  const signedIn = Boolean(githubAuthStatus?.connected && githubAuthStatus.login)
  const accountLabel = signedIn
    ? ts('settings.teamGithub.chromeAccount')
    : ts('settings.teamGithub.chromeSignIn')

  const openGitHubSettings = () => {
    setSettingsOpen(true, 'teamGithub')
  }

  return (
    <div className={`${styles.actions} ${compact ? styles.compact : ''}`}>
      {showSpatialPin && (
        <button
          type="button"
          className={styles.spatialPinBtn}
          onClick={() => void window.projectOS?.spatialPin.beginCapture()}
          title={ts('topBar.spatialPin')}
          aria-label={ts('topBar.spatialPin')}
        >
          <Crosshair size={iconSize} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <div className={styles.panelToggles}>
        <button
          type="button"
          className={`${styles.panelToggle} ${leftPanelOpen ? styles.panelToggleActive : ''}`}
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          aria-label={ts('topBar.toggleTree')}
          aria-pressed={leftPanelOpen}
          title={ts('tree.title')}
        >
          <PanelLeft size={iconSize} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className={`${styles.panelToggle} ${bottomDockOpen ? styles.panelToggleActive : ''}`}
          onClick={togglePanel}
          aria-label={ts('topBar.toggleTerminal')}
          aria-pressed={bottomDockOpen}
          title={ts('demo.terminal')}
        >
          <Terminal size={iconSize} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className={`${styles.panelToggle} ${rightPanelOpen ? styles.panelToggleActive : ''}`}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          aria-label={ts('topBar.toggleChat')}
          aria-pressed={rightPanelOpen}
          title={ts('rightTabs.chat')}
        >
          <MessageSquare size={iconSize} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <button
        type="button"
        className={`${styles.accountBtn} ${signedIn ? styles.accountBtnSignedIn : ''}`}
        onClick={openGitHubSettings}
        title={
          signedIn
            ? ts('settings.teamGithub.connectedAs', { login: githubAuthStatus?.login ?? '' })
            : accountLabel
        }
        aria-label={accountLabel}
      >
        {signedIn && githubAuthStatus?.avatarUrl ? (
          <img
            className={styles.accountAvatar}
            src={githubAuthStatus.avatarUrl}
            alt=""
            width={compact ? 16 : 18}
            height={compact ? 16 : 18}
          />
        ) : (
          <GitBranch size={iconSize} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      <button
        type="button"
        className={styles.settingsBtn}
        onClick={onOpenSettings}
        title={ts('topBar.settings')}
        aria-label={ts('topBar.settings')}
      >
        <Settings size={iconSize} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
