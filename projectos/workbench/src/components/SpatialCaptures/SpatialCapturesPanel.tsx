import { useEffect, useState } from 'react'
import { Camera, ChevronDown } from 'lucide-react'
import type { SpatialPinMode } from '@contracts/spatial-pin'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import EmptyState from '../ui/EmptyState'
import {
  loadCaptureActivities,
  type CaptureActivity,
  type CapturePresence,
  type CaptureSessionLink,
} from './captureSessionActivity'
import styles from './SpatialCapturesPanel.module.css'

const ACTIVITY_POLL_MS = 4000
const DRAWER_MS = 180

function SessionGroup({
  label,
  links,
  activeChatId,
  untitled,
  modeLabel,
  presenceLabel,
  locale,
  onOpen,
}: {
  label: string
  links: CaptureSessionLink[]
  activeChatId: string | null
  untitled: string
  modeLabel: (mode: SpatialPinMode) => string
  presenceLabel: (presence: CapturePresence) => string
  locale: string
  onOpen: (sessionId: string) => void
}) {
  return (
    <div className={styles.sessionGroup}>
      <div className={styles.sessionGroupLabel}>{label}</div>
      {links.map((link) => (
        <SessionRow
          key={link.key}
          link={link}
          active={link.chatSessionId === activeChatId}
          title={link.title.trim() || untitled}
          mode={modeLabel(link.mode)}
          when={formatWhen(link.updatedAt, locale)}
          state={presenceLabel(link.presence)}
          onOpen={() => {
            if (link.chatSessionId) onOpen(link.chatSessionId)
          }}
        />
      ))}
    </div>
  )
}

