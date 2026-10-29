import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from 'react'
import {
  Boxes,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  sessionGraphShieldCssInsets,
  type GithubGraphNode,
} from '@contracts/index'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useI18n } from '../../i18n'
import {
  buildGithubGraphModel,
  GITHUB_NODE_HEIGHT,
  GITHUB_NODE_WIDTH,
  layoutGithubGraphTree,
} from './buildGithubGraphModel'
import styles from './GithubGraphOverlay.module.css'

function kindLabel(
  kind: GithubGraphNode['kind'],
  ts: (path: string) => string,
): string {
  switch (kind) {
    case 'default':
      return ts('chat.githubGraph.kindDefault')
    case 'branch':
      return ts('chat.githubGraph.kindBranch')
    case 'pr':
      return ts('chat.githubGraph.kindPr')
    case 'worktree':
      return ts('chat.githubGraph.kindWorktree')
  }
}

function KindIcon({ kind }: { kind: GithubGraphNode['kind'] }) {
  if (kind === 'pr') return <GitPullRequest size={12} strokeWidth={2} aria-hidden />
  if (kind === 'worktree') return <Boxes size={12} strokeWidth={2} aria-hidden />
  return <GitBranch size={12} strokeWidth={2} aria-hidden />
}

export default function GithubGraphOverlay() {
  const open = useChatSessionStore((s) => s.githubGraphOpen)
  const setGithubGraphOpen = useChatSessionStore((s) => s.setGithubGraphOpen)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const { ts } = useI18n()

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newBranchName, setNewBranchName] = useState('')
  const [viewport, setViewport] = useState({ x: 32, y: 32, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  )
  const [modelInput, setModelInput] = useState<{
    repoLabel: string
    defaultBranch: string | null
    currentBranch: string | null
    remoteUrl?: string
    dirty: boolean
    branches: Array<{
      id: string
      name: string
      current: boolean
      remote: boolean
      ahead?: number
      behind?: number
    }>
    pullRequests: Array<{
      number: number
      title: string
      url: string
      headRef: string
      baseRef: string
      state: 'open' | 'closed' | 'merged'
    }>
    worktrees: Array<{ id: string; branch?: string | null }>
  } | null>(null)

  const reload = useCallback(async () => {
    if (!client || !project) {
      setModelInput(null)
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const [status, branches, prs, worktrees] = await Promise.all([
        client.getWorkspaceGitStatus(project.projectId),
        client.listWorkspaceGitBranches(project.projectId),
        client.listWorkspacePullRequests(project.projectId).catch(() => ({
          available: false,
          pullRequests: [],
        })),
        client.listAgentWorktrees(project.projectId).catch(() => []),
      ])
      setModelInput({
        repoLabel: project.displayName || project.projectId,
        defaultBranch: branches.defaultBranch ?? status.defaultBranch ?? null,
        currentBranch: branches.currentBranch ?? status.branch,
        ...(status.remoteUrl ? { remoteUrl: status.remoteUrl } : {}),
        dirty: status.dirty,
        branches: branches.branches,
        pullRequests: prs.pullRequests.map((pr) => ({
          ...pr,
          state: 'open' as const,
        })),
        worktrees: worktrees.map((wt) => ({
          id: wt.id,
          branch: wt.branch,
        })),
      })
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : ts('chat.githubGraph.empty'),
      )
      setModelInput(null)
    } finally {
      setLoading(false)
    }
  }, [client, project, ts])

  useEffect(() => {
    if (!open) return
    void reload()
  }, [open, reload])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGithubGraphOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setGithubGraphOpen])

  const model = useMemo(
    () => (modelInput ? buildGithubGraphModel(modelInput) : null),
    [modelInput],
  )
  const layout = useMemo(
    () => (model ? layoutGithubGraphTree(model) : null),
    [model],
  )
  const selected = useMemo(
    () => model?.nodes.find((node) => node.id === selectedId) ?? null,
    [model, selectedId],
  )
  const posById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const item of layout?.nodes ?? []) {
      map.set(item.node.id, { x: item.x, y: item.y })
    }
    return map
  }, [layout])

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = Math.min(
      1.8,
      Math.max(0.45, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)),
    )
    setViewport((current) => ({ ...current, scale: nextScale }))
  }

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  async function checkoutSelected(node: GithubGraphNode) {
    if (!client || !project) return
    if (node.kind !== 'branch' && node.kind !== 'default') return
    if (model?.dirty) {
      setMessage(ts('chat.githubGraph.dirtyBlocked'))
      return
    }
    const result = await client.checkoutWorkspaceBranch(
      project.projectId,
      node.name,
    )
    setMessage(result.message)
    if (result.ok) await reload()
  }

  async function branchFromSelected(node: GithubGraphNode) {
    if (!client || !project || !newBranchName.trim()) return
    const result = await client.createWorkspaceBranch(project.projectId, {
      name: newBranchName.trim(),
      from: node.name,
      checkout: true,
    })
    setMessage(result.message)
    if (result.ok) {
      setNewBranchName('')
      await reload()
    }
  }

  async function createPr(node: GithubGraphNode) {
    if (!client || !project) return
    if (node.kind !== 'branch' && node.kind !== 'default') return
    const base = model?.defaultBranch ?? 'main'
    const title = `Update ${node.name}`
    const result = await client.createWorkspacePullRequest(project.projectId, {
      title,
      head: node.name,
      base,
    })
    if (!result.ok) {
      const remote = model?.remoteUrl
        ?.replace(/^git@github\.com:/i, 'https://github.com/')
        .replace(/\.git$/i, '')
      if (remote) {
        const compare = `${remote}/compare/${base}...${node.name}`
        void window.projectOS?.shell.openExternal(compare)
        setMessage(result.message || ts('chat.githubGraph.openCompare'))
        return
      }
      setMessage(result.message)
      return
    }
    setMessage(result.message)
    if (result.url) void window.projectOS?.shell.openExternal(result.url)
    await reload()
  }

  function openRemote() {
    const remote = model?.remoteUrl
      ?.replace(/^git@github\.com:/i, 'https://github.com/')
      .replace(/\.git$/i, '')
    if (remote) void window.projectOS?.shell.openExternal(remote)
  }

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.githubGraph.title')}
    >
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.titleBlock}>
              <h2 className={styles.title}>{ts('chat.githubGraph.title')}</h2>
              <div className={styles.subtitle}>
                {model
                  ? `${model.repoLabel}${model.currentBranch ? ` · ${model.currentBranch}` : ''}`
                  : project?.displayName || project?.projectId || '—'}
              </div>
            </div>
            {model ? (
              <div className={styles.statusRow}>
                {model.currentBranch ? (
                  <span className={`${styles.chip} ${styles.chipCurrent}`}>
                    <GitBranch size={10} strokeWidth={2} aria-hidden />
                    {model.currentBranch}
                  </span>
                ) : null}
                <span
                  className={`${styles.chip}${model.dirty ? ` ${styles.chipDirty}` : ` ${styles.chipClean}`}`}
                >
                  {model.dirty
                    ? ts('chat.githubGraph.statusDirty')
                    : ts('chat.githubGraph.statusClean')}
                </span>
              </div>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.actionButton}
              disabled={!client || !project || loading}
              onClick={() =>
                void client
                  ?.fetchWorkspaceGit(project!.projectId)
                  .then((result) => {
                    setMessage(result.message)
                    return reload()
                  })
              }
            >
              {ts('chat.githubGraph.fetch')}
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={ts('chat.githubGraph.refresh')}
              title={ts('chat.githubGraph.refresh')}
              disabled={!client || !project || loading}
              onClick={() => void reload()}
            >
              <RefreshCw size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={ts('chat.githubGraph.openRemote')}
              title={ts('chat.githubGraph.openRemote')}
              onClick={openRemote}
            >
              <ExternalLink size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.closeButton}
              aria-label={ts('chat.githubGraph.close')}
              onClick={() => setGithubGraphOpen(false)}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        {model?.dirty ? (
          <div className={styles.banner}>{ts('chat.githubGraph.dirtyBlocked')}</div>
        ) : null}
        {message ? <div className={styles.messageBanner}>{message}</div> : null}

        <div className={styles.body}>
          <div
            className={`${styles.canvas}${dragging ? ` ${styles.canvasDragging}` : ''}`}
            onWheel={onWheel}
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest('[data-github-node]')) {
                return
              }
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
            {loading ? (
              <p className={styles.empty}>{ts('chat.githubGraph.loading')}</p>
            ) : !layout || layout.nodes.length === 0 ? (
              <p className={styles.empty}>{ts('chat.githubGraph.empty')}</p>
            ) : (
              <div
                className={styles.world}
                style={{
                  width: layout.width,
                  height: layout.height,
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                }}
              >
                <svg
                  className={styles.edges}
                  width={layout.width}
                  height={layout.height}
                  aria-hidden
                >
                  {model?.nodes.map((node) => {
                    if (!node.parentId) return null
                    const from = posById.get(node.parentId)
                    const to = posById.get(node.id)
                    if (!from || !to) return null
                    const x1 = from.x + GITHUB_NODE_WIDTH / 2
                    const y1 = from.y + GITHUB_NODE_HEIGHT
                    const x2 = to.x + GITHUB_NODE_WIDTH / 2
                    const y2 = to.y
                    const mid = (y1 + y2) / 2
                    return (
                      <path
                        key={`e-${node.id}`}
                        className={styles.edge}
                        d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
                      />
                    )
                  })}
                </svg>
                {layout.nodes.map((item) => {
                  const node = item.node
                  const selectedNode = selectedId === node.id
                  return (
                    <button
                      key={node.id}
                      type="button"
                      data-github-node=""
                      data-kind={node.kind}
                      className={`${styles.node}${selectedNode ? ` ${styles.nodeSelected}` : ''}${node.current ? ` ${styles.nodeCurrent}` : ''}`}
                      style={{ left: item.x, top: item.y }}
                      onClick={() => setSelectedId(node.id)}
                      onDoubleClick={() => void checkoutSelected(node)}
                    >
                      <div className={styles.nodeTop}>
                        <span className={styles.kindMark}>
                          <KindIcon kind={node.kind} />
                        </span>
                        <span className={styles.nodeTitle}>{node.name}</span>
                      </div>
                      <div className={styles.nodeMeta}>
                        <span className={styles.metaBadge}>
                          {kindLabel(node.kind, ts)}
                        </span>
                        {node.current ? (
                          <span className={styles.metaBadge}>
                            {ts('chat.githubGraph.badgeCurrent')}
                          </span>
                        ) : null}
                        {node.ahead !== undefined || node.behind !== undefined ? (
                          <span className={styles.metaBadge}>
                            ↑{node.ahead ?? 0} ↓{node.behind ?? 0}
                          </span>
                        ) : null}
                        {node.prNumber ? (
                          <span className={styles.metaBadge}>#{node.prNumber}</span>
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <aside className={styles.inspector}>
            {!selected ? (
              <p className={styles.inspectorEmpty}>
                {ts('chat.githubGraph.inspectorHint')}
              </p>
            ) : (
              <>
                <div className={styles.inspectorKind}>
                  <KindIcon kind={selected.kind} />
                  {kindLabel(selected.kind, ts)}
                </div>
                <h3 className={styles.inspectorTitle}>{selected.name}</h3>
                <div className={styles.inspectorSection}>
                  <div className={styles.inspectorLabel}>
                    {ts('chat.githubGraph.inspectorDetails')}
                  </div>
                  <div className={styles.inspectorMeta}>
                    {selected.current ? (
                      <span>{ts('chat.githubGraph.badgeCurrent')}</span>
                    ) : null}
                    {selected.ahead !== undefined ||
                    selected.behind !== undefined ? (
                      <span>
                        ↑{selected.ahead ?? 0} ↓{selected.behind ?? 0}
                      </span>
                    ) : null}
                    {selected.worktreeId ? (
                      <span>worktree · {selected.worktreeId}</span>
                    ) : null}
                    {selected.prUrl ? <span>{selected.prUrl}</span> : null}
                  </div>
                </div>
                <div className={styles.inspectorActions}>
                  {(selected.kind === 'branch' || selected.kind === 'default') && (
                    <>
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                        onClick={() => void checkoutSelected(selected)}
                      >
                        {ts('chat.githubGraph.checkout')}
                      </button>
                      <div className={styles.inspectorSection}>
                        <div className={styles.inspectorLabel}>
                          {ts('chat.githubGraph.branchFrom')}
                        </div>
                        <input
                          className={styles.input}
                          value={newBranchName}
                          placeholder="feat/…"
                          aria-label={ts('chat.githubGraph.branchFrom')}
                          onChange={(event) =>
                            setNewBranchName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              void branchFromSelected(selected)
                            }
                          }}
                        />
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => void branchFromSelected(selected)}
                        >
                          {ts('chat.githubGraph.branchFrom')}
                        </button>
                      </div>
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => void createPr(selected)}
                      >
                        {ts('chat.githubGraph.createPr')}
                      </button>
                    </>
                  )}
                  {selected.kind === 'pr' && selected.prUrl ? (
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() =>
                        void window.projectOS?.shell.openExternal(selected.prUrl!)
                      }
                    >
                      {ts('chat.githubGraph.openCompare')}
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </GraphOverlayFrame>
  )
}
