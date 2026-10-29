import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
} from 'react'
import {
  Boxes,
  ExternalLink,
  FolderTree,
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
  composeChildBranchName,
  GITHUB_NODE_HEIGHT,
  GITHUB_NODE_WIDTH,
  layoutGithubGraphTree,
  parentPathForNode,
  resolveCreateFromTip,
  type BuildGithubGraphBranch,
} from './buildGithubGraphModel'
import styles from './GithubGraphOverlay.module.css'

type GraphModelInput = {
  repoLabel: string
  defaultBranch: string | null
  currentBranch: string | null
  remoteUrl?: string
  dirty: boolean
  branches: BuildGithubGraphBranch[]
  pullRequests: Array<{
    number: number
    title: string
    url: string
    headRef: string
    baseRef: string
    state: 'open' | 'closed' | 'merged'
  }>
  worktrees: Array<{ id: string; branch?: string | null }>
  parentByBranchName: Record<string, string>
}

type NodeMotion = 'enter' | 'leave'

/** Floating UI anchored to a laid-out node (world coordinates). */
type NodePopup = {
  nodeId: string
  mode: 'menu' | 'create' | 'rename' | 'confirm-delete' | 'confirm-rollback'
}

function canMutateBranch(kind: GithubGraphNode['kind']): boolean {
  return kind === 'branch'
}

const MENU_GAP = 8

