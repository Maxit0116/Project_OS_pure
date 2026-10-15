import { useEffect, useMemo, useRef, useState, type ReactNode, type WheelEvent } from 'react'
import type { ChatSessionHead, SessionGraphModel } from '@contracts/index'
import {
  SESSION_GRAPH_GAP_PX,
  buildSessionGraph,
  sessionGraphShieldInsets,
  type SessionGraphInsets,
} from '@contracts/index'
import { Archive, GitBranch, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import {
  SESSION_NODE_HEIGHT,
  SESSION_NODE_WIDTH,
  layoutSessionGraph,
  type SessionGraphLayout,
} from './layoutSessionGraph'
import styles from './SessionGraphOverlay.module.css'

const STATUS_CLASS = {
  idle: '',
  running: styles.statusDotRunning,
  awaiting_review: styles.statusDotReview,
  error: styles.statusDotError,
} as const

export function SessionGraphFrame({
  shield,
  resizing,
  label,
  children,
}: {
  shield: SessionGraphInsets
  resizing: boolean
  label: string
  children: ReactNode
}) {
  return (
    <div
      className={`${styles.shield} ${resizing ? styles.shieldResizing : ''}`}
      style={{ top: shield.top, right: shield.right, bottom: shield.bottom, left: shield.left }}
      data-session-graph-shield
    >
      <section
        className={styles.card}
        style={{
          top: SESSION_GRAPH_GAP_PX,
          right: SESSION_GRAPH_GAP_PX,
          bottom: SESSION_GRAPH_GAP_PX,
          left: SESSION_GRAPH_GAP_PX,
        }}
        role="region"
        aria-label={label}
        data-session-graph-card
      >
        {children}
      </section>
    </div>
  )
}

export default function SessionGraphOverlay() {
  const open = useChatSessionStore((s) => s.sessionGraphOpen)
  const heads = useChatSessionStore((s) => s.heads)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const setSessionGraphOpen = useChatSessionStore((s) => s.setSessionGraphOpen)
  const switchSession = useChatSessionStore((s) => s.switchSession)
  const forkSession = useChatSessionStore((s) => s.forkSession)
  const setSessionClassification = useChatSessionStore((s) => s.setSessionClassification)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const leftPanelWidth = useWorkbenchStore((s) => s.leftPanelWidth)
  const rightPanelWidth = useWorkbenchStore((s) => s.rightPanelWidth)
  const terminalHeight = useWorkbenchStore((s) => s.terminalHeight)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const { ts } = useI18n()

  const model = useMemo(() => buildSessionGraph(heads), [heads])
  const [layout, setLayout] = useState<SessionGraphLayout | null>(null)
  const [viewport, setViewport] = useState({ x: 32, y: 32, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSessionGraphOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setSessionGraphOpen])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    void layoutSessionGraph(model).then((next) => {
      if (!cancelled) setLayout(next)
    })
    return () => {
      cancelled = true
    }
  }, [open, model])

  if (!open) return null

  const shield = sessionGraphShieldInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
    leftWidth: leftPanelWidth,
    rightWidth: rightPanelWidth,
    terminalHeight,
  })

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = Math.min(1.8, Math.max(0.45, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)))
    setViewport((current) => ({ ...current, scale: nextScale }))
  }

  return (
    <SessionGraphFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.sessionGraph.title')}
    >
        <header className={styles.header}>
          <h2 className={styles.title}>{ts('chat.sessionGraph.title')}</h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('chat.sessionGraph.close')}
            onClick={() => setSessionGraphOpen(false)}
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div
          className={`${styles.canvas} ${dragging ? styles.canvasDragging : ''}`}
          onWheel={onWheel}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('[data-session-node]')) return
            dragRef.current = {
              x: viewport.x,
              y: viewport.y,
              px: event.clientX,
              py: event.clientY,
            }
            setDragging(true)
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag) return
            setViewport((current) => ({
              ...current,
              x: drag.x + event.clientX - drag.px,
              y: drag.y + event.clientY - drag.py,
            }))
          }}
          onPointerUp={() => {
            dragRef.current = null
            setDragging(false)
          }}
        >
          {model.nodes.length === 0 ? (
            <p className={styles.empty}>{ts('chat.sessionGraph.empty')}</p>
          ) : layout ? (
            <div
              className={styles.world}
              style={{
                width: layout.width,
                height: layout.height,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              }}
            >
              <svg className={styles.edges} width={layout.width} height={layout.height}>
                {model.edges.map((edge) => {
                  const source = layout.positions[edge.source]
                  const target = layout.positions[edge.target]
                  if (!source || !target) return null
                  const x1 = source.x + SESSION_NODE_WIDTH / 2
                  const y1 = source.y + SESSION_NODE_HEIGHT
                  const x2 = target.x + SESSION_NODE_WIDTH / 2
                  const y2 = target.y
                  const mid = (y1 + y2) / 2
                  return (
                    <path
                      key={`${edge.source}-${edge.target}`}
                      className={styles.edge}
                      d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                    />
                  )
                })}
              </svg>
              {model.nodes.map((node) => {
                const position = layout.positions[node.id]
                if (!position) return null
                const head = heads.find((item) => item.id === node.id)
                return (
                  <SessionNode
                    key={node.id}
                    head={head}
                    title={node.title || ts('chat.history.untitled')}
                    responsibility={node.responsibility}
                    status={node.status}
                    active={node.id === activeSessionId}
                    x={position.x}
                    y={position.y}
                    onOpen={() => void switchSession(node.id)}
                    onBranch={() => void forkSession(node.id)}
                    onMisc={() => void setSessionClassification(node.id, 'misc')}
                  />
                )
              })}
            </div>
          ) : null}
        </div>
        <MiscTray
          items={model.misc}
          activeSessionId={activeSessionId}
          onOpen={(sessionId) => void switchSession(sessionId)}
          onPromote={(sessionId) => void setSessionClassification(sessionId, 'topic')}
        />
    </SessionGraphFrame>
  )
}