function SessionRow({
  link,
  active,
  title,
  mode,
  when,
  state,
  onOpen,
}: {
  link: CaptureSessionLink
  active: boolean
  title: string
  mode: string
  when: string
  state: string
  onOpen: () => void
}) {
  const stateClass =
    link.presence === 'working'
      ? styles.sessionStateWorking
      : link.presence === 'needs_you'
        ? styles.sessionStateNeeds
        : ''
  return (
    <button
      type="button"
      className={`${styles.sessionBtn} ${active ? styles.sessionBtnActive : ''}`}
      disabled={!link.chatSessionId}
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
    >
      <span className={styles.sessionTitle}>{title}</span>
      <span className={styles.sessionMeta}>
        <span>{mode}</span>
        <span>{when}</span>
      </span>
      <span className={`${styles.sessionState} ${stateClass}`}>{state}</span>
    </button>
  )
}

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
  const [activities, setActivities] = useState<Record<string, CaptureActivity>>({})
  const [openCaptureId, setOpenCaptureId] = useState<string | null>(null)
  const [drawerCaptureId, setDrawerCaptureId] = useState<string | null>(null)
  const [drawerExpanded, setDrawerExpanded] = useState(false)
  const activeChatId = useChatSessionStore((s) => s.activeSessionId)
  const switchSession = useChatSessionStore((s) => s.switchSession)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const setRightPanelTab = useWorkbenchStore((s) => s.setRightPanelTab)

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
    if (centerTab !== 'spatial-captures' || !client || !projectId) return
    let cancelled = false
    const pull = () => {
      const ids = useSpatialCaptureStore.getState().heads.map((head) => head.id)
      void loadCaptureActivities(client, projectId, ids).then((next) => {
        if (cancelled) return
        setActivities(next)
        setOpenCaptureId((current) =>
          current && (next[current]?.sessions.length ?? 0) === 0 ? null : current,
        )
      })
    }
    pull()
    const timer = window.setInterval(pull, ACTIVITY_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [centerTab, client, projectId, heads])

  useEffect(() => {
    if (openCaptureId) {
      setDrawerCaptureId(openCaptureId)
      let inner = 0
      const outer = window.requestAnimationFrame(() => {
        inner = window.requestAnimationFrame(() => setDrawerExpanded(true))
      })
      return () => {
        window.cancelAnimationFrame(outer)
        window.cancelAnimationFrame(inner)
      }
    }
    setDrawerExpanded(false)
    const timer = window.setTimeout(() => setDrawerCaptureId(null), DRAWER_MS)
    return () => window.clearTimeout(timer)
  }, [openCaptureId])

  useEffect(() => {
    if (!openCaptureId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenCaptureId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCaptureId])

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

  function presenceLabel(presence: CapturePresence): string {
    if (presence === 'working') return ts('spatialCaptures.sessionWorking')
    if (presence === 'needs_you') return ts('spatialCaptures.sessionNeedsYou')
    return ts('spatialCaptures.sessionIdle')
  }

  function modeLabel(mode: SpatialPinMode): string {
    return ts(`chat.${mode}Mode`)
  }

  async function openChatSession(sessionId: string) {
    setRightPanelTab('chat')
    setRightPanelOpen(true)
    await switchSession(sessionId)
  }

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
        <div className={`${styles.grid} ${openCaptureId ? styles.gridOpen : ''}`}>
          {heads.map((head) => {
            const activity = activities[head.id]
            const hasSessions = (activity?.sessions.length ?? 0) > 0
            const drawerOpen = openCaptureId === head.id && hasSessions
            const drawerMounted = drawerCaptureId === head.id && hasSessions
            const running = activity?.sessions.filter((link) => link.presence === 'working') ?? []
            const resting = activity?.sessions.filter((link) => link.presence !== 'working') ?? []
            return (
            <div
              key={head.id}
              className={`${styles.cardSlot} ${drawerMounted ? styles.cardSlotOpen : ''}`}
            >
            <div className={styles.card}>
              <div className={styles.thumbWrap}>
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
                {activity && activity.workingCount > 0 ? (
                  <span
                    className={styles.workingBadge}
                    aria-label={ts('spatialCaptures.activityWorkingAgents', {
                      count: activity.workingCount,
                    })}
                  >
                    <span className={styles.statusDot} aria-hidden />
                    <span>{ts('spatialCaptures.activityWorking')}</span>
                    <span className={styles.workingCount}>{activity.workingCount}</span>
                  </span>
                ) : null}
              </div>
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
            {hasSessions ? (
              <button
                type="button"
                className={`${styles.pullTab} ${drawerOpen ? styles.pullTabOpen : ''}`}
                aria-expanded={drawerOpen}
                aria-controls={drawerOpen ? `capture-sessions-${head.id}` : undefined}
                aria-label={ts('spatialCaptures.activityToggle', { title: head.title })}
                onClick={() =>
                  setOpenCaptureId((current) => (current === head.id ? null : head.id))
                }
              >
                <ChevronDown size={14} aria-hidden />
              </button>
            ) : null}
            {drawerMounted && activity ? (
              <div
                id={`capture-sessions-${head.id}`}
                className={`${styles.drawer} ${drawerOpen && drawerExpanded ? styles.drawerOpen : ''}`}
                role="region"
                aria-label={ts('spatialCaptures.activityToggle', { title: head.title })}
              >
              <div className={styles.drawerInner}>
                {running.length > 0 ? (
                  <SessionGroup
                    label={ts('spatialCaptures.drawerRunning')}
                    links={running}
                    activeChatId={activeChatId}
                    untitled={ts('spatialCaptures.sessionUntitled')}
                    modeLabel={modeLabel}
                    presenceLabel={presenceLabel}
                    locale={locale}
                    onOpen={(sessionId) => void openChatSession(sessionId)}
                  />
                ) : null}
                {resting.length > 0 ? (
                  <SessionGroup
                    label={ts('spatialCaptures.drawerIdle')}
                    links={resting}
                    activeChatId={activeChatId}
                    untitled={ts('spatialCaptures.sessionUntitled')}
                    modeLabel={modeLabel}
                    presenceLabel={presenceLabel}
                    locale={locale}
                    onOpen={(sessionId) => void openChatSession(sessionId)}
                  />
                ) : null}
              </div>
              </div>
            ) : null}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