function kindLabel(
  kind: GithubGraphNode['kind'],
  ts: (path: string) => string,
): string {
  switch (kind) {
    case 'default':
      return ts('chat.githubGraph.kindDefault')
    case 'group':
      return ts('chat.githubGraph.kindGroup')
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
  if (kind === 'group') return <FolderTree size={12} strokeWidth={2} aria-hidden />
  return <GitBranch size={12} strokeWidth={2} aria-hidden />
}

function canCreateChild(kind: GithubGraphNode['kind']): boolean {
  return kind === 'default' || kind === 'branch' || kind === 'group'
}

const LEAVE_MS = 280

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

  const [initialLoading, setInitialLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shortName, setShortName] = useState('')
  const [renameTo, setRenameTo] = useState('')
  const [viewport, setViewport] = useState({ x: 32, y: 32, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  )
  const [modelInput, setModelInput] = useState<GraphModelInput | null>(null)
  const [nodeMotion, setNodeMotion] = useState<Record<string, NodeMotion>>({})
  const [popup, setPopup] = useState<NodePopup | null>(null)
  const shortNameRef = useRef<HTMLInputElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const leaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  )
  const modelInputRef = useRef(modelInput)
  modelInputRef.current = modelInput

  useEffect(() => {
    const timers = leaveTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const reload = useCallback(
    async (opts?: { fetchFirst?: boolean; soft?: boolean }) => {
      if (!client || !project) {
        setModelInput(null)
        return
      }
      const soft = Boolean(opts?.soft && modelInputRef.current)
      if (!soft) setInitialLoading(true)
      if (!soft) setMessage(null)
      try {
        if (opts?.fetchFirst) {
          const fetched = await client.fetchWorkspaceGit(project.projectId)
          if (!fetched.ok) setMessage(fetched.message)
        }
        const [status, branches, prs, worktrees] = await Promise.all([
          client.getWorkspaceGitStatus(project.projectId),
          client.listWorkspaceGitBranches(project.projectId),
          client.listWorkspacePullRequests(project.projectId).catch(() => ({
            available: false,
            pullRequests: [],
          })),
          client.listAgentWorktrees(project.projectId).catch(() => []),
        ])

        setModelInput((prev) => {
          const pendingById = new Map(
            (prev?.branches ?? [])
              .filter((branch) => branch.pending)
              .map((branch) => [branch.id, branch]),
          )
          const nextBranches: BuildGithubGraphBranch[] = branches.branches.map(
            (branch) => {
              const pending = pendingById.get(branch.id)
              if (pending) {
                pendingById.delete(branch.id)
                return { ...branch, pending: true }
              }
              return branch
            },
          )
          for (const leftover of pendingById.values()) {
            nextBranches.push(leftover)
          }
          return {
            repoLabel: project.displayName || project.projectId,
            defaultBranch:
              branches.defaultBranch ?? status.defaultBranch ?? null,
            currentBranch: branches.currentBranch ?? status.branch,
            ...(status.remoteUrl ? { remoteUrl: status.remoteUrl } : {}),
            dirty: status.dirty,
            branches: nextBranches,
            pullRequests: prs.pullRequests.map((pr) => ({
              ...pr,
              state: 'open' as const,
            })),
            worktrees: worktrees.map((wt) => ({
              id: wt.id,
              branch: wt.branch,
            })),
            parentByBranchName: { ...(prev?.parentByBranchName ?? {}) },
          }
        })
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : ts('chat.githubGraph.empty'),
        )
        if (!soft) setModelInput(null)
      } finally {
        if (!soft) setInitialLoading(false)
      }
    },
    [client, project, ts],
  )

  useEffect(() => {
    if (!open) return
    void reload()
  }, [open, reload])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (popup) {
          setPopup(null)
          return
        }
        setGithubGraphOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setGithubGraphOpen, popup])

  const model = useMemo(
    () =>
      modelInput
        ? buildGithubGraphModel({
            ...modelInput,
            parentByBranchName: modelInput.parentByBranchName,
          })
        : null,
    [modelInput],
  )
  const layout = useMemo(
    () => (model ? layoutGithubGraphTree(model) : null),
    [model],
  )

  const popupNode = useMemo(
    () =>
      popup
        ? (model?.nodes.find((node) => node.id === popup.nodeId) ?? null)
        : null,
    [model, popup],
  )

  const popupAnchor = useMemo(() => {
    if (!popup || !layout) return null
    const item = layout.nodes.find((entry) => entry.node.id === popup.nodeId)
    if (!item) return null
    return {
      left: item.x + GITHUB_NODE_WIDTH + MENU_GAP,
      top: item.y,
    }
  }, [popup, layout])

  const composedPreview = useMemo(() => {
    if (!popupNode || !canCreateChild(popupNode.kind)) return ''
    return composeChildBranchName(popupNode, shortName)
  }, [popupNode, shortName])

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

  function markEnter(nodeId: string) {
    setNodeMotion((current) => ({ ...current, [nodeId]: 'enter' }))
    window.setTimeout(() => {
      setNodeMotion((current) => {
        if (current[nodeId] !== 'enter') return current
        const next = { ...current }
        delete next[nodeId]
        return next
      })
    }, 420)
  }

  function animateRemoveNode(nodeId: string) {
    setNodeMotion((current) => ({ ...current, [nodeId]: 'leave' }))
    const existing = leaveTimers.current.get(nodeId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      leaveTimers.current.delete(nodeId)
      setModelInput((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          branches: prev.branches.filter((branch) => branch.id !== nodeId),
        }
      })
      setNodeMotion((current) => {
        const next = { ...current }
        delete next[nodeId]
        return next
      })
      setSelectedId((current) => (current === nodeId ? null : current))
    }, LEAVE_MS)
    leaveTimers.current.set(nodeId, timer)
  }

  function openNodeContextMenu(
    event: MouseEvent,
    node: GithubGraphNode,
  ) {
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(node.id)
    setShortName('')
    setPopup({ nodeId: node.id, mode: 'menu' })
  }

  function openCreateChild(node: GithubGraphNode) {
    setSelectedId(node.id)
    setShortName('')
    setPopup({ nodeId: node.id, mode: 'create' })
    window.setTimeout(() => shortNameRef.current?.focus(), 0)
  }

  function openRename(node: GithubGraphNode) {
    setSelectedId(node.id)
    setRenameTo(node.name)
    setPopup({ nodeId: node.id, mode: 'rename' })
    window.setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 0)
  }

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })
  const busy = mutating || initialLoading
  const parentPrefix = popupNode ? parentPathForNode(popupNode) : null

  async function checkoutSelected(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (node.kind !== 'branch' && node.kind !== 'default') return
    if (node.pending) return
    if (model?.dirty) {
      setMessage(ts('chat.githubGraph.dirtyBlocked'))
      return
    }
    setPopup(null)
    setMutating(true)
    try {
      const result = await client.checkoutWorkspaceBranch(
        project.projectId,
        node.name,
      )
      setMessage(result.message)
      if (!result.ok) return
      setModelInput((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          currentBranch: node.name,
          dirty: false,
          branches: prev.branches.map((branch) => ({
            ...branch,
            current: branch.name === node.name,
          })),
        }
      })
      await reload({ soft: true })
    } finally {
      setMutating(false)
    }
  }

  async function createChildBranch(node: GithubGraphNode) {
    if (!client || !project || mutating || !shortName.trim()) return
    if (!canCreateChild(node.kind)) return
    if (node.pending) return

    const name = composeChildBranchName(node, shortName)
    if (!name) return
    const id = `branch:${name}`
    if (modelInput?.branches.some((branch) => branch.id === id)) {
      setMessage(ts('chat.githubGraph.branchExists').replace('{name}', name))
      return
    }
    const from = resolveCreateFromTip(
      node,
      model?.defaultBranch ?? 'main',
      modelInput?.branches ?? [],
    )
    const parentId = node.id

    setShortName('')
    setPopup(null)
    setModelInput((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        parentByBranchName: {
          ...prev.parentByBranchName,
          [name]: parentId,
        },
        branches: [
          ...prev.branches,
          {
            id,
            name,
            current: false,
            remote: false,
            pending: true,
          },
        ],
      }
    })
    setSelectedId(id)
    markEnter(id)
    setMutating(true)
    setMessage(ts('chat.githubGraph.creatingBranch'))

    try {
      const result = await client.createWorkspaceBranch(project.projectId, {
        name,
        from,
        checkout: true,
        push: true,
      })
      setMessage(result.message)
      if (!result.ok) {
        if (result.branch) {
          setModelInput((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              currentBranch: name,
              branches: prev.branches.map((branch) => ({
                ...branch,
                current: branch.name === name,
                pending: branch.id === id ? false : branch.pending,
              })),
            }
          })
          await reload({ soft: true })
          return
        }
        animateRemoveNode(id)
        await reload({ soft: true })
        return
      }
      setModelInput((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          currentBranch: name,
          branches: prev.branches.map((branch) => ({
            ...branch,
            current: branch.name === name,
            pending: branch.id === id ? false : branch.pending,
          })),
        }
      })
      await reload({ soft: true })
    } catch (error) {
      animateRemoveNode(id)
      setMessage(
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.createBranchFailed'),
      )
    } finally {
      setMutating(false)
    }
  }

  async function createPr(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (node.kind !== 'branch' && node.kind !== 'default') return
    if (node.pending) return
    const base = model?.defaultBranch ?? 'main'
    const title = `Update ${node.name}`
    const prId = `pr:pending:${node.name}`
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.creatingPr'))
    try {
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
      markEnter(result.number ? `pr:${result.number}` : prId)
      await reload({ soft: true })
    } finally {
      setMutating(false)
    }
  }

  function openRemote() {
    const remote = model?.remoteUrl
      ?.replace(/^git@github\.com:/i, 'https://github.com/')
      .replace(/\.git$/i, '')
    if (remote) void window.projectOS?.shell.openExternal(remote)
  }

  function openNodeOnGithub(node: GithubGraphNode) {
    const remote = model?.remoteUrl
      ?.replace(/^git@github\.com:/i, 'https://github.com/')
      .replace(/\.git$/i, '')
    if (!remote) return
    if (node.kind === 'pr' && node.prUrl) {
      void window.projectOS?.shell.openExternal(node.prUrl)
      return
    }
    if (node.kind === 'branch' || node.kind === 'default') {
      void window.projectOS?.shell.openExternal(
        `${remote}/tree/${encodeURIComponent(node.name)}`,
      )
    }
  }

  async function renameBranch(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (!canMutateBranch(node.kind) || node.pending) return
    const to = renameTo.trim()
    if (!to || to === node.name) {
      setPopup(null)
      return
    }
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.renamingBranch'))
    try {
      const result = await client.renameWorkspaceBranch(project.projectId, {
        from: node.name,
        to,
        push: true,
        deleteRemoteOld: true,
      })
      setMessage(result.message)
      if (!result.ok) return
      const oldId = node.id
      const newId = `branch:${to}`
      setModelInput((prev) => {
        if (!prev) return prev
        const parentByBranchName = { ...prev.parentByBranchName }
        const parent = parentByBranchName[node.name]
        delete parentByBranchName[node.name]
        if (parent) parentByBranchName[to] = parent
        for (const [key, value] of Object.entries(parentByBranchName)) {
          if (value === oldId) parentByBranchName[key] = newId
        }
        return {
          ...prev,
          currentBranch:
            prev.currentBranch === node.name ? to : prev.currentBranch,
          parentByBranchName,
          branches: prev.branches.map((branch) =>
            branch.name === node.name
              ? { ...branch, id: newId, name: to, pending: false }
              : branch,
          ),
        }
      })
      setSelectedId(newId)
      markEnter(newId)
      await reload({ soft: true })
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.renameFailed'),
      )
    } finally {
      setMutating(false)
    }
  }

  async function deleteBranch(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (!canMutateBranch(node.kind) || node.pending) return
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.deletingBranch'))
    try {
      const result = await client.deleteWorkspaceBranch(project.projectId, {
        name: node.name,
        remote: true,
        force: true,
      })
      setMessage(result.message)
      if (!result.ok) return
      animateRemoveNode(node.id)
      setModelInput((prev) => {
        if (!prev) return prev
        const parentByBranchName = { ...prev.parentByBranchName }
        delete parentByBranchName[node.name]
        return {
          ...prev,
          parentByBranchName,
          currentBranch:
            prev.currentBranch === node.name
              ? (prev.defaultBranch ?? prev.currentBranch)
              : prev.currentBranch,
        }
      })
      await reload({ soft: true })
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.deleteFailed'),
      )
    } finally {
      setMutating(false)
    }
  }

  async function rollbackBranch(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (!canMutateBranch(node.kind) || node.pending) return
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.rollingBackBranch'))
    try {
      const result = await client.rollbackWorkspaceBranch(project.projectId, {
        name: node.name,
        to: model?.defaultBranch ?? undefined,
        mode: 'hard',
        push: true,
      })
      setMessage(result.message)
      if (!result.ok) return
      await reload({ soft: true })
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.rollbackFailed'),
      )
    } finally {
      setMutating(false)
    }
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
                {mutating ? (
                  <span className={`${styles.chip} ${styles.chipBusy}`}>
                    {ts('chat.githubGraph.syncing')}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.actionButton}
              disabled={!client || !project || busy}
              onClick={() => void reload({ fetchFirst: true })}
            >
              {ts('chat.githubGraph.fetch')}
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={ts('chat.githubGraph.refresh')}
              title={ts('chat.githubGraph.refresh')}
              disabled={!client || !project || busy}
              onClick={() => void reload({ soft: Boolean(modelInput) })}
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

        <div
          className={`${styles.canvas}${dragging ? ` ${styles.canvasDragging}` : ''}`}
          onWheel={onWheel}
          onContextMenu={(event) => {
            if (!(event.target as HTMLElement).closest('[data-github-node]')) {
              event.preventDefault()
              setPopup(null)
            }
          }}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('[data-github-node]')) {
              return
            }
            if ((event.target as HTMLElement).closest('[data-node-popup]')) {
              return
            }
            setPopup(null)
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
          {initialLoading && !layout ? (
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
                ['--github-world-scale' as string]: String(viewport.scale),
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
                  const x1 = from.x + GITHUB_NODE_WIDTH
                  const y1 = from.y + GITHUB_NODE_HEIGHT / 2
                  const x2 = to.x
                  const y2 = to.y + GITHUB_NODE_HEIGHT / 2
                  const mid = (x1 + x2) / 2
                  const motion = nodeMotion[node.id]
                  return (
                    <path
                      key={`e-${node.id}`}
                      className={`${styles.edge}${node.pending ? ` ${styles.edgePending}` : ''}${motion === 'enter' ? ` ${styles.edgeEnter}` : ''}${motion === 'leave' ? ` ${styles.edgeLeave}` : ''}`}
                      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    />
                  )
                })}
              </svg>
              {layout.nodes.map((item) => {
                const node = item.node
                const selectedNode = selectedId === node.id
                const motion = nodeMotion[node.id]
                return (
                  <button
                    key={node.id}
                    type="button"
                    data-github-node=""
                    data-kind={node.kind}
                    data-pending={node.pending ? 'true' : undefined}
                    className={`${styles.node}${selectedNode ? ` ${styles.nodeSelected}` : ''}${node.current ? ` ${styles.nodeCurrent}` : ''}${node.pending ? ` ${styles.nodePending}` : ''}${motion === 'enter' ? ` ${styles.nodeEnter}` : ''}${motion === 'leave' ? ` ${styles.nodeLeave}` : ''}`}
                    style={{ left: item.x, top: item.y }}
                    onClick={() => {
                      setPopup(null)
                      setSelectedId(node.id)
                    }}
                    onContextMenu={(event) => openNodeContextMenu(event, node)}
                    onDoubleClick={() => {
                      if (node.kind === 'branch' || node.kind === 'default') {
                        void checkoutSelected(node)
                      }
                    }}
                    disabled={Boolean(node.pending)}
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
                      {node.pending ? (
                        <span className={styles.metaBadge}>
                          {ts('chat.githubGraph.badgePending')}
                        </span>
                      ) : null}
                      {node.current && !node.pending ? (
                        <span className={styles.metaBadge}>
                          {ts('chat.githubGraph.badgeCurrent')}
                        </span>
                      ) : null}
                      {node.remote && !node.current && !node.pending ? (
                        <span className={styles.metaBadge}>
                          {ts('chat.githubGraph.badgeRemote')}
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

              {popup && popupNode && popupAnchor ? (
                <div
                  data-node-popup=""
                  className={
                    popup.mode === 'menu'
                      ? styles.contextMenu
                      : styles.createPopover
                  }
                  style={{ left: popupAnchor.left, top: popupAnchor.top }}
                  role={popup.mode === 'menu' ? 'menu' : 'dialog'}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {popup.mode === 'menu' ? (
                    <>
                      {canCreateChild(popupNode.kind) ? (
                        <button
                          type="button"
                          className={styles.contextItem}
                          role="menuitem"
                          disabled={mutating || Boolean(popupNode.pending)}
                          onClick={() => openCreateChild(popupNode)}
                        >
                          {ts('chat.githubGraph.menuNewChild')}
                        </button>
                      ) : null}
                      {(popupNode.kind === 'branch' ||
                        popupNode.kind === 'default') && (
                        <button
                          type="button"
                          className={styles.contextItem}
                          role="menuitem"
                          disabled={mutating || Boolean(popupNode.pending)}
                          onClick={() => void checkoutSelected(popupNode)}
                        >
                          {ts('chat.githubGraph.checkout')}
                        </button>
                      )}
                      {(popupNode.kind === 'branch' ||
                        popupNode.kind === 'default') && (
                        <button
                          type="button"
                          className={styles.contextItem}
                          role="menuitem"
                          disabled={mutating || Boolean(popupNode.pending)}
                          onClick={() => void createPr(popupNode)}
                        >
                          {ts('chat.githubGraph.createPr')}
                        </button>
                      )}
                      {(popupNode.kind === 'branch' ||
                        popupNode.kind === 'default' ||
                        popupNode.kind === 'pr') && (
                        <button
                          type="button"
                          className={styles.contextItem}
                          role="menuitem"
                          onClick={() => {
                            openNodeOnGithub(popupNode)
                            setPopup(null)
                          }}
                        >
                          {ts('chat.githubGraph.openRemote')}
                        </button>
                      )}
                      {canMutateBranch(popupNode.kind) ? (
                        <>
                          <button
                            type="button"
                            className={styles.contextItem}
                            role="menuitem"
                            disabled={mutating || Boolean(popupNode.pending)}
                            onClick={() => openRename(popupNode)}
                          >
                            {ts('chat.githubGraph.menuRename')}
                          </button>
                          <button
                            type="button"
                            className={styles.contextItem}
                            role="menuitem"
                            disabled={mutating || Boolean(popupNode.pending)}
                            onClick={() =>
                              setPopup({
                                nodeId: popupNode.id,
                                mode: 'confirm-delete',
                              })
                            }
                          >
                            {ts('chat.githubGraph.menuDelete')}
                          </button>
                          <button
                            type="button"
                            className={styles.contextItem}
                            role="menuitem"
                            disabled={mutating || Boolean(popupNode.pending)}
                            onClick={() =>
                              setPopup({
                                nodeId: popupNode.id,
                                mode: 'confirm-rollback',
                              })
                            }
                          >
                            {ts('chat.githubGraph.menuRollback')}
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {popup.mode === 'create' ? (
                    <>
                      <div className={styles.createPopoverTitle}>
                        {ts('chat.githubGraph.menuNewChild')}
                      </div>
                      <div className={styles.createPopoverNode}>
                        {popupNode.name}
                      </div>
                      {parentPrefix ? (
                        <div className={styles.pathPreview}>
                          <span className={styles.pathPrefix}>{parentPrefix}/</span>
                          <span className={styles.pathHint}>
                            {shortName.trim() || '…'}
                          </span>
                        </div>
                      ) : null}
                      <div className={styles.composedName}>
                        {ts('chat.githubGraph.fullBranchName')}:{' '}
                        <code>{composedPreview || '—'}</code>
                      </div>
                      <input
                        ref={shortNameRef}
                        className={styles.input}
                        value={shortName}
                        placeholder={ts('chat.githubGraph.shortNamePlaceholder')}
                        aria-label={ts('chat.githubGraph.menuNewChild')}
                        disabled={mutating || Boolean(popupNode.pending)}
                        onChange={(event) => setShortName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void createChildBranch(popupNode)
                          }
                        }}
                      />
                      <div className={styles.createPopoverActions}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            setPopup({ nodeId: popupNode.id, mode: 'menu' })
                          }
                        >
                          {ts('chat.githubGraph.menuBack')}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                          disabled={
                            mutating ||
                            Boolean(popupNode.pending) ||
                            !composedPreview
                          }
                          onClick={() => void createChildBranch(popupNode)}
                        >
                          {ts('chat.githubGraph.menuNewChild')}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {popup.mode === 'rename' ? (
                    <>
                      <div className={styles.createPopoverTitle}>
                        {ts('chat.githubGraph.menuRename')}
                      </div>
                      <div className={styles.createPopoverNode}>
                        {popupNode.name}
                      </div>
                      <input
                        ref={renameInputRef}
                        className={styles.input}
                        value={renameTo}
                        placeholder={ts('chat.githubGraph.renamePlaceholder')}
                        aria-label={ts('chat.githubGraph.menuRename')}
                        disabled={mutating || Boolean(popupNode.pending)}
                        onChange={(event) => setRenameTo(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void renameBranch(popupNode)
                          }
                        }}
                      />
                      <div className={styles.createPopoverActions}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            setPopup({ nodeId: popupNode.id, mode: 'menu' })
                          }
                        >
                          {ts('chat.githubGraph.menuBack')}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                          disabled={
                            mutating ||
                            Boolean(popupNode.pending) ||
                            !renameTo.trim() ||
                            renameTo.trim() === popupNode.name
                          }
                          onClick={() => void renameBranch(popupNode)}
                        >
                          {ts('chat.githubGraph.confirmRename')}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {popup.mode === 'confirm-delete' ? (
                    <>
                      <div className={styles.createPopoverTitle}>
                        {ts('chat.githubGraph.menuDelete')}
                      </div>
                      <div className={styles.createPopoverNode}>
                        {popupNode.name}
                      </div>
                      <p className={styles.confirmCopy}>
                        {ts('chat.githubGraph.deleteConfirm')}
                      </p>
                      <div className={styles.createPopoverActions}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            setPopup({ nodeId: popupNode.id, mode: 'menu' })
                          }
                        >
                          {ts('chat.githubGraph.menuBack')}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                          disabled={mutating || Boolean(popupNode.pending)}
                          onClick={() => void deleteBranch(popupNode)}
                        >
                          {ts('chat.githubGraph.confirmDelete')}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {popup.mode === 'confirm-rollback' ? (
                    <>
                      <div className={styles.createPopoverTitle}>
                        {ts('chat.githubGraph.menuRollback')}
                      </div>
                      <div className={styles.createPopoverNode}>
                        {popupNode.name}
                      </div>
                      <p className={styles.confirmCopy}>
                        {ts('chat.githubGraph.rollbackConfirm').replace(
                          '{base}',
                          model?.defaultBranch ?? 'main',
                        )}
                      </p>
                      <div className={styles.createPopoverActions}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() =>
                            setPopup({ nodeId: popupNode.id, mode: 'menu' })
                          }
                        >
                          {ts('chat.githubGraph.menuBack')}
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                          disabled={mutating || Boolean(popupNode.pending)}
                          onClick={() => void rollbackBranch(popupNode)}
                        >
                          {ts('chat.githubGraph.confirmRollback')}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </GraphOverlayFrame>
  )
}
