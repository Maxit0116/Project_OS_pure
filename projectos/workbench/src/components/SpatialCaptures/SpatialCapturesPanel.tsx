import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import EmptyState from '../ui/EmptyState'
import styles from './SpatialCapturesPanel.module.css'

function formatWhen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function SpatialCapturesPanel() {
  const { ts, locale } = useI18n()
  const projectId = useWorkbenchStore((s) => s.project?.projectId)
  const client = useWorkbenchStore((s) => s.client)
  const heads = useSpatialCaptureStore((s) => s.heads)
  const loading = useSpatialCaptureStore((s) => s.loading)
  const error = useSpatialCaptureStore((s) => s.error)
  const loadHeads = useSpatialCaptureStore((s) => s.loadHeads)
  const openSession = useSpatialCaptureStore((s) => s.openSession)
  const deleteSession = useSpatialCaptureStore((s) => s.deleteSession)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)

  const centerTab = useWorkbenchStore((s) => s.centerTab)

  useEffect(() => {
    void loadHeads()
  }, [loadHeads, projectId])

  // Reload whenever user lands on this tab (covers Esc→switch tab without IPC).
  useEffect(() => {
    if (centerTab === 'spatial-captures') {
      void loadHeads()
    }
  }, [centerTab, loadHeads])

  // Overlay Esc solidify → main broadcasts; refresh gallery immediately.
  useEffect(() => {
    const bridge = window.projectOS?.spatialPin
    if (!bridge?.onSessionSolidified) return
    const disposable = bridge.onSessionSolidified(() => {
      void loadHeads()
    })
    return () => disposable.dispose()
  }, [loadHeads])

  useEffect(() => {
    if (!client || !projectId) return
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      for (const head of heads) {
        if (!head.thumbnailAssetPath) continue
        try {
          const asset = await client.readProjectAssetBase64(
            projectId,
            head.thumbnailAssetPath,
          )
          if (asset && !cancelled) {
            next[head.id] = `data:${asset.mimeType};base64,${asset.base64}`
          }
        } catch {
          /* skip broken thumbs */
        }
      }
      if (!cancelled) setThumbs(next)
    })()
    return () => {
      cancelled = true
    }
  }, [client, projectId, heads])

  return (
    <div className={styles.panel} data-tour="spatial-captures">
      <div className={styles.header}>
        <h2 className={styles.title}>{ts('spatialCaptures.title')}</h2>
      </div>

      {(error || actionError) && (
        <p className={styles.error}>{actionError ?? error}</p>
      )}

      {!loading && heads.length === 0 ? (
        <EmptyState
          icon={<Camera size={16} />}
          title={ts('spatialCaptures.emptyTitle')}
          description={ts('spatialCaptures.emptyDesc')}
        />
      ) : (
        <div className={styles.grid}>
          {heads.map((head) => (
            <div key={head.id} className={styles.card}>
              <button
                type="button"
                className={styles.thumb}
                style={
                  thumbs[head.id]
                    ? { backgroundImage: `url(${thumbs[head.id]})` }
                    : undefined
                }
                aria-label={head.title}
                onClick={() => void openSession(head.id)}
              />
              <div className={styles.meta}>
                <div className={styles.cardTitle}>{head.title}</div>
                <div className={styles.cardSub}>
                  <span>{formatWhen(head.updatedAt, locale)}</span>
                  <span>
                    {ts('spatialCaptures.regions').replace(
                      '{count}',
                      String(head.regionCount),
                    )}
                  </span>
                  {head.runningCount > 0 ? (
                    <span className={styles.badge}>
                      {ts('spatialCaptures.running').replace(
                        '{count}',
                        String(head.runningCount),
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => void openSession(head.id)}
                >
                  {ts('spatialCaptures.open')}
                </button>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.actionDanger}`}
                  onClick={() => {
                    void (async () => {
                      const result = await deleteSession(head.id)
                      if (!result.ok) {
                        setActionError(
                          result.error?.includes('in progress')
                            ? ts('spatialCaptures.deleteBlocked')
                            : (result.error ?? ts('spatialCaptures.deleteBlocked')),
                        )
                      } else {
                        setActionError(null)
                      }
                    })()
                  }}
                >
                  {ts('spatialCaptures.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
