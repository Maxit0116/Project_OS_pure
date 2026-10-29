import { useEffect, useState } from 'react'
import { GitBranch, Copy, Check } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import styles from './SettingsPanel.module.css'
import teamStyles from './TeamGithubSection.module.css'

export default function TeamGithubSection() {
  const { ts } = useI18n()
  const settings = useWorkbenchStore((s) => s.settings)
  const status = useWorkbenchStore((s) => s.githubAuthStatus)
  const pending = useWorkbenchStore((s) => s.githubDeviceAuthPending)
  const refreshGitHubAuthStatus = useWorkbenchStore((s) => s.refreshGitHubAuthStatus)
  const connectGitHub = useWorkbenchStore((s) => s.connectGitHub)
  const importGitHubFromGhCli = useWorkbenchStore((s) => s.importGitHubFromGhCli)
  const saveGitHubOAuthClientId = useWorkbenchStore((s) => s.saveGitHubOAuthClientId)
  const cancelGitHubOAuth = useWorkbenchStore((s) => s.cancelGitHubOAuth)
  const disconnectGitHub = useWorkbenchStore((s) => s.disconnectGitHub)
  const pushToast = useWorkbenchStore((s) => s.pushToast)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [clientIdDraft, setClientIdDraft] = useState('')

  useEffect(() => {
    void refreshGitHubAuthStatus()
  }, [refreshGitHubAuthStatus])

  if (!settings) return null

  const connected = Boolean(status?.connected)
  const presentationMode = settings.presentationMode
  const oauthConfigured = status?.oauthConfigured === true
  const statusLoaded = status !== null

  const handleConnect = async () => {
    setBusy(true)
    try {
      await connectGitHub()
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false)
    }
  }

  const handleImportGh = async () => {
    setBusy(true)
    try {
      await importGitHubFromGhCli()
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false)
    }
  }

  const handleSaveClientId = async () => {
    if (!clientIdDraft.trim()) {
      pushToast({ type: 'error', message: ts('settings.teamGithub.clientIdRequired') })
      return
    }
    setBusy(true)
    try {
      await saveGitHubOAuthClientId(clientIdDraft.trim())
      pushToast({ type: 'info', message: ts('settings.teamGithub.oauthConfigured') })
    } catch (error) {
      pushToast({
        type: 'error',
        message: error instanceof Error ? error.message : ts('settings.teamGithub.clientIdRequired'),
      })
    } finally {
      setBusy(false)
    }
  }

  const handleCopyCode = async () => {
    if (!pending?.userCode) return
    try {
      await navigator.clipboard.writeText(pending.userCode)
      setCopied(true)
      pushToast({ type: 'info', message: ts('settings.teamGithub.deviceCodeCopied') })
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      pushToast({ type: 'error', message: ts('settings.teamGithub.deviceCodeCopyFailed') })
    }
  }

  return (
    <section className={styles.section}>
      <p className={styles.hint}>{ts('settings.teamGithub.help')}</p>
      <p className={styles.hint}>{ts('settings.teamGithub.scopesHelp')}</p>

      {presentationMode && (
        <p className={teamStyles.banner}>{ts('settings.teamGithub.mockMode')}</p>
      )}

      {statusLoaded && !presentationMode && !oauthConfigured && !connected && (
        <div className={teamStyles.bannerWarn}>
          <p>{ts('settings.teamGithub.oauthMissing')}</p>
          <p className={styles.hint}>{ts('settings.teamGithub.useGhCliHelp')}</p>
          <p className={styles.hint}>{ts('settings.teamGithub.callbackHint')}</p>
          <div className={teamStyles.actions}>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void handleImportGh()}
            >
              {ts('settings.teamGithub.useGhCli')}
            </Button>
            <a
              className={teamStyles.link}
              href="https://github.com/settings/developers"
              target="_blank"
              rel="noreferrer"
            >
              {ts('settings.teamGithub.createOauthApp')}
            </a>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{ts('settings.teamGithub.clientIdLabel')}</span>
            <TextInput
              value={clientIdDraft}
              placeholder={ts('settings.teamGithub.clientIdPlaceholder')}
              onChange={(e) => setClientIdDraft(e.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !clientIdDraft.trim()}
            onClick={() => void handleSaveClientId()}
          >
            {ts('settings.teamGithub.saveClientId')}
          </Button>
        </div>
      )}

      {statusLoaded && !presentationMode && oauthConfigured && !connected && !pending && (
        <p className={teamStyles.ready}>{ts('settings.teamGithub.oauthConfigured')}</p>
      )}

      {connected ? (
        <div className={teamStyles.profile}>
          {status?.avatarUrl ? (
            <img
              className={teamStyles.avatar}
              src={status.avatarUrl}
              alt=""
              width={40}
              height={40}
            />
          ) : (
            <div className={teamStyles.avatarFallback} aria-hidden>
              <GitBranch size={20} strokeWidth={1.75} />
            </div>
          )}
          <div className={teamStyles.profileText}>
            <div className={teamStyles.login}>
              {ts('settings.teamGithub.connectedAs', { login: status?.login ?? '—' })}
            </div>
            {status?.name ? <div className={teamStyles.name}>{status.name}</div> : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void disconnectGitHub().finally(() => setBusy(false))
            }}
          >
            {ts('settings.teamGithub.disconnect')}
          </Button>
        </div>
      ) : pending ? (
        <div className={teamStyles.pending}>
          <p className={teamStyles.signingIn}>{ts('settings.teamGithub.signingIn')}</p>
          {pending.userCode !== 'LOOPBACK' && (
            <>
              <p className={styles.hint}>{ts('settings.teamGithub.deviceCodeHint')}</p>
              <div className={teamStyles.codeRow}>
                <code className={teamStyles.code}>{pending.userCode}</code>
                <Button variant="secondary" size="sm" onClick={() => void handleCopyCode()}>
                  {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                  {ts('settings.teamGithub.copyDeviceCode')}
                </Button>
              </div>
            </>
          )}
          <p className={styles.hint}>{ts('settings.teamGithub.signingInHint')}</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void cancelGitHubOAuth().finally(() => setBusy(false))
            }}
          >
            {ts('settings.teamGithub.cancel')}
          </Button>
        </div>
      ) : (
        <div className={teamStyles.actions}>
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void handleConnect()}
          >
            <GitBranch size={14} strokeWidth={1.75} aria-hidden />
            {ts('settings.teamGithub.connect')}
          </Button>
          {!oauthConfigured && !presentationMode && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void handleImportGh()}
            >
              {ts('settings.teamGithub.useGhCli')}
            </Button>
          )}
          <span className={styles.hint}>{ts('settings.teamGithub.notConnected')}</span>
        </div>
      )}
    </section>
  )
}
