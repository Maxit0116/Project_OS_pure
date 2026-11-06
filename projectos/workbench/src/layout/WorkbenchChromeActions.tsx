import { useEffect } from 'react'
import { Crosshair, FlaskConical, GitBranch, MessageSquare, PanelLeft, Settings } from 'lucide-react'
import { isDesktopApp } from '../data/clientMode'
import { useWorkbenchStore } from '../state/workbenchStore'
import { useProductLabStore } from '../state/productLabStore'
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
  const labActiveSessionId = useProductLabStore((s) => s.document.activeSessionId)
  const labActiveStatus = useProductLabStore((s) => {
    const id = s.document.activeSessionId
    if (!id) return null
    return s.document.sessions.find((session) => session.id === id)?.status ?? null
  })
  const labFindingCount = useProductLabStore((s) => s.openFindingCount)
  const toggleOrStartLab = useProductLabStore((s) => s.toggleOrStartLab)
  const labActive = Boolean(labActiveSessionId && labActiveStatus && labActiveStatus !== 'ended')
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
          className={`${styles.panelToggle} ${labActive ? styles.panelToggleActive : ''}`}
          onClick={() => void toggleOrStartLab()}
          aria-label={
            labActive ? ts('topBar.productLabActive') : ts('topBar.productLab')
          }
          aria-pressed={labActive}
          title={
            labActive ? ts('topBar.productLabActive') : ts('topBar.productLab')
          }
        >
          <FlaskConical size={iconSize} strokeWidth={1.75} aria-hidden />
          {labFindingCount > 0 ? (
            <span className={styles.labBadge} aria-hidden>
              {labFindingCount > 9 ? '9+' : labFindingCount}
            </span>
          ) : null}
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
