import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ArrowLeft, Camera, ChevronDown, Layers } from 'lucide-react'
import type { SpatialPinMode } from '@contracts/spatial-pin'
import type {
  SpatialCaptureFolder,
  SpatialCaptureSessionHead,
} from '@contracts/spatial-capture-session'
import { partitionSpatialCaptures } from '@contracts/spatial-capture-session'
import { useI18n } from '../../i18n'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useSpatialCaptureStore } from '../../state/spatialCaptureStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import EmptyState from '../ui/EmptyState'
import CaptureCardContextMenu, {
  type CaptureCardContextMenuState,
} from './CaptureCardContextMenu'
import {
  loadCaptureActivities,
  type CaptureActivity,
  type CapturePresence,
  type CaptureSessionLink,
} from './captureSessionActivity'
import { useCaptureFolderDnD } from './CaptureFolderDnDContext'
import dndStyles from './CaptureFolderDnD.module.css'
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

function FolderStackCard({
  folder,
  members,
  thumbs,
  versionsLabel,
  dropActive,
  lifting,
  onOpen,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  consumeClickSuppression,
}: {
  folder: SpatialCaptureFolder
  members: SpatialCaptureSessionHead[]
  thumbs: Record<string, string>
  versionsLabel: string
  dropActive: boolean
  lifting: boolean
  onOpen: () => void
  onContextMenu: (event: ReactMouseEvent) => void
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
  consumeClickSuppression: () => boolean
}) {
  const preview = members.slice(0, 3)
  return (
    <div
      className={`${styles.cardSlot} ${dropActive ? dndStyles.dropActiveStrong : ''} ${lifting ? styles.lifting : ''}`}
      data-capture-drop="folder"
      data-folder-id={folder.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onContextMenu}
    >
      <div className={styles.card}>
        <button
          type="button"
          className={styles.stackWrap}
          onClick={() => {
            if (consumeClickSuppression()) return
            onOpen()
          }}
          aria-label={folder.name}
        >
          {preview.map((member, index) => (
            <span
              key={member.id}
              className={styles.stackLayer}
              style={{
                zIndex: preview.length - index,
                transform: `translate(${index * 6}px, ${index * 5}px) rotate(${index * 1.5}deg)`,
                backgroundImage: thumbs[member.id]
                  ? `url(${thumbs[member.id]})`
                  : undefined,
              }}
            />
          ))}
          <span className={styles.stackBadge}>
            <Layers size={12} aria-hidden />
            {members.length}
          </span>
        </button>
        <div className={styles.meta}>
          <div className={styles.cardTitle}>{folder.name}</div>
          <div className={styles.cardSub}>
            <span>{versionsLabel}</span>
            <span>{members[0]?.title}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SpatialCapturesPanel() {
  const { ts, locale } = useI18n()
  const projectId = useWorkbenchStore((s) => s.project?.projectId)
  const client = useWorkbenchStore((s) => s.client)
  const heads = useSpatialCaptureStore((s) => s.heads)
  const folders = useSpatialCaptureStore((s) => s.folders)
  const loading = useSpatialCaptureStore((s) => s.loading)
  const error = useSpatialCaptureStore((s) => s.error)
  const loadHeads = useSpatialCaptureStore((s) => s.loadHeads)
  const openSession = useSpatialCaptureStore((s) => s.openSession)
  const deleteSession = useSpatialCaptureStore((s) => s.deleteSession)
  const deleteFolder = useSpatialCaptureStore((s) => s.deleteFolder)
  const drillFolderId = useSpatialCaptureStore((s) => s.drillFolderId)
  const setDrillFolderId = useSpatialCaptureStore((s) => s.setDrillFolderId)
  const {
    drag,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    consumeClickSuppression,
    isDropActive,
  } = useCaptureFolderDnD()
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [cardMenu, setCardMenu] = useState<CaptureCardContextMenuState | null>(null)
  const [activities, setActivities] = useState<Record<string, CaptureActivity>>({})
  const [openCaptureId, setOpenCaptureId] = useState<string | null>(null)
  const [drawerCaptureId, setDrawerCaptureId] = useState<string | null>(null)
  const [drawerExpanded, setDrawerExpanded] = useState(false)
  const activeChatId = useChatSessionStore((s) => s.activeSessionId)
  const switchSession = useChatSessionStore((s) => s.switchSession)
  const setRightPanelOpen = useWorkbenchStore((s) => s.setRightPanelOpen)
  const setRightPanelTab = useWorkbenchStore((s) => s.setRightPanelTab)
  const centerTab = useWorkbenchStore((s) => s.centerTab)

  const partitioned = useMemo(
    () => partitionSpatialCaptures(heads, folders),
    [heads, folders],
  )

  const drillFolder = folders.find((folder) => folder.id === drillFolderId) ?? null
  const drillMembers = useMemo(() => {
    if (!drillFolder) return [] as SpatialCaptureSessionHead[]
    const byId = new Map(heads.map((head) => [head.id, head]))
    return drillFolder.memberSessionIds
      .map((id) => byId.get(id))
      .filter((head): head is SpatialCaptureSessionHead => Boolean(head))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [drillFolder, heads])

  useEffect(() => {
    void loadHeads()
  }, [loadHeads, projectId])

  useEffect(() => {
    if (centerTab === 'spatial-captures') {
      void loadHeads()
    }
  }, [centerTab, loadHeads])

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

  function openFolderCardMenu(event: ReactMouseEvent, folderId: string) {
    event.preventDefault()
    event.stopPropagation()
    setCardMenu({
      kind: 'folder',
      folderId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function openWorkspaceCardMenu(event: ReactMouseEvent, sessionId: string) {
    event.preventDefault()
    event.stopPropagation()
    setCardMenu({
      kind: 'workspace',
      sessionId,
      x: event.clientX,
      y: event.clientY,
    })
  }

  function dissolveFolder(folderId: string) {
    void deleteFolder(folderId, { cascade: false }).then((result) => {
      setActionError(
        result.ok ? null : (result.error ?? ts('spatialCaptures.loadError')),
      )
    })
  }

  function cascadeDeleteFolder(folderId: string) {
    if (!window.confirm(ts('spatialCaptures.deleteFolderConfirm'))) {
      return
    }
    void deleteFolder(folderId, { cascade: true }).then((result) => {
      setActionError(
        result.ok ? null : (result.error ?? ts('spatialCaptures.deleteBlocked')),
      )
    })
  }

  function removeWorkspace(sessionId: string) {
    void (async () => {
      const result = await deleteSession(sessionId)
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
  }

  function renderWorkspaceCard(head: SpatialCaptureSessionHead) {
    const activity = activities[head.id]
    const hasSessions = (activity?.sessions.length ?? 0) > 0
    const drawerOpen = openCaptureId === head.id && hasSessions
    const drawerMounted = drawerCaptureId === head.id && hasSessions
    const running = activity?.sessions.filter((link) => link.presence === 'working') ?? []
    const resting = activity?.sessions.filter((link) => link.presence !== 'working') ?? []
    const lifting = drag?.sessionId === head.id
    return (
      <div
        key={head.id}
        className={`${styles.cardSlot} ${drawerMounted ? styles.cardSlotOpen : ''} ${lifting ? styles.lifting : ''}`}
        onPointerDown={(event) =>
          onPointerDown(event, {
            sessionId: head.id,
            folderId: drillFolderId,
            title: head.title?.trim() || ts('spatialCaptures.sessionUntitled'),
            source: 'drill',
          })
        }
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(event) => openWorkspaceCardMenu(event, head.id)}
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
              onClick={() => {
                if (consumeClickSuppression()) return
                void openSession(head.id)
              }}
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
        </div>
        {hasSessions ? (
          <button
            type="button"
            className={`${styles.pullTab} ${drawerOpen ? styles.pullTabOpen : ''}`}
            aria-expanded={drawerOpen}
            aria-controls={drawerOpen ? `capture-sessions-${head.id}` : undefined}
            aria-label={ts('spatialCaptures.activityToggle', {
              title: head.title ?? head.id,
            })}
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
            aria-label={ts('spatialCaptures.activityToggle', {
              title: head.title ?? head.id,
            })}
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
  }

  const galleryEmpty =
    !loading && partitioned.folders.length === 0 && !drillFolder
  const emptyDropActive = isDropActive('workspace-empty')
  const drillDropActive = Boolean(
    drillFolder && isDropActive('drill-folder', drillFolder.id),
  )

  return (
    <div
      className={`${styles.panel} ${emptyDropActive || drillDropActive ? dndStyles.dropActive : ''}`}
      data-tour="spatial-captures"
      {...(drillFolder
        ? {
            'data-capture-drop': 'drill-folder' as const,
            'data-folder-id': drillFolder.id,
          }
        : { 'data-capture-drop': 'workspace-empty' as const })}
    >
      <div className={styles.header}>
        {drillFolder ? (
          <button
            type="button"
            className={styles.backBtn}
            data-capture-drag-ignore=""
            onClick={() => setDrillFolderId(null)}
          >
            <ArrowLeft size={14} aria-hidden />
            <span>{ts('spatialCaptures.backToFolders')}</span>
          </button>
        ) : null}
        <h2 className={styles.title}>
          {drillFolder ? drillFolder.name : ts('spatialCaptures.title')}
        </h2>
      </div>

      {(error || actionError) && (
        <p className={styles.error}>{actionError ?? error}</p>
      )}

      {galleryEmpty ? (
        <div
          className={`${styles.emptyDrop} ${emptyDropActive ? dndStyles.dropActiveStrong : ''}`}
        >
          <EmptyState
            icon={<Camera size={16} />}
            title={ts('spatialCaptures.emptyTitle')}
            description={ts('spatialCaptures.emptyDesc')}
          />
          <p className={styles.dragHint}>{ts('spatialCaptures.dragEmptyHint')}</p>
        </div>
      ) : drillFolder ? (
        <div className={`${styles.grid} ${openCaptureId ? styles.gridOpen : ''}`}>
          {drillMembers.map((head) => renderWorkspaceCard(head))}
        </div>
      ) : (
        <div className={styles.grid}>
          {partitioned.folders.map((folder) => {
            const members = folder.memberSessionIds
              .map((id) => heads.find((head) => head.id === id))
              .filter((head): head is SpatialCaptureSessionHead => Boolean(head))
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            return (
              <FolderStackCard
                key={folder.id}
                folder={folder}
                members={members}
                thumbs={thumbs}
                versionsLabel={ts('spatialCaptures.versions').replace(
                  '{count}',
                  String(members.length),
                )}
                dropActive={isDropActive('folder', folder.id)}
                lifting={drag?.folderId === folder.id && drag.source === 'folder'}
                onOpen={() => setDrillFolderId(folder.id)}
                onContextMenu={(event) => openFolderCardMenu(event, folder.id)}
                onPointerDown={(event) =>
                  onPointerDown(event, {
                    folderId: folder.id,
                    title: folder.name,
                    source: 'folder',
                  })
                }
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                consumeClickSuppression={consumeClickSuppression}
              />
            )
          })}
        </div>
      )}

      <CaptureCardContextMenu
        menu={cardMenu}
        onClose={() => setCardMenu(null)}
        onOpen={() => {
          if (!cardMenu) return
          if (cardMenu.kind === 'folder') {
            setDrillFolderId(cardMenu.folderId)
            return
          }
          void openSession(cardMenu.sessionId)
        }}
        onDissolve={
          cardMenu?.kind === 'folder'
            ? () => dissolveFolder(cardMenu.folderId)
            : undefined
        }
        onDelete={() => {
          if (!cardMenu) return
          if (cardMenu.kind === 'folder') {
            cascadeDeleteFolder(cardMenu.folderId)
            return
          }
          removeWorkspace(cardMenu.sessionId)
        }}
      />
    </div>
  )
}