function SessionNode({
  head,
  title,
  responsibility,
  status,
  active,
  x,
  y,
  onOpen,
  onBranch,
  onMisc,
}: {
  head: ChatSessionHead | undefined
  title: string
  responsibility?: string
  status: SessionGraphModel['nodes'][number]['status']
  active: boolean
  x: number
  y: number
  onOpen: () => void
  onBranch: () => void
  onMisc: () => void
}) {
  const { ts } = useI18n()
  return (
    <div
      className={`${styles.node} ${active ? styles.nodeActive : ''}`}
      style={{ left: x, top: y, width: SESSION_NODE_WIDTH, height: SESSION_NODE_HEIGHT }}
      data-session-node={head?.id}
    >
      <button type="button" className={styles.nodeTitle} onClick={onOpen}>
        {title}
      </button>
      {responsibility ? <span className={styles.nodeResponsibility}>{responsibility}</span> : null}
      <div className={styles.nodeMeta}>
        <span className={styles.status}>
          <span className={`${styles.statusDot} ${STATUS_CLASS[status]}`} aria-hidden />
          {ts(`chat.sessionGraph.status.${status}`)}
        </span>
        <span className={styles.nodeActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={ts('chat.sessionGraph.branch')}
            title={ts('chat.sessionGraph.branch')}
            onClick={onBranch}
          >
            <GitBranch size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={ts('chat.sessionGraph.moveToMisc')}
            title={ts('chat.sessionGraph.moveToMisc')}
            onClick={onMisc}
          >
            <Archive size={14} aria-hidden />
          </button>
        </span>
      </div>
    </div>
  )
}

function MiscTray({
  items,
  activeSessionId,
  onOpen,
  onPromote,
}: {
  items: ChatSessionHead[]
  activeSessionId: string | null
  onOpen: (sessionId: string) => void
  onPromote: (sessionId: string) => void
}) {
  const { ts } = useI18n()
  if (items.length === 0) return null
  return (
    <div className={styles.misc}>
      <span className={styles.miscLabel}>{ts('chat.sessionGraph.misc')}</span>
      <div className={styles.miscList}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`${styles.miscChip} ${item.id === activeSessionId ? styles.miscChipActive : ''}`}
          >
            <button type="button" className={styles.miscTitle} onClick={() => onOpen(item.id)}>
              {item.title.trim() || ts('chat.history.untitled')}
            </button>
            <button
              type="button"
              className={styles.miscButton}
              aria-label={ts('chat.sessionGraph.moveToGraph')}
              title={ts('chat.sessionGraph.moveToGraph')}
              onClick={() => onPromote(item.id)}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
