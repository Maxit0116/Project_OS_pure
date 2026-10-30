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
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import {
  DEFAULT_GITHUB_GRAPH_NAV,
  EMPTY_GITHUB_GRAPH_STORE,
  GITHUB_HISTORY_COMMIT_CAP,
  parentGithubGraphMode,
  reduceGithubGraphNav,
  sessionGraphShieldCssInsets,
  viewportForMode,
  type GithubFeature,
  type GithubGraphActiveMode,
  type GithubGraphNavState,
  type GithubGraphNode,
  type GithubRelation,
  type WorkspaceGitCheckRun,
  type WorkspaceGitCommit,
  type WorkspaceGitCommitDetail,
} from '@contracts/index'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useI18n } from '../../i18n'
import { assembleGithubDomainModel } from './assembleGithubDomainModel'
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
import {
  buildFeatureTreeProjection,
  featureNodeId,
  layoutFeatureTreeProjection,
} from './buildFeatureTreeProjection'
import GithubGraphDetailPanel from './GithubGraphDetailPanel'
import { layoutGithubCommitDag } from './layoutGithubCommitDag'
import {
  resolveFeatureToHistoryFocus,
  resolveHistoryToFeatureFocus,
  type FocusResolution,
} from './resolveGithubGraphFocus'
import {
  buildGithubGraphRecoveryPrompt,
  classifyGithubGraphBlocker,
  type PendingGithubGraphAction,
} from './githubGraphAgentRecovery'
import styles from './GithubGraphOverlay.module.css'

type AgentRecoveryPhase = 'idle' | 'running' | 'done' | 'failed'

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
  commits: WorkspaceGitCommit[]
  commitsTruncated: boolean
  features: GithubFeature[]
  relations: GithubRelation[]
}

type NodeMotion = 'enter' | 'leave'

/** Floating UI anchored to a laid-out node (world coordinates). */
type NodePopup = {
  nodeId: string
  mode:
    | 'menu'
    | 'create'
    | 'create-feature'
    | 'rename'
    | 'confirm-delete'
    | 'confirm-rollback'
    | 'confirm-merge-pr'
    | 'confirm-close-pr'
}

type CommitPopup = {
  sha: string
  mode: 'menu' | 'confirm-revert'
}

type FocusPickerState = {
  direction: 'to-history' | 'to-feature'
  options: Extract<FocusResolution, { kind: 'many' }>['options']
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
    case 'feature':
      return ts('chat.githubGraph.kindFeature')
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
  if (kind === 'feature') return <Sparkles size={12} strokeWidth={2} aria-hidden />
  return <GitBranch size={12} strokeWidth={2} aria-hidden />
}

function canCreateChild(kind: GithubGraphNode['kind']): boolean {
  return kind === 'default' || kind === 'branch' || kind === 'group'
}

function canPromoteFeature(kind: GithubGraphNode['kind']): boolean {
  return (
    kind === 'default' ||
    kind === 'branch' ||
    kind === 'group' ||
    kind === 'feature'
  )
}

function parseFeatureId(nodeId: string): string | null {
  return nodeId.startsWith('feature:') ? nodeId.slice('feature:'.length) : null
}

