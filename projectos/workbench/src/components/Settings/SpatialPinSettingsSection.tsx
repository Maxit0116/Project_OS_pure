import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import Button from '../ui/Button'
import styles from './SettingsPanel.module.css'

interface BridgeState {
  connected: boolean
  port: number | null
  token: string | null
  bridgeFilePath: string | null
  lastUrl: string | null
}

interface SessionContext {
  projectId: string | null
  workspacePath: string | null
  candidates: Array<{
    projectId: string
    workspacePath: string
    displayName: string
    source: string
  }>
  webEnhanceAvailable: boolean
}

export default function SpatialPinSettingsSection() {
  const { ts } = useI18n()
  const [bridge, setBridge] = useState<BridgeState | null>(null)
  const [session, setSession] = useState<SessionContext | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    const load = async () => {
      const [bridgeState, ctx] = await Promise.all([
        window.projectOS?.spatialPin.getBridgeState(),
        window.projectOS?.spatialPin.getContext(),
      ])
      if (disposed) return
      if (bridgeState) setBridge(bridgeState)
      if (ctx) {
        setSession({
          projectId: ctx.projectId,
          workspacePath: ctx.workspacePath,
          candidates: ctx.candidates ?? [],
          webEnhanceAvailable: Boolean(ctx.webEnhanceAvailable),
        })
      }
    }
    void load()
    const disposable = window.projectOS?.spatialPin.onBridgeState((payload) => {
      setBridge(payload as BridgeState)
    })
    const timer = window.setInterval(() => {
      void load()
    }, 3000)
    return () => {
      disposed = true
      disposable?.dispose()
      window.clearInterval(timer)
    }
  }, [])

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  if (!window.projectOS?.spatialPin) {
    return <p className={styles.hubIntro}>{ts('settings.spatialPinDesktopOnly')}</p>
  }

  return (
    <section className={styles.section}>
      <p className={styles.hubIntro}>{ts('settings.spatialPinIntro')}</p>

      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.spatialPinPrimaryPath')}</span>
        <span>{ts('settings.spatialPinPrimaryPathDesc')}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.spatialPinExternalIde')}</span>
        <span>{ts('settings.spatialPinExternalIdeDesc')}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.spatialPinPermissions')}</span>
        <span>{ts('settings.spatialPinPermissionsDesc')}</span>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.spatialPinActiveProject')}</span>
        <span>
          {session?.workspacePath ??
            session?.projectId ??
            ts('settings.spatialPinNoProject')}
        </span>
      </label>

      {session && session.candidates.length > 0 && (
        <label className={styles.field}>
          <span className={styles.label}>{ts('settings.spatialPinCandidates')}</span>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {session.candidates.map((item) => (
              <li key={item.projectId}>
                {item.displayName}{' '}
                <span style={{ opacity: 0.7 }}>({item.source})</span>
              </li>
            ))}
          </ul>
        </label>
      )}

      <Button
        variant="primary"
        size="sm"
        onClick={() => void window.projectOS?.spatialPin.beginCapture()}
      >
        {ts('settings.spatialPinStartCapture')}
      </Button>

      <p className={styles.hubIntro} style={{ marginTop: 20 }}>
        {ts('settings.spatialPinOptionalChrome')}
      </p>

      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.spatialPinStatus')}</span>
        <span>
          {bridge?.connected
            ? ts('settings.spatialPinConnected')
            : ts('settings.spatialPinDisconnected')}
          {bridge?.port ? ` · :${bridge.port}` : ''}
          {session?.webEnhanceAvailable
            ? ` · ${ts('settings.spatialPinEnhanceOn')}`
            : ''}
        </span>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.spatialPinPort')}</span>
        <code>{bridge?.port ?? '—'}</code>
        {bridge?.port ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void copy('port', String(bridge.port))}
          >
            {copied === 'port' ? ts('settings.spatialPinCopied') : ts('settings.spatialPinCopy')}
          </Button>
        ) : null}
      </label>
      <label className={styles.field}>
        <span className={styles.label}>{ts('settings.spatialPinToken')}</span>
        <code style={{ wordBreak: 'break-all' }}>{bridge?.token ?? '—'}</code>
        {bridge?.token ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void copy('token', bridge.token!)}
          >
            {copied === 'token' ? ts('settings.spatialPinCopied') : ts('settings.spatialPinCopy')}
          </Button>
        ) : null}
      </label>
      <p className={styles.hubIntro}>{ts('settings.spatialPinExtensionHint')}</p>
    </section>
  )
}
