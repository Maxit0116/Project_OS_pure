import { useEffect, useRef, useState } from 'react'
import { FolderOpen, GitBranch } from 'lucide-react'
import { useI18n } from '../i18n'
import { useWorkbenchStore } from '../state/workbenchStore'
import { isDesktopApp } from '../data/clientMode'
import {
  MAX_RECENT_WORKSPACES,
  readRecentWorkspaces,
  recentWorkspaceLocation,
} from '../state/recentWorkspaces'
import type { ThemePreference } from '../styles/theme'
import Button from './ui/Button'
import styles from './WelcomeScreen.module.css'
import {
  closeWelcomeImportDialog,
  handleWelcomeDialogCancel,
  showWelcomeImportDialog,
} from './welcomeDialog'

const THEME_CYCLE: ThemePreference[] = ['system', 'dark', 'light']


interface Props {
  loading: boolean
  loadingMessage?: string | null
  error: string | null
  onOpenWorkspace: (path: string) => void
}

export default function WelcomeScreen({
  loading,
  loadingMessage,
  error,
  onOpenWorkspace,
}: Props) {
  const { ts } = useI18n()
  const themePreference = useWorkbenchStore((s) => s.themePreference)
  const setThemePreference = useWorkbenchStore((s) => s.setThemePreference)
  const [dialogMode, setDialogMode] = useState<'path' | 'clone' | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloneError, setCloneError] = useState<string | null>(null)
  const [cloning, setCloning] = useState(false)
  const recent = readRecentWorkspaces().slice(0, MAX_RECENT_WORKSPACES)
  const desktopApp = isDesktopApp()
  const busy = loading || cloning

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

  const openProject = () => {
    if (desktopApp) {
      void window.projectOS?.shell.pickWorkspaceFolder().then((picked) => {
        if (picked) onOpenWorkspace(picked)
      })
      return
    }
    setDialogMode('path')
  }

  const submitPath = () => {
    const path = workspacePath.trim()
    if (!path) return
    setDialogMode(null)
    onOpenWorkspace(path)
  }

  const submitClone = async () => {
    const url = cloneUrl.trim()
    if (!url) return
    if (!desktopApp || !window.projectOS?.shell.cloneRepository) {
      setCloneError(ts('welcome.cloneUnavailable'))
      return
    }
    setCloning(true)
    setCloneError(null)
    try {
      const destination = await window.projectOS.shell.cloneRepository(url)
      if (!destination) return
      setDialogMode(null)
      setCloneUrl('')
      onOpenWorkspace(destination)
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : ts('welcome.cloneFailed'))
    } finally {
      setCloning(false)
    }
  }

  useEffect(() => {
    if (!dialogMode || !dialogRef.current) return
    const dialog = dialogRef.current
    showWelcomeImportDialog(dialog)
    return () => closeWelcomeImportDialog(dialog)
  }, [dialogMode])

  const status = cloning ? ts('welcome.cloning') : loading ? (loadingMessage ?? ts('welcome.opening')) : null
  const welcomeError =
    error == null
      ? null
      : error.includes('Desktop IPC bridge is not available')
        ? ts('welcome.ipcUnavailable')
        : error

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

      <div className={styles.gate}>
        <div className={styles.brand}>
          <ProjectMark />
          <h1 className={styles.wordmark}>{ts('welcome.title')}</h1>
        </div>

        {welcomeError && (
          <div className={styles.error} role="alert">
            {welcomeError}
          </div>
        )}
        {status && (
          <p className={styles.status} role="status">
            {status}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.tile} onClick={openProject} disabled={busy}>
            <FolderOpen size={18} strokeWidth={1.5} aria-hidden />
            <span>{ts('welcome.openProject')}</span>
          </button>
          <button
            type="button"
            className={styles.tile}
            onClick={() => {
              setCloneError(null)
              setDialogMode('clone')
            }}
            disabled={busy}
          >
            <GitBranch size={18} strokeWidth={1.5} aria-hidden />
            <span>{ts('welcome.cloneRepo')}</span>
          </button>
        </div>

        <section className={styles.recent} aria-label={ts('welcome.recentProjects')}>
          <div className={styles.recentHeader}>
            <span>{ts('welcome.recentProjects')}</span>
          </div>
          {recent.length === 0 ? (
            <p className={styles.recentEmpty}>{ts('welcome.recentEmpty')}</p>
          ) : (
            <ul className={styles.recentList}>
              {recent.map((item) => (
                <li key={item.path}>
                  <button
                    type="button"
                    className={styles.recentRow}
                    onClick={() => onOpenWorkspace(item.path)}
                    disabled={busy}
                  >
                    <span className={styles.recentName}>{item.name}</span>
                    <span className={styles.recentPath}>{recentWorkspaceLocation(item.path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {dialogMode && (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          onClose={() => setDialogMode(null)}
          onCancel={(event) => handleWelcomeDialogCancel(event, () => setDialogMode(null))}
        >
          {dialogMode === 'path' ? (
            <form
              className={styles.dialogCard}
              onSubmit={(event) => {
                event.preventDefault()
                submitPath()
              }}
            >
              <h2 className={styles.dialogTitle}>{ts('welcome.openProject')}</h2>
              <label className={styles.dialogLabel} htmlFor="workspace-path">
                {ts('welcome.pathLabel')}
              </label>
              <input
                id="workspace-path"
                className={styles.dialogInput}
                value={workspacePath}
                onChange={(event) => setWorkspacePath(event.target.value)}
                placeholder={ts('welcome.pathPlaceholder')}
                autoFocus
              />
              <div className={styles.dialogActions}>
                <Button type="button" variant="secondary" onClick={() => setDialogMode(null)}>
                  {ts('common.close')}
                </Button>
                <Button type="submit">{ts('welcome.openPath')}</Button>
              </div>
            </form>
          ) : (
            <form
              className={styles.dialogCard}
              onSubmit={(event) => {
                event.preventDefault()
                void submitClone()
              }}
            >
              <h2 className={styles.dialogTitle}>{ts('welcome.cloneRepo')}</h2>
              <label className={styles.dialogLabel} htmlFor="clone-url">
                {ts('welcome.cloneUrlLabel')}
              </label>
              <input
                id="clone-url"
                className={styles.dialogInput}
                value={cloneUrl}
                onChange={(event) => setCloneUrl(event.target.value)}
                placeholder={ts('welcome.cloneUrlPlaceholder')}
                autoFocus
                spellCheck={false}
              />
              {cloneError && (
                <p className={styles.dialogHint} role="alert">
                  {cloneError}
                </p>
              )}
              <div className={styles.dialogActions}>
                <Button type="button" variant="secondary" onClick={() => setDialogMode(null)} disabled={cloning}>
                  {ts('common.close')}
                </Button>
                <Button type="submit" disabled={cloning || !cloneUrl.trim()}>
                  {cloning ? ts('welcome.cloning') : ts('welcome.cloneSubmit')}
                </Button>
              </div>
            </form>
          )}
        </dialog>
      )}
    </div>
  )
}

function ProjectMark() {
  return (
    <svg className={styles.mark} width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect x="1.5" y="1.5" width="19" height="19" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="11" r="1.35" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="1.35" fill="currentColor" />
      <circle cx="14.5" cy="14.5" r="1.35" fill="currentColor" />
      <path d="M9.2 10.3 L13.2 8.2 M9.2 11.7 L13.2 13.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