function newFeatureId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `feat:${crypto.randomUUID()}`
  }
  return `feat:${Date.now().toString(36)}`
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
  const sendPrompt = useWorkbenchStore((s) => s.sendPrompt)
  const setChatMode = useWorkbenchStore((s) => s.setChatMode)
  const { ts } = useI18n()

  const [initialLoading, setInitialLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [recoveryPhase, setRecoveryPhase] = useState<AgentRecoveryPhase>('idle')
  const [pendingAction, setPendingAction] = useState<PendingGithubGraphAction>({
    type: 'none',
  })
  const recoveryStartingRef = useRef(false)
  const pendingActionRef = useRef<PendingGithubGraphAction>({ type: 'none' })
  pendingActionRef.current = pendingAction
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
  const [nav, setNav] = useState<GithubGraphNavState>(DEFAULT_GITHUB_GRAPH_NAV)
  const [featureTitle, setFeatureTitle] = useState('')
  const [commitDetail, setCommitDetail] = useState<WorkspaceGitCommitDetail | null>(
    null,
  )
  const [commitDetailLoading, setCommitDetailLoading] = useState(false)
  const [checkRuns, setCheckRuns] = useState<WorkspaceGitCheckRun[]>([])
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)
  const [linkIssueOnCreate, setLinkIssueOnCreate] = useState(false)
  const [commitPopup, setCommitPopup] = useState<CommitPopup | null>(null)
  const [focusPicker, setFocusPicker] = useState<FocusPickerState | null>(null)
  const shortNameRef = useRef<HTMLInputElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const featureTitleRef = useRef<HTMLInputElement | null>(null)
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
        const [status, branches, prs, worktrees, commits, store, auth] =
          await Promise.all([
            client.getWorkspaceGitStatus(project.projectId),
            client.listWorkspaceGitBranches(project.projectId),
            client.listWorkspacePullRequests(project.projectId).catch(() => ({
              available: false,
              pullRequests: [],
            })),
            client.listAgentWorktrees(project.projectId).catch(() => []),
            client
              .listWorkspaceGitCommits(project.projectId, {
                limit: GITHUB_HISTORY_COMMIT_CAP,
              })
              .catch(() => ({ commits: [], truncated: false, tips: [] })),
            client.getGithubGraphStore(project.projectId).catch(() => null),
            client.getGitHubAuthStatus().catch(() => ({ connected: false })),
          ])
        setGithubConnected(Boolean(auth.connected))

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
          const nextStore = store ?? {
            features: prev?.features ?? EMPTY_GITHUB_GRAPH_STORE.features,
            relations: prev?.relations ?? EMPTY_GITHUB_GRAPH_STORE.relations,
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
            commits: commits.commits,
            commitsTruncated: commits.truncated,
            features: nextStore.features,
            relations: nextStore.relations,
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
  const domainModel = useMemo(
    () =>
      modelInput
        ? assembleGithubDomainModel({
            repoLabel: modelInput.repoLabel,
            defaultBranch: modelInput.defaultBranch,
            remoteUrl: modelInput.remoteUrl,
            branches: modelInput.branches,
            commits: modelInput.commits,
            pullRequests: modelInput.pullRequests,
            features: modelInput.features,
            associations: modelInput.relations,
          })
        : null,
    [modelInput],
  )
  const featureProjection = useMemo(
    () =>
      domainModel
        ? buildFeatureTreeProjection(domainModel, {
            expandedFeatureIds: nav.expandedFeatureIds,
          })
        : null,
    [domainModel, nav.expandedFeatureIds],
  )
  const partitionLayout = useMemo(
    () => (model ? layoutGithubGraphTree(model) : null),
    [model],
  )
  const featureLayout = useMemo(
    () =>
      featureProjection
        ? layoutFeatureTreeProjection(featureProjection)
        : null,
    [featureProjection],
  )
  const activeMode: GithubGraphActiveMode = nav.activeMode
  const showingFeatureProjection = activeMode === 'feature-tree'
  const layout = showingFeatureProjection ? featureLayout : partitionLayout
  const treeModel = showingFeatureProjection ? featureProjection : model
  const historyLayout = useMemo(
    () =>
      domainModel ? layoutGithubCommitDag(domainModel.commits) : null,
    [domainModel],
  )
  const featureCount = domainModel?.features.length ?? 0

  function applyHistoryFocus(option: {
    branchRef?: string
    commitSha?: string
    featureId?: string
    prNumber?: number
  }) {
    setNav((current) => {
      let next = current
      if (option.featureId) {
        next = reduceGithubGraphNav(next, {
          type: 'focus-feature',
          id: option.featureId,
        })
      }
      if (option.branchRef) {
        next = reduceGithubGraphNav(next, {
          type: 'focus-branch',
          ref: option.branchRef,
        })
      }
      if (option.commitSha) {
        next = reduceGithubGraphNav(next, {
          type: 'select-commit',
          sha: option.commitSha,
        })
      }
      return next
    })
  }

  function switchMode(
    mode: GithubGraphActiveMode,
    opts?: { skipFocusResolve?: boolean },
  ) {
    setFocusPicker(null)
    setPopup(null)

    if (!opts?.skipFocusResolve && domainModel) {
      if (mode === 'git-history' && nav.focusedFeatureId) {
        const resolution = resolveFeatureToHistoryFocus(
          domainModel,
          nav.focusedFeatureId,
        )
        if (resolution.kind === 'none') {
          setMessage(resolution.reason)
        } else if (resolution.kind === 'many') {
          setFocusPicker({
            direction: 'to-history',
            options: resolution.options,
          })
          return
        } else {
          applyHistoryFocus(resolution)
        }
      } else if (
        mode === 'feature-tree' &&
        activeMode === 'git-history' &&
        (nav.selectedCommitSha || nav.focusedBranchRef)
      ) {
        const resolution = resolveHistoryToFeatureFocus(domainModel, {
          branchRef: nav.focusedBranchRef,
          commitSha: nav.selectedCommitSha,
        })
        if (resolution.kind === 'none') {
          setMessage(resolution.reason)
        } else if (resolution.kind === 'many') {
          setFocusPicker({
            direction: 'to-feature',
            options: resolution.options,
          })
          return
        } else if (resolution.featureId) {
          setNav((current) =>
            reduceGithubGraphNav(current, {
              type: 'focus-feature',
              id: resolution.featureId!,
            }),
          )
          setSelectedId(featureNodeId(resolution.featureId))
        }
      }
    }

    setNav((current) => {
      const withViewport = reduceGithubGraphNav(current, {
        type: 'set-viewport',
        mode: current.activeMode,
        viewport,
      })
      const next = reduceGithubGraphNav(withViewport, {
        type: 'set-mode',
        mode,
      })
      const stored = viewportForMode(next, mode)
      if (stored) setViewport(stored)
      else setViewport({ x: 32, y: 32, scale: 1 })
      return next
    })
  }

  function goBackLayer() {
    const parent = parentGithubGraphMode(activeMode)
    if (!parent) return
    switchMode(parent, { skipFocusResolve: parent === 'partition' })
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (focusPicker) {
        setFocusPicker(null)
        return
      }
      if (commitPopup) {
        setCommitPopup(null)
        return
      }
      if (popup) {
        setPopup(null)
        return
      }
      if (nav.selectedCommitSha || nav.focusedFeatureId || selectedId) {
        setSelectedId(null)
        setNav((current) =>
          reduceGithubGraphNav(
            reduceGithubGraphNav(current, {
              type: 'select-commit',
              sha: null,
            }),
            { type: 'focus-feature', id: null },
          ),
        )
        return
      }
      if (parentGithubGraphMode(activeMode)) {
        goBackLayer()
        return
      }
      setGithubGraphOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    open,
    setGithubGraphOpen,
    popup,
    commitPopup,
    focusPicker,
    nav.selectedCommitSha,
    nav.focusedFeatureId,
    selectedId,
    activeMode,
  ])

  useEffect(() => {
    if (!open || activeMode !== 'git-history' || !nav.selectedCommitSha) {
      setCommitDetail(null)
      setCheckRuns([])
      return
    }
    if (!client || !project) return
    let cancelled = false
    setCommitDetailLoading(true)
    void client
      .getWorkspaceGitCommit(project.projectId, nav.selectedCommitSha)
      .then((detail) => {
        if (!cancelled) setCommitDetail(detail)
      })
      .catch((error) => {
        if (!cancelled) {
          setCommitDetail({
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : ts('chat.githubGraph.detailLoadFailed'),
          })
        }
      })
      .finally(() => {
        if (!cancelled) setCommitDetailLoading(false)
      })
    void client
      .listWorkspaceCommitCheckRuns(
        project.projectId,
        nav.selectedCommitSha,
      )
      .then((listed) => {
        if (!cancelled) setCheckRuns(listed.checkRuns ?? [])
      })
      .catch(() => {
        if (!cancelled) setCheckRuns([])
      })
    return () => {
      cancelled = true
    }
  }, [open, activeMode, nav.selectedCommitSha, client, project, ts])

  const selectedFeature = useMemo(() => {
    const id =
      nav.focusedFeatureId ??
      (selectedId ? parseFeatureId(selectedId) : null)
    if (!id || !domainModel) return null
    return domainModel.features.find((feature) => feature.id === id) ?? null
  }, [nav.focusedFeatureId, selectedId, domainModel])

  const selectedFeatureCounts = useMemo(() => {
    if (!selectedFeature || !domainModel) return { branches: 0, prs: 0 }
    let branches = 0
    let prs = 0
    for (const rel of domainModel.relations) {
      if (rel.stale) continue
      if (rel.fromType !== 'feature' || rel.fromKey !== selectedFeature.id) {
        continue
      }
      if (rel.kind === 'feature-implemented-by' && rel.toType === 'branch') {
        branches += 1
      }
      if (rel.kind === 'feature-reviewed-by' && rel.toType === 'pr') {
        prs += 1
      }
    }
    return { branches, prs }
  }, [selectedFeature, domainModel])

  const popupNode = useMemo(() => {
    if (!popup) return null
    return (
      treeModel?.nodes.find((node) => node.id === popup.nodeId) ??
      model?.nodes.find((node) => node.id === popup.nodeId) ??
      null
    )
  }, [treeModel, model, popup])

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

  function openCreateFeature(node: GithubGraphNode) {
    setSelectedId(node.id)
    const suggested =
      node.kind === 'group'
        ? node.name
        : node.name.includes('/')
          ? (node.name.split('/').pop() ?? node.name)
          : node.name
    setFeatureTitle(suggested)
    setLinkIssueOnCreate(false)
    setPopup({ nodeId: node.id, mode: 'create-feature' })
    window.setTimeout(() => {
      featureTitleRef.current?.focus()
      featureTitleRef.current?.select()
    }, 0)
  }

  async function createFeatureFromNode(node: GithubGraphNode) {
    if (!client || !project || mutating || !featureTitle.trim()) return
    if (!canPromoteFeature(node.kind)) return
    const title = featureTitle.trim()
    const parentFeatureId = parseFeatureId(node.id)
    let issueRef: GithubFeature['issueRef']
    if (linkIssueOnCreate) {
      if (!githubConnected) {
        setMessage(ts('chat.githubGraph.githubAuthRequired'))
        return
      }
      const createdIssue = await client.createWorkspaceIssue(project.projectId, {
        title,
      })
      if (!createdIssue.ok || !createdIssue.number) {
        setMessage(
          createdIssue.message || ts('chat.githubGraph.issueCreateFailed'),
        )
        return
      }
      issueRef = {
        number: createdIssue.number,
        ...(createdIssue.url ? { url: createdIssue.url } : {}),
        state: 'open',
      }
    }
    const feature: GithubFeature = {
      id: newFeatureId(),
      title,
      status: 'planned',
      updatedAt: new Date().toISOString(),
      ...(parentFeatureId ? { parentFeatureId } : {}),
      ...(issueRef ? { issueRef } : {}),
    }
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.creatingFeature'))
    try {
      let store = await client.upsertGithubGraphFeature(
        project.projectId,
        feature,
      )
      if (issueRef) {
        const tracked: GithubRelation = {
          id: `rel:track:${feature.id}:${issueRef.number}`,
          kind: 'feature-tracked-by',
          fromType: 'feature',
          fromKey: feature.id,
          toType: 'issue',
          toKey: String(issueRef.number),
          source: 'user',
          stale: false,
          createdAt: new Date().toISOString(),
        }
        store = await client.upsertGithubGraphRelation(
          project.projectId,
          tracked,
        )
      }
      if (
        parentFeatureId &&
        !nav.expandedFeatureIds.includes(parentFeatureId)
      ) {
        setNav((current) =>
          reduceGithubGraphNav(current, {
            type: 'toggle-feature-expanded',
            id: parentFeatureId,
          }),
        )
      }
      if (node.kind === 'branch') {
        const relation: GithubRelation = {
          id: `rel:impl:${feature.id}:${node.name}`,
          kind: 'feature-implemented-by',
          fromType: 'feature',
          fromKey: feature.id,
          toType: 'branch',
          toKey: node.name,
          source: 'user',
          stale: false,
          createdAt: new Date().toISOString(),
        }
        store = await client.upsertGithubGraphRelation(
          project.projectId,
          relation,
        )
      }
      setModelInput((prev) =>
        prev
          ? {
              ...prev,
              features: store.features,
              relations: store.relations,
            }
          : prev,
      )
      setNav((current) =>
        reduceGithubGraphNav(current, {
          type: 'focus-feature',
          id: feature.id,
        }),
      )
      setSelectedId(featureNodeId(feature.id))
      setMessage(ts('chat.githubGraph.featureCreated'))
      if (activeMode === 'partition') {
        switchMode('feature-tree', { skipFocusResolve: true })
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.featureCreateFailed'),
      )
    } finally {
      setMutating(false)
    }
  }

  function openFeatureInHistory(featureId: string) {
    if (!domainModel) return
    setNav((current) =>
      reduceGithubGraphNav(current, {
        type: 'focus-feature',
        id: featureId,
      }),
    )
    const resolution = resolveFeatureToHistoryFocus(domainModel, featureId)
    if (resolution.kind === 'none') {
      setMessage(resolution.reason)
      return
    }
    if (resolution.kind === 'many') {
      setFocusPicker({ direction: 'to-history', options: resolution.options })
      return
    }
    applyHistoryFocus(resolution)
    switchMode('git-history', { skipFocusResolve: true })
  }

  function chooseFocusOption(
    option: FocusPickerState['options'][number],
  ) {
    if (focusPicker?.direction === 'to-history') {
      applyHistoryFocus(option)
      switchMode('git-history', { skipFocusResolve: true })
    } else if (option.featureId) {
      setNav((current) =>
        reduceGithubGraphNav(current, {
          type: 'focus-feature',
          id: option.featureId!,
        }),
      )
      setSelectedId(featureNodeId(option.featureId))
      switchMode('feature-tree', { skipFocusResolve: true })
    }
    setFocusPicker(null)
  }

  const detailAnchor = useMemo(() => {
    if (popup) return null
    if (activeMode === 'git-history' && nav.selectedCommitSha && historyLayout) {
      const node = historyLayout.nodes.find(
        (item) => item.sha === nav.selectedCommitSha,
      )
      if (!node) return null
      return {
        left: node.x + GITHUB_NODE_WIDTH + MENU_GAP,
        top: node.y,
      }
    }
    if (
      (activeMode === 'feature-tree' || activeMode === 'partition') &&
      selectedFeature &&
      layout
    ) {
      const id = featureNodeId(selectedFeature.id)
      const item = layout.nodes.find((entry) => entry.node.id === id)
      if (!item) return null
      return {
        left: item.x + GITHUB_NODE_WIDTH + MENU_GAP,
        top: item.y,
      }
    }
    return null
  }, [
    popup,
    activeMode,
    nav.selectedCommitSha,
    historyLayout,
    selectedFeature,
    layout,
  ])

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

  const startAgentRecovery = useCallback(
    async (
      blockerMessage: string,
      pending: PendingGithubGraphAction = { type: 'none' },
    ) => {
      const kind = classifyGithubGraphBlocker(blockerMessage)
      if (!kind) return
      if (recoveryStartingRef.current || recoveryPhase === 'running') {
        setPendingAction(pending)
        return
      }
      recoveryStartingRef.current = true
      setPendingAction(pending)
      setRecoveryPhase('running')
      setMessage(ts('chat.githubGraph.agentRecoveryStarted'))
      const prompt = buildGithubGraphRecoveryPrompt({
        kind,
        blockerMessage,
        pending,
        defaultBranch: modelInputRef.current?.defaultBranch,
      })
      try {
        await setChatMode('change', { isolate: false })
        useWorkbenchStore.setState({
          globalAgentActive: true,
          rightPanelTab: 'chat',
        })
        await sendPrompt(prompt)
      } catch (error) {
        setRecoveryPhase('failed')
        setMessage(
          error instanceof Error
            ? error.message
            : ts('chat.githubGraph.agentRecoveryFailed'),
        )
      } finally {
        recoveryStartingRef.current = false
      }
    },
    [recoveryPhase, sendPrompt, setChatMode, ts],
  )

  const noteMutationOutcome = useCallback(
    (
      resultMessage: string,
      ok: boolean,
      pending: PendingGithubGraphAction = { type: 'none' },
    ) => {
      setMessage(resultMessage)
      if (ok) return
      if (classifyGithubGraphBlocker(resultMessage)) {
        void startAgentRecovery(resultMessage, pending)
      }
    },
    [startAgentRecovery],
  )

  useEffect(() => {
    if (!open || recoveryPhase !== 'running' || !client || !project) return
    let cancelled = false
    const poll = async () => {
      try {
        const status = await client.getWorkspaceGitStatus(project.projectId)
        if (cancelled) return
        if (status.dirty) return
        setModelInput((prev) =>
          prev ? { ...prev, dirty: false } : prev,
        )
        setMessage(ts('chat.githubGraph.agentRecoveryDone'))
        const pending = pendingActionRef.current
        setPendingAction({ type: 'none' })
        setRecoveryPhase('idle')
        if (pending.type === 'checkout') {
          setMutating(true)
          try {
            const result = await client.checkoutWorkspaceBranch(
              project.projectId,
              pending.branch,
            )
            setMessage(result.message)
            if (result.ok) await reload({ soft: true })
          } finally {
            setMutating(false)
          }
        } else if (pending.type === 'push') {
          setMutating(true)
          try {
            const result = await client.pushWorkspaceBranch(
              project.projectId,
              pending.branch,
            )
            setMessage(result.message)
            if (result.ok) await reload({ soft: true })
          } finally {
            setMutating(false)
          }
        } else if (pending.type === 'pull') {
          setMutating(true)
          try {
            const result = await client.pullWorkspaceBranch(
              project.projectId,
              pending.branch,
            )
            setMessage(result.message)
            if (result.ok) await reload({ soft: true })
          } finally {
            setMutating(false)
          }
        } else if (pending.type === 'rollback') {
          setMutating(true)
          try {
            const result = await client.rollbackWorkspaceBranch(
              project.projectId,
              {
                name: pending.branch,
                mode: 'hard',
                push: true,
              },
            )
            setMessage(result.message)
            if (result.ok) await reload({ soft: true })
          } finally {
            setMutating(false)
          }
        } else if (pending.type === 'revert') {
          setMutating(true)
          try {
            const result = await client.revertWorkspaceCommit(
              project.projectId,
              { sha: pending.sha, push: true },
            )
            setMessage(result.message)
            if (result.ok) await reload({ soft: true })
          } finally {
            setMutating(false)
          }
        } else {
          await reload({ soft: true })
        }
      } catch {
        // Keep polling; agent may still be writing.
      }
    }
    const timer = window.setInterval(() => void poll(), 2500)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, recoveryPhase, client, project, reload, ts])

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })
  const busy = mutating || initialLoading || recoveryPhase === 'running'
  const parentPrefix = popupNode ? parentPathForNode(popupNode) : null

  async function checkoutSelected(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (node.kind !== 'branch' && node.kind !== 'default') return
    if (node.pending) return
    if (model?.dirty) {
      const blocked = ts('chat.githubGraph.dirtyBlocked')
      setMessage(blocked)
      void startAgentRecovery(blocked, {
        type: 'checkout',
        branch: node.name,
        nodeId: node.id,
      })
      return
    }
    setPopup(null)
    setMutating(true)
    try {
      const result = await client.checkoutWorkspaceBranch(
        project.projectId,
        node.name,
      )
      noteMutationOutcome(result.message, result.ok, {
        type: 'checkout',
        branch: node.name,
        nodeId: node.id,
      })
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
    if (model?.dirty) {
      const blocked = ts('chat.githubGraph.dirtyBlocked')
      setMessage(blocked)
      void startAgentRecovery(blocked, { type: 'none' })
      return
    }

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
      if (!result.ok) {
        noteMutationOutcome(result.message, false)
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
      setMessage(result.message)
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
      const text =
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.createBranchFailed')
      noteMutationOutcome(text, false)
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
      noteMutationOutcome(result.message, result.ok)
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
      const text =
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.renameFailed')
      noteMutationOutcome(text, false)
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
      noteMutationOutcome(result.message, result.ok)
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
      const text =
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.deleteFailed')
      noteMutationOutcome(text, false)
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
      noteMutationOutcome(result.message, result.ok, {
        type: 'rollback',
        branch: node.name,
      })
      if (!result.ok) return
      await reload({ soft: true })
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.rollbackFailed')
      noteMutationOutcome(text, false, {
        type: 'rollback',
        branch: node.name,
      })
    } finally {
      setMutating(false)
    }
  }

  async function pushBranch(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (node.kind !== 'branch' && node.kind !== 'default') return
    if (!githubConnected) {
      setMessage(ts('chat.githubGraph.githubAuthRequired'))
      return
    }
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.pushingBranch'))
    try {
      const result = await client.pushWorkspaceBranch(
        project.projectId,
        node.name,
      )
      noteMutationOutcome(result.message, result.ok, {
        type: 'push',
        branch: node.name,
      })
      if (result.ok) await reload({ soft: true })
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.pushFailed')
      noteMutationOutcome(text, false, { type: 'push', branch: node.name })
    } finally {
      setMutating(false)
    }
  }

  async function pullBranch(node: GithubGraphNode) {
    if (!client || !project || mutating) return
    if (node.kind !== 'branch' && node.kind !== 'default') return
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.pullingBranch'))
    try {
      const result = await client.pullWorkspaceBranch(
        project.projectId,
        node.name,
      )
      noteMutationOutcome(result.message, result.ok, {
        type: 'pull',
        branch: node.name,
      })
      if (result.ok) await reload({ soft: true })
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.pullFailed')
      noteMutationOutcome(text, false, { type: 'pull', branch: node.name })
    } finally {
      setMutating(false)
    }
  }

  async function mergePr(node: GithubGraphNode) {
    if (!client || !project || mutating || !node.prNumber) return
    if (!githubConnected) {
      setMessage(ts('chat.githubGraph.githubAuthRequired'))
      return
    }
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.mergingPr'))
    try {
      const result = await client.mergeWorkspacePullRequest(project.projectId, {
        number: node.prNumber,
        mergeMethod: 'squash',
      })
      setMessage(result.message)
      if (result.ok) await reload({ soft: true, fetchFirst: true })
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.mergePrFailed'),
      )
    } finally {
      setMutating(false)
    }
  }

  async function closePr(node: GithubGraphNode) {
    if (!client || !project || mutating || !node.prNumber) return
    if (!githubConnected) {
      setMessage(ts('chat.githubGraph.githubAuthRequired'))
      return
    }
    setPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.closingPr'))
    try {
      const result = await client.closeWorkspacePullRequest(project.projectId, {
        number: node.prNumber,
      })
      setMessage(result.message)
      if (result.ok) await reload({ soft: true })
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.closePrFailed'),
      )
    } finally {
      setMutating(false)
    }
  }

  async function safeRevertCommit(sha: string) {
    if (!client || !project || mutating) return
    setCommitPopup(null)
    setMutating(true)
    setMessage(ts('chat.githubGraph.revertingCommit'))
    try {
      const result = await client.revertWorkspaceCommit(project.projectId, {
        sha,
        push: true,
      })
      noteMutationOutcome(result.message, result.ok, {
        type: 'revert',
        sha,
      })
      if (result.ok) await reload({ soft: true })
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : ts('chat.githubGraph.revertFailed')
      noteMutationOutcome(text, false, { type: 'revert', sha })
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
                {githubConnected === true ? (
                  <span className={`${styles.chip} ${styles.chipClean}`}>
                    {ts('chat.githubGraph.githubConnected')}
                  </span>
                ) : githubConnected === false ? (
                  <span className={`${styles.chip} ${styles.chipDirty}`}>
                    {ts('chat.githubGraph.githubDisconnected')}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            <nav className={styles.breadcrumb} aria-label={ts('chat.githubGraph.breadcrumbLabel')}>
              {parentGithubGraphMode(activeMode) ? (
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={goBackLayer}
                  aria-label={ts('chat.githubGraph.navBack')}
                  title={ts('chat.githubGraph.navBack')}
                >
                  <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                className={`${styles.crumb}${activeMode === 'partition' ? ` ${styles.crumbActive}` : ''}`}
                onClick={() =>
                  switchMode('partition', { skipFocusResolve: true })
                }
              >
                <FolderTree size={11} strokeWidth={2} aria-hidden />
                {ts('chat.githubGraph.modePartition')}
              </button>
              {activeMode !== 'partition' ? (
                <>
                  <ChevronRight size={10} strokeWidth={2} className={styles.crumbSep} aria-hidden />
                  <button
                    type="button"
                    className={`${styles.crumb}${activeMode === 'feature-tree' ? ` ${styles.crumbActive}` : ''}`}
                    onClick={() => switchMode('feature-tree')}
                  >
                    <Sparkles size={11} strokeWidth={2} aria-hidden />
                    {ts('chat.githubGraph.modeFeatureTree')}
                    {featureCount > 0 ? (
                      <span className={styles.crumbCount}>{featureCount}</span>
                    ) : null}
                  </button>
                </>
              ) : null}
              {activeMode === 'git-history' ? (
                <>
                  <ChevronRight size={10} strokeWidth={2} className={styles.crumbSep} aria-hidden />
                  <span className={`${styles.crumb} ${styles.crumbActive}`}>
                    <GitCommitHorizontal size={11} strokeWidth={2} aria-hidden />
                    {ts('chat.githubGraph.modeGitHistory')}
                  </span>
                </>
              ) : null}
            </nav>
            {activeMode === 'partition' ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => switchMode('feature-tree')}
              >
                {ts('chat.githubGraph.enterFeatures')}
              </button>
            ) : null}
            {activeMode === 'feature-tree' ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => switchMode('git-history')}
              >
                {ts('chat.githubGraph.enterHistory')}
              </button>
            ) : null}
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

        {model?.dirty && recoveryPhase !== 'running' ? (
          <div className={styles.banner}>
            <span>{ts('chat.githubGraph.dirtyBlocked')}</span>
            <button
              type="button"
              className={styles.bannerAction}
              disabled={busy}
              onClick={() =>
                void startAgentRecovery(ts('chat.githubGraph.dirtyBlocked'), {
                  type: 'none',
                })
              }
            >
              {ts('chat.githubGraph.agentRecoveryCta')}
            </button>
          </div>
        ) : null}
        {recoveryPhase === 'running' ? (
          <div className={`${styles.banner} ${styles.bannerRecovery}`}>
            <span>{ts('chat.githubGraph.agentRecoveryRunning')}</span>
            <button
              type="button"
              className={styles.bannerAction}
              onClick={() => {
                setRecoveryPhase('idle')
                setPendingAction({ type: 'none' })
              }}
            >
              {ts('chat.githubGraph.agentRecoveryDismiss')}
            </button>
          </div>
        ) : null}
        {message ? <div className={styles.messageBanner}>{message}</div> : null}

        <div className={styles.stage}>
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
            if ((event.target as HTMLElement).closest('[data-focus-picker]')) {
              return
            }
            setPopup(null)
            setCommitPopup(null)
            setFocusPicker(null)
            setSelectedId(null)
            setNav((current) =>
              reduceGithubGraphNav(
                reduceGithubGraphNav(current, {
                  type: 'select-commit',
                  sha: null,
                }),
                { type: 'focus-feature', id: null },
              ),
            )
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
          {focusPicker ? (
            <div className={styles.focusPicker} data-focus-picker="" role="dialog">
              <div className={styles.focusPickerTitle}>
                {ts('chat.githubGraph.focusPickerTitle')}
              </div>
              <p className={styles.focusPickerHint}>
                {ts('chat.githubGraph.focusPickerHint')}
              </p>
              <div className={styles.focusPickerList}>
                {focusPicker.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={styles.focusPickerItem}
                    onClick={() => chooseFocusOption(option)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => setFocusPicker(null)}
              >
                {ts('chat.githubGraph.menuBack')}
              </button>
            </div>
          ) : null}
          {initialLoading && !layout && !historyLayout ? (
            <p className={styles.empty}>{ts('chat.githubGraph.loading')}</p>
          ) : activeMode === 'feature-tree' && featureCount === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.empty}>{ts('chat.githubGraph.featuresEmpty')}</p>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={() =>
                  switchMode('partition', { skipFocusResolve: true })
                }
              >
                {ts('chat.githubGraph.backToPartition')}
              </button>
            </div>
          ) : activeMode === 'git-history' ? (
            !historyLayout || historyLayout.nodes.length === 0 ? (
              <p className={styles.empty}>{ts('chat.githubGraph.historyEmpty')}</p>
            ) : (
              <div
                className={styles.world}
                style={{
                  width: historyLayout.width,
                  height: historyLayout.height,
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                  ['--github-world-scale' as string]: String(viewport.scale),
                }}
              >
                <svg
                  className={styles.edges}
                  width={historyLayout.width}
                  height={historyLayout.height}
                  aria-hidden
                >
                  {historyLayout.nodes.flatMap((node) => {
                    const toX = node.x
                    const toY = node.y + GITHUB_NODE_HEIGHT / 2
                    return node.parentShas.map((parentSha) => {
                      const parent = historyLayout.nodes.find(
                        (item) => item.sha === parentSha,
                      )
                      if (!parent) return null
                      const x1 = parent.x + GITHUB_NODE_WIDTH
                      const y1 = parent.y + GITHUB_NODE_HEIGHT / 2
                      const mid = (x1 + toX) / 2
                      return (
                        <path
                          key={`ce-${node.sha}-${parentSha}`}
                          className={styles.edge}
                          d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${toY}, ${toX} ${toY}`}
                        />
                      )
                    })
                  })}
                </svg>
                {historyLayout.nodes.map((node) => {
                  const selected = nav.selectedCommitSha === node.sha
                  return (
                    <button
                      key={node.sha}
                      type="button"
                      data-github-node=""
                      data-kind="commit"
                      className={`${styles.node}${selected ? ` ${styles.nodeSelected}` : ''}`}
                      style={{ left: node.x, top: node.y }}
                      onClick={() => {
                        setCommitPopup(null)
                        setNav((current) =>
                          reduceGithubGraphNav(current, {
                            type: 'select-commit',
                            sha: node.sha,
                          }),
                        )
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setNav((current) =>
                          reduceGithubGraphNav(current, {
                            type: 'select-commit',
                            sha: node.sha,
                          }),
                        )
                        setCommitPopup({ sha: node.sha, mode: 'menu' })
                      }}
                      title={node.message}
                    >
                      <div className={styles.nodeTop}>
                        <span className={styles.kindMark}>
                          <GitCommitHorizontal size={12} strokeWidth={2} aria-hidden />
                        </span>
                        <span className={styles.nodeTitle}>
                          {node.sha.slice(0, 7)}
                        </span>
                      </div>
                      <div className={styles.nodeMeta}>
                        <span className={styles.metaBadge}>
                          {ts('chat.githubGraph.kindCommit')}
                        </span>
                        <span className={styles.metaBadge}>
                          {node.message.slice(0, 28)}
                          {node.message.length > 28 ? '…' : ''}
                        </span>
                      </div>
                    </button>
                  )
                })}
                {modelInput?.commitsTruncated ? (
                  <div className={styles.historyCapNote}>
                    {ts('chat.githubGraph.historyTruncated').replace(
                      '{n}',
                      String(GITHUB_HISTORY_COMMIT_CAP),
                    )}
                  </div>
                ) : null}
                {detailAnchor && nav.selectedCommitSha && !commitPopup ? (
                  <GithubGraphDetailPanel
                    kind="commit"
                    commitDetail={commitDetail}
                    checkRuns={checkRuns}
                    loading={commitDetailLoading}
                    style={{
                      left: detailAnchor.left,
                      top: detailAnchor.top,
                    }}
                    onSafeRevert={() =>
                      setCommitPopup({
                        sha: nav.selectedCommitSha!,
                        mode: 'confirm-revert',
                      })
                    }
                    onClose={() =>
                      setNav((current) =>
                        reduceGithubGraphNav(current, {
                          type: 'select-commit',
                          sha: null,
                        }),
                      )
                    }
                  />
                ) : null}
                {commitPopup ? (
                  <div
                    data-node-popup=""
                    className={
                      commitPopup.mode === 'menu'
                        ? styles.contextMenu
                        : styles.createPopover
                    }
                    style={{
                      left:
                        (historyLayout.nodes.find(
                          (item) => item.sha === commitPopup.sha,
                        )?.x ?? 0) +
                        GITHUB_NODE_WIDTH +
                        MENU_GAP,
                      top:
                        historyLayout.nodes.find(
                          (item) => item.sha === commitPopup.sha,
                        )?.y ?? 0,
                    }}
                    role={commitPopup.mode === 'menu' ? 'menu' : 'dialog'}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {commitPopup.mode === 'menu' ? (
                      <button
                        type="button"
                        className={styles.contextItem}
                        role="menuitem"
                        disabled={mutating}
                        onClick={() =>
                          setCommitPopup({
                            sha: commitPopup.sha,
                            mode: 'confirm-revert',
                          })
                        }
                      >
                        {ts('chat.githubGraph.menuSafeRevert')}
                      </button>
                    ) : (
                      <>
                        <div className={styles.createPopoverTitle}>
                          {ts('chat.githubGraph.menuSafeRevert')}
                        </div>
                        <p className={styles.confirmCopy}>
                          {ts('chat.githubGraph.safeRevertConfirm').replace(
                            '{sha}',
                            commitPopup.sha.slice(0, 12),
                          )}
                        </p>
                        <div className={styles.createPopoverActions}>
                          <button
                            type="button"
                            className={styles.actionButton}
                            onClick={() =>
                              setCommitPopup({
                                sha: commitPopup.sha,
                                mode: 'menu',
                              })
                            }
                          >
                            {ts('chat.githubGraph.menuBack')}
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                            disabled={mutating}
                            onClick={() =>
                              void safeRevertCommit(commitPopup.sha)
                            }
                          >
                            {ts('chat.githubGraph.confirmSafeRevert')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )
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
                {treeModel?.nodes.map((node) => {
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
                const featureId = parseFeatureId(node.id)
                const selectedNode =
                  selectedId === node.id ||
                  (featureId !== null && nav.focusedFeatureId === featureId)
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
                      if (featureId) {
                        setNav((current) =>
                          reduceGithubGraphNav(current, {
                            type: 'focus-feature',
                            id: featureId,
                          }),
                        )
                      }
                    }}
                    onContextMenu={(event) => openNodeContextMenu(event, node)}
                    onDoubleClick={() => {
                      if (featureId) {
                        if (
                          nav.expandedFeatureIds.includes(featureId) ||
                          (domainModel?.features.some(
                            (feature) => feature.parentFeatureId === featureId,
                          ) ?? false)
                        ) {
                          setNav((current) =>
                            reduceGithubGraphNav(current, {
                              type: 'toggle-feature-expanded',
                              id: featureId,
                            }),
                          )
                        }
                        return
                      }
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
                      {canPromoteFeature(popupNode.kind) ? (
                        <button
                          type="button"
                          className={styles.contextItem}
                          role="menuitem"
                          disabled={mutating || Boolean(popupNode.pending)}
                          onClick={() => openCreateFeature(popupNode)}
                        >
                          {ts('chat.githubGraph.menuCreateFeature')}
                        </button>
                      ) : null}
                      {activeMode === 'partition' &&
                      (popupNode.kind === 'default' ||
                        popupNode.kind === 'branch' ||
                        popupNode.kind === 'group') ? (
                        <button
                          type="button"
                          className={styles.contextItem}
                          role="menuitem"
                          onClick={() => {
                            setPopup(null)
                            switchMode('feature-tree')
                          }}
                        >
                          {ts('chat.githubGraph.enterFeatures')}
                        </button>
                      ) : null}
                      {popupNode.kind === 'feature' ? (
                        <button
                          type="button"
                          className={styles.contextItem}
                          role="menuitem"
                          onClick={() => {
                            const id = parseFeatureId(popupNode.id)
                            setPopup(null)
                            if (id) openFeatureInHistory(id)
                          }}
                        >
                          {ts('chat.githubGraph.openInHistory')}
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
                        popupNode.kind === 'default') && (
                        <>
                          <button
                            type="button"
                            className={styles.contextItem}
                            role="menuitem"
                            disabled={
                              mutating ||
                              Boolean(popupNode.pending) ||
                              githubConnected === false
                            }
                            onClick={() => void pushBranch(popupNode)}
                          >
                            {ts('chat.githubGraph.menuPush')}
                          </button>
                          <button
                            type="button"
                            className={styles.contextItem}
                            role="menuitem"
                            disabled={mutating || Boolean(popupNode.pending)}
                            onClick={() => void pullBranch(popupNode)}
                          >
                            {ts('chat.githubGraph.menuPull')}
                          </button>
                        </>
                      )}
                      {popupNode.kind === 'pr' && popupNode.prNumber ? (
                        <>
                          <button
                            type="button"
                            className={styles.contextItem}
                            role="menuitem"
                            disabled={mutating || githubConnected === false}
                            onClick={() =>
                              setPopup({
                                nodeId: popupNode.id,
                                mode: 'confirm-merge-pr',
                              })
                            }
                          >
                            {ts('chat.githubGraph.menuMergePr')}
                          </button>
                          <button
                            type="button"
                            className={styles.contextItem}
                            role="menuitem"
                            disabled={mutating || githubConnected === false}
                            onClick={() =>
                              setPopup({
                                nodeId: popupNode.id,
                                mode: 'confirm-close-pr',
                              })
                            }
                          >
                            {ts('chat.githubGraph.menuClosePr')}
                          </button>
                        </>
                      ) : null}
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

                  {popup.mode === 'create-feature' ? (
                    <>
                      <div className={styles.createPopoverTitle}>
                        {ts('chat.githubGraph.menuCreateFeature')}
                      </div>
                      <div className={styles.createPopoverNode}>
                        {popupNode.name}
                      </div>
                      <input
                        ref={featureTitleRef}
                        className={styles.input}
                        value={featureTitle}
                        placeholder={ts('chat.githubGraph.featureTitlePlaceholder')}
                        aria-label={ts('chat.githubGraph.menuCreateFeature')}
                        disabled={mutating}
                        onChange={(event) => setFeatureTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void createFeatureFromNode(popupNode)
                          }
                        }}
                      />
                      <label className={styles.checkRow}>
                        <input
                          type="checkbox"
                          checked={linkIssueOnCreate}
                          disabled={mutating || githubConnected === false}
                          onChange={(event) =>
                            setLinkIssueOnCreate(event.target.checked)
                          }
                        />
                        <span>{ts('chat.githubGraph.linkGithubIssue')}</span>
                      </label>
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
                          disabled={mutating || !featureTitle.trim()}
                          onClick={() => void createFeatureFromNode(popupNode)}
                        >
                          {ts('chat.githubGraph.confirmCreateFeature')}
                        </button>
                      </div>
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

                  {popup.mode === 'confirm-merge-pr' ? (
                    <>
                      <div className={styles.createPopoverTitle}>
                        {ts('chat.githubGraph.menuMergePr')}
                      </div>
                      <div className={styles.createPopoverNode}>
                        {popupNode.name}
                      </div>
                      <p className={styles.confirmCopy}>
                        {ts('chat.githubGraph.mergePrConfirm')}
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
                          className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                          disabled={mutating}
                          onClick={() => void mergePr(popupNode)}
                        >
                          {ts('chat.githubGraph.confirmMergePr')}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {popup.mode === 'confirm-close-pr' ? (
                    <>
                      <div className={styles.createPopoverTitle}>
                        {ts('chat.githubGraph.menuClosePr')}
                      </div>
                      <div className={styles.createPopoverNode}>
                        {popupNode.name}
                      </div>
                      <p className={styles.confirmCopy}>
                        {ts('chat.githubGraph.closePrConfirm')}
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
                          disabled={mutating}
                          onClick={() => void closePr(popupNode)}
                        >
                          {ts('chat.githubGraph.confirmClosePr')}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {detailAnchor &&
              activeMode === 'feature-tree' &&
              selectedFeature &&
              !popup ? (
                <GithubGraphDetailPanel
                  kind="feature"
                  feature={selectedFeature}
                  branchCount={selectedFeatureCounts.branches}
                  prCount={selectedFeatureCounts.prs}
                  style={{
                    left: detailAnchor.left,
                    top: detailAnchor.top,
                  }}
                  onOpenHistory={() =>
                    openFeatureInHistory(selectedFeature.id)
                  }
                  onClose={() => {
                    setSelectedId(null)
                    setNav((current) =>
                      reduceGithubGraphNav(current, {
                        type: 'focus-feature',
                        id: null,
                      }),
                    )
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
        </div>
      </div>
    </GraphOverlayFrame>
  )
}
