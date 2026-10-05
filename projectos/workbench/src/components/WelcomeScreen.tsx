import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useWorkbenchStore } from '../state/workbenchStore'
import { isDesktopApp, resolveClientMode } from '../data/clientMode'
import type { ThemePreference } from '../styles/theme'
import Button from './ui/Button'
import { SkeletonCard } from './ui/Skeleton'
import { GlassLens } from './Glass'
import styles from './WelcomeScreen.module.css'
import {
  closeWelcomeImportDialog,
  handleWelcomeDialogCancel,
  showWelcomeImportDialog,
} from './welcomeDialog'

const THEME_CYCLE: ThemePreference[] = ['system', 'dark', 'light']
const DEFAULT_WORKSPACE_PATH = 'sample-graph-saas'

interface Props {
  loading: boolean
  loadingMessage?: string | null
  error: string | null
  onOpenSample: () => void
  onOpenWorkspace: (path: string) => void
}

export default function WelcomeScreen({
  loading,
  loadingMessage,
  error,
  onOpenSample,
  onOpenWorkspace,
}: Props) {
  const { ts } = useI18n()
  const themePreference = useWorkbenchStore((s) => s.themePreference)
  const setThemePreference = useWorkbenchStore((s) => s.setThemePreference)
  const [importOpen, setImportOpen] = useState(false)
  const importDialogRef = useRef<HTMLDialogElement>(null)
  const [workspacePath, setWorkspacePath] = useState(DEFAULT_WORKSPACE_PATH)
  const isMockMode = resolveClientMode() === 'mock'
  const desktopApp = isDesktopApp()

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(themePreference)
    setThemePreference(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  const themeLabel =
    themePreference === 'dark'
      ? ts('topBar.themeDark')
      : themePreference === 'light'
        ? ts('topBar.themeLight')
        : ts('topBar.themeSystem')

  const submitImport = () => {
    setImportOpen(false)
    onOpenWorkspace(workspacePath.trim() || DEFAULT_WORKSPACE_PATH)
  }

  const pickFolder = async () => {
    const picked = await window.projectOS?.shell.pickWorkspaceFolder()
    if (picked) {
      onOpenWorkspace(picked)
    }
  }

  useEffect(() => {
    if (!importOpen || !importDialogRef.current) return
    const dialog = importDialogRef.current
    showWelcomeImportDialog(dialog)
    return () => closeWelcomeImportDialog(dialog)
  }, [importOpen])

  return (
    <div className={styles.screen}>
      <button
        type="button"
        className={styles.themeBtn}
        onClick={cycleTheme}
        aria-label={ts('topBar.theme')}
      >
        {themeLabel}
      </button>
      <div className={styles.layout}>
        <div className={styles.preview}>
          <div className={styles.previewPanel}>
            <div className={styles.previewBar} />
            <div className={styles.previewNodes}>
              <span className={styles.nodeA} />
              <span className={styles.nodeB} />
              <span className={styles.nodeC} />
            </div>
          </div>
          <div className={styles.previewTree}>
            <div className={styles.treeLine} />
            <div className={styles.treeLine} />
            <div className={styles.treeLineShort} />
          </div>
          <div className={styles.previewChat}>
            <div className={styles.chatBubble} />
            <div className={styles.chatBubbleUser} />
          </div>
        </div>

        <GlassLens radius={36} tint="clear" className={`${styles.card} glass-enter glass-slide-down`}>
          <h1 className={styles.title}>{ts('welcome.title')}</h1>
          <p className={styles.subtitle}>{ts('welcome.subtitle')}</p>

          {loading ? (
            <div className={styles.actions}>
              <p className={styles.hint} role="status">
                {loadingMessage ?? ts('welcome.opening')}
              </p>
              <SkeletonCard lines={2} />
            </div>
          ) : (
            <div className={styles.actions}>
              {error && <div className={styles.error}>{error}</div>}
              <Button onClick={onOpenSample} disabled={loading}>
                {ts('welcome.openSample')}
              </Button>
              <Button
                variant="secondary"
                disabled={loading}
                onClick={() => {
                  if (desktopApp) {
                    void pickFolder()
                    return
                  }
                  setImportOpen(true)
                }}
                title={isMockMode ? undefined : ts('welcome.importRealHint')}
              >
                {ts('welcome.importProject')}
              </Button>
            </div>
          )}

          <p className={styles.hint}>{ts('welcome.hint')}</p>
        </GlassLens>
      </div>

      {importOpen && !desktopApp && (
        <dialog
          ref={importDialogRef}
          className={styles.dialog}
          onClose={() => setImportOpen(false)}
          onCancel={(event) => handleWelcomeDialogCancel(event, () => setImportOpen(false))}
        >
          <form
            className={styles.dialogCard}
            onSubmit={(e) => {
              e.preventDefault()
              submitImport()
            }}
          >
            <h2 className={styles.dialogTitle}>{ts('welcome.importProject')}</h2>
            <label className={styles.dialogLabel} htmlFor="workspace-path">
              {ts('welcome.pathLabel')}
            </label>
            <input
              id="workspace-path"
              className={styles.dialogInput}
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              placeholder={ts('welcome.pathPlaceholder')}
              autoFocus
            />
            {!isMockMode && (
              <p className={styles.dialogHint}>{ts('welcome.importRealHint')}</p>
            )}
            <div className={styles.dialogActions}>
              <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>
                {ts('common.close')}
              </Button>
              <Button type="submit">{ts('welcome.openPath')}</Button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  )
}
