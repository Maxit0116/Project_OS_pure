import {
  Bookmark,
  Bot,
  ExternalLink,
  Folder,
  GitBranch,
  Layers,
  Link2,
  Plus,
  Plug,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type {
  PinComposerHub,
  PinComposerHubReference,
  PinComposerHubScope,
  PinComposerHubSubagentLink,
  ScreenRect,
} from '@contracts/spatial-pin'
import {
  createFolderScopeId,
  emptyPinComposerHub,
  foldersFromScopes,
  formatHubScopeToken,
  normalizeHubScopes,
} from '@contracts/spatial-pin'
import { useReducedMotion3d } from '../FunctionMap/hooks/useReducedMotion3d'
import {
  COMPOSE_HUB_STRINGS_EN,
  type ComposeHubStrings,
} from './composeHubStrings'
import {
  deriveFolderScopesFromReferences,
  mergeFolderScopes,
} from './deriveHubFolders'
import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import type {
  ComposeHubDataSource,
  HubMcpServerOption,
} from './hubActions'
import {
  attachPointsForSatellite,
  computeReferencesHeight,
  computeScopeHeight,
  inferSatelliteSide,
  layoutSatellites,
  type SatelliteLayoutSlot,
  type SatelliteRect,
  type SatelliteSide,
} from './hubLayout'
import {
  clampRectToBounds,
  separateFromOthers,
} from './satelliteCollision'
import GithubBranchLocator from './GithubBranchLocator'
import ReferenceAddPanel from './ReferenceAddPanel'
import SatelliteCard from './SatelliteCard'
import SatelliteConnector from './SatelliteConnector'
import SatellitePicker from './SatellitePicker'
import ScopeMapPicker from './ScopeMapPicker'
import styles from './hubMotion.module.css'

export interface SpatialComposeHubProps {
  card: ScreenRect
  expanded: boolean
  hub: PinComposerHub
  onHubChange: (next: PinComposerHub) => void
  subagentLinks?: readonly PinComposerHubSubagentLink[]
  promptText?: string
  resolveAssetUrl?: (assetPath: string) => string | undefined
  strings?: ComposeHubStrings
  researchLines?: readonly string[]
  onResearchLinesChange?: (lines: string[]) => void
  dataSource?: ComposeHubDataSource
  children?: ReactNode
  wrapPanel?: boolean
  panelClassName?: string
  panelProps?: HTMLAttributes<HTMLDivElement>
}

type PickerKind = 'repo' | 'folders' | 'skills' | null
type ScopeEntryMode = 'folders' | 'map'

function createSubagentId(): string {
  return `sub_${crypto.randomUUID().slice(0, 8)}`
}

function referenceKindLabel(
  kind: PinComposerHubReference['kind'],
  strings: ComposeHubStrings,
): string {
  switch (kind) {
    case 'github':
      return strings.referencesGithub
    case 'url':
      return strings.referencesUrl
    case 'video':
      return strings.referencesVideo
    case 'audio':
      return strings.referencesAudio
    case 'image':
      return strings.referencesImage
    case 'file':
      return strings.referencesFile
    default:
      return strings.references
  }
}

function referenceDisplayLabel(ref: PinComposerHubReference): string {
  if (ref.label) return ref.label
  switch (ref.kind) {
    case 'file':
      return ref.path.split('/').pop() ?? ref.path
    case 'github':
      return ref.owner && ref.repo
        ? `${ref.owner}/${ref.repo}`
        : ref.url
    case 'url':
      return ref.url
    case 'image':
    case 'video':
    case 'audio':
      return ref.url ?? ref.assetPath ?? ref.kind
  }
}

function statusLabel(
  status: PinComposerHubSubagentLink['status'] | undefined,
  strings: ComposeHubStrings,
): string {
  switch (status) {
    case 'queued':
      return strings.statusQueued
    case 'running':
      return strings.statusRunning
    case 'done':
      return strings.statusDone
    case 'error':
      return strings.statusError
    default:
      return strings.statusReady
  }
}

function segmentCount(
  status: PinComposerHubSubagentLink['status'] | undefined,
): number {
  switch (status) {
    case 'queued':
      return 1
    case 'running':
      return 3
    case 'done':
      return 5
    case 'error':
      return 2
    default:
      return 0
  }
}

export default function SpatialComposeHub({
  card,
  expanded,
  hub: hubInput,
  onHubChange,
  subagentLinks = [],
  promptText = '',
  resolveAssetUrl,
  strings = COMPOSE_HUB_STRINGS_EN,
  researchLines = [],
  onResearchLinesChange,
  dataSource,
  children,
  wrapPanel = false,
  panelClassName,
  panelProps,
}: SpatialComposeHubProps) {
  const hub = ensureHub(hubInput)
  const reducedMotion = useReducedMotion3d()
  const [positionOverrides, setPositionOverrides] = useState<
    Record<string, { x: number; y: number }>
  >({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragRef = useRef<{
    id: string
    originX: number
    originY: number
    startClientX: number
    startClientY: number
    width: number
    height: number
    side: SatelliteSide
  } | null>(null)

  const [picker, setPicker] = useState<PickerKind>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerItems, setPickerItems] = useState<
    Array<{ id: string; label: string; description?: string; selected?: boolean }>
  >([])
  const [folderPath, setFolderPath] = useState('')
  const [scopeMode, setScopeMode] = useState<ScopeEntryMode>('folders')
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [graphNodes, setGraphNodes] = useState<FunctionalNode[]>([])
  const [graphEdges, setGraphEdges] = useState<FunctionalEdge[]>([])
  const [graphLoading, setGraphLoading] = useState(false)
  const [researchBusy, setResearchBusy] = useState(false)
  const [referencePanelOpen, setReferencePanelOpen] = useState(false)
  const [branchLocatorOpen, setBranchLocatorOpen] = useState(false)
  const [liveGitStatus, setLiveGitStatus] = useState<{
    branch: string | null
    dirty: boolean
    ahead?: number
    behind?: number
    remoteUrl?: string
  } | null>(null)
  const [mcpServers, setMcpServers] = useState<HubMcpServerOption[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)

  const hubScopes = useMemo(
    () => normalizeHubScopes(hub).scopes,
    [hub],
  )

  /** Card body only lists selections for the active Folders | Map mode. */
  const visibleScopes = useMemo(
    () =>
      hubScopes.filter((scope) =>
        scopeMode === 'folders'
          ? scope.kind === 'folder'
          : scope.kind === 'node',
      ),
    [hubScopes, scopeMode],
  )

  const linkBySlot = useMemo(() => {
    const map = new Map<string, PinComposerHubSubagentLink>()
    for (const link of subagentLinks) map.set(link.slotId, link)
    return map
  }, [subagentLinks])

  const slashSkills = useMemo(() => {
    const found = new Set<string>()
    for (const match of promptText.matchAll(/(^|\s)\/([a-zA-Z0-9._-]+)/g)) {
      const id = match[2]
      if (id) found.add(id)
    }
    return found
  }, [promptText])

  const assetResolver = resolveAssetUrl ?? dataSource?.resolveAssetUrl

  const layoutSlots = useMemo((): SatelliteLayoutSlot[] => {
    if (!expanded) return []
    const slots: SatelliteLayoutSlot[] = [
      { id: 'repo', side: 'left', index: 0, count: 4 },
      { id: 'scope', side: 'left', index: 1, count: 4 },
      { id: 'mcp', side: 'left', index: 2, count: 4 },
      { id: 'skills', side: 'left', index: 3, count: 4 },
    ]
    hub.subagents.forEach((slot, index) => {
      slots.push({
        id: `subagent:${slot.id}`,
        side: 'right',
        index,
        count: hub.subagents.length + 1,
      })
    })
    slots.push({
      id: 'add-subagent',
      side: 'right',
      index: hub.subagents.length,
      count: hub.subagents.length + 1,
    })
    const bottomCount = hub.researchEnabled ? 2 : 1
    slots.push({
      id: 'references',
      side: 'bottom',
      index: 0,
      count: bottomCount,
    })
    if (hub.researchEnabled) {
      slots.push({
        id: 'research',
        side: 'bottom',
        index: 1,
        count: bottomCount,
      })
    }
    return slots
  }, [expanded, hub.researchEnabled, hub.subagents])

  const referencesHeight = useMemo(
    () => computeReferencesHeight(hub.references.length),
    [hub.references.length],
  )

  const scopeHeight = useMemo(
    () => computeScopeHeight(visibleScopes.length),
    [visibleScopes.length],
  )

  const baseRects = useMemo(
    () =>
      layoutSatellites(card, layoutSlots, {
        referencesHeight,
        scopeHeight,
      }),
    [card, layoutSlots, referencesHeight, scopeHeight],
  )

  const satRects = useMemo((): SatelliteRect[] => {
    return baseRects.map((rect) => {
      const override = positionOverrides[rect.id]
      if (!override) return rect
      const placed = {
        x: override.x,
        y: override.y,
        width: rect.width,
        height: rect.height,
      }
      const side = inferSatelliteSide(card, placed)
      const points = attachPointsForSatellite(card, placed, side)
      return {
        ...rect,
        ...placed,
        side,
        hubPoint: points.hubPoint,
        satPoint: points.satPoint,
      }
    })
  }, [baseRects, card, positionOverrides])

  const rectById = useMemo(() => {
    const map = new Map(satRects.map((rect) => [rect.id, rect]))
    return map
  }, [satRects])

  function patch(partial: Partial<PinComposerHub>) {
    onHubChange({ ...hub, ...partial })
  }

  function patchScopes(scopes: PinComposerHubScope[]) {
    patch({
      scopes,
      folders: foldersFromScopes(scopes),
    })
  }

  const closePicker = useCallback(() => {
    setPicker(null)
    setPickerItems([])
    setPickerLoading(false)
  }, [])

  const closeMapPicker = useCallback(() => {
    setMapPickerOpen(false)
  }, [])

  async function openSkillsPicker() {
    if (!dataSource?.listSkills) return
    setPicker('skills')
    setPickerLoading(true)
    try {
      const skills = await dataSource.listSkills()
      setPickerItems(
        skills.map((skill) => ({
          id: skill.id,
          label: skill.name || skill.id,
          description: skill.description,
          selected: hub.skillIds.includes(skill.id),
        })),
      )
    } catch {
      setPickerItems([])
    } finally {
      setPickerLoading(false)
    }
  }

  async function openFoldersPicker(path = '') {
    if (!dataSource?.listDirectories) return
    setMapPickerOpen(false)
    setPicker('folders')
    setFolderPath(path)
    setPickerLoading(true)
    try {
      const dirs = await dataSource.listDirectories(path)
      const folderPaths = new Set(
        hubScopes
          .filter((scope) => scope.kind === 'folder')
          .map((scope) => scope.path),
      )
      setPickerItems(
        dirs.map((dir) => ({
          id: dir.path,
          label: dir.name,
          description: dir.path,
          selected: folderPaths.has(dir.path),
        })),
      )
    } catch {
      setPickerItems([])
    } finally {
      setPickerLoading(false)
    }
  }

  async function openMapPicker() {
    if (!dataSource?.getProjectGraph) return
    closePicker()
    setMapPickerOpen(true)
    setGraphLoading(true)
    try {
      const graph = await dataSource.getProjectGraph()
      setGraphNodes(graph?.nodes ?? [])
      setGraphEdges(graph?.edges ?? [])
    } catch {
      setGraphNodes([])
      setGraphEdges([])
    } finally {
      setGraphLoading(false)
    }
  }

  function toggleFolderScope(path: string) {
    const existing = hubScopes.find(
      (scope) => scope.kind === 'folder' && scope.path === path,
    )
    if (existing) {
      patchScopes(hubScopes.filter((scope) => scope.id !== existing.id))
      return
    }
    patchScopes([
      ...hubScopes,
      {
        kind: 'folder',
        id: createFolderScopeId(path),
        path,
      },
    ])
  }

  function toggleNodeScope(scope: PinComposerHubScope) {
    if (scope.kind !== 'node') return
    const existing = hubScopes.find(
      (item) => item.kind === 'node' && item.nodeId === scope.nodeId,
    )
    if (existing) {
      patchScopes(hubScopes.filter((item) => item.id !== existing.id))
      return
    }
    patchScopes([...hubScopes, scope])
  }

  function removeScope(scopeId: string) {
    patchScopes(hubScopes.filter((scope) => scope.id !== scopeId))
  }

  async function refreshMcpServers() {
    if (!dataSource?.listMcpServers) {
      setMcpServers([])
      return
    }
    setMcpLoading(true)
    try {
      setMcpServers(await dataSource.listMcpServers())
    } catch {
      setMcpServers([])
    } finally {
      setMcpLoading(false)
    }
  }

  async function toggleMcpServer(server: HubMcpServerOption) {
    if (!dataSource?.setMcpServerEnabled) return
    const next = await dataSource.setMcpServerEnabled(
      server.id,
      !server.enabled,
    )
    if (next) {
      setMcpServers((prev) =>
        prev.map((item) => (item.id === next.id ? next : item)),
      )
    } else {
      void refreshMcpServers()
    }
  }

  async function openRepoPicker() {
    if (!dataSource?.listRepoCandidates && !dataSource?.getGitStatus) return
    setPicker('repo')
    setPickerLoading(true)
    try {
      const [candidates, git] = await Promise.all([
        dataSource.listRepoCandidates?.() ?? Promise.resolve([]),
        dataSource.getGitStatus?.() ??
          Promise.resolve({ branch: null, dirty: false }),
      ])
      if (candidates.length > 0) {
        setPickerItems(
          candidates.map((item) => ({
            id: item.projectId,
            label: item.displayName,
            description: git.branch
              ? `@ ${git.branch}${git.dirty ? ' · dirty' : ''}`
              : undefined,
            selected: hub.repo?.label === item.displayName,
          })),
        )
      } else {
        setPickerItems([
          {
            id: hub.repo?.label ?? 'current',
            label: hub.repo?.label ?? strings.repoEmpty,
            description: git.branch
              ? `@ ${git.branch}${git.dirty ? ' · dirty' : ''}`
              : 'No candidates',
            selected: true,
          },
        ])
      }
      if (git.branch && hub.repo && hub.repo.branch !== git.branch) {
        patch({
          repo: {
            label: hub.repo.label,
            branch: git.branch,
          },
        })
      }
    } catch {
      setPickerItems([])
    } finally {
      setPickerLoading(false)
    }
  }

  function removeReference(id: string) {
    patch({
      references: hub.references.filter((item) => item.id !== id),
    })
  }

  async function refreshResearchLines() {
    if (!hub.researchEnabled) {
      onResearchLinesChange?.([])
      return
    }
    setResearchBusy(true)
    try {
      const lines: string[] = []
      for (const folder of hub.folders.slice(0, 4)) {
        lines.push(`Scan ${folder}`)
      }
      if (dataSource?.listMentionFiles) {
        const query =
          promptText.trim().slice(0, 48) ||
          hub.folders[0] ||
          hub.skillIds[0] ||
          ''
        const files = await dataSource.listMentionFiles(query)
        for (const file of files.slice(0, 6)) {
          lines.push(file)
        }
      }
      for (const skillId of hub.skillIds.slice(0, 3)) {
        lines.push(`Skill /${skillId}`)
      }
      if (lines.length === 0) {
        lines.push('Reading workspace context…')
      }
      onResearchLinesChange?.(lines)
    } catch {
      onResearchLinesChange?.(['Research lookup failed'])
    } finally {
      setResearchBusy(false)
    }
  }

  useEffect(() => {
    if (!expanded || !hub.researchEnabled) return
    void refreshResearchLines()
    // Only re-run when research toggles or context inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expanded,
    hub.researchEnabled,
    hub.folders.join('|'),
    hub.skillIds.join('|'),
    promptText,
  ])

  useEffect(() => {
    if (!expanded) {
      setReferencePanelOpen(false)
      setBranchLocatorOpen(false)
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded || !dataSource?.getGitStatus) return
    let cancelled = false
    void dataSource.getGitStatus().then((git) => {
      if (cancelled) return
      setLiveGitStatus({
        branch: git.branch,
        dirty: git.dirty,
        ...(git.ahead !== undefined ? { ahead: git.ahead } : {}),
        ...(git.behind !== undefined ? { behind: git.behind } : {}),
        ...(git.remoteUrl ? { remoteUrl: git.remoteUrl } : {}),
      })
    })
    return () => {
      cancelled = true
    }
  }, [expanded, hub.repo?.label, hub.repo?.branch, dataSource])

  useEffect(() => {
    if (!expanded) return
    void refreshMcpServers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, dataSource?.listMcpServers])

  useEffect(() => {
    const normalized = normalizeHubScopes(hub)
    const derived = deriveFolderScopesFromReferences(hub.references)
    const folderOnly = normalized.scopes.filter(
      (scope) => scope.kind === 'folder',
    )
    const nodeScopes = normalized.scopes.filter(
      (scope) => scope.kind === 'node',
    )
    const explicitFolderPaths = folderOnly.map((scope) => scope.path)
    const mergedPaths = mergeFolderScopes(explicitFolderPaths, derived)
    const nextFolderScopes = mergedPaths.map((path) => {
      const existing = folderOnly.find((scope) => scope.path === path)
      return (
        existing ?? {
          kind: 'folder' as const,
          id: createFolderScopeId(path),
          path,
        }
      )
    })
    const nextScopes = [...nextFolderScopes, ...nodeScopes]
    const nextFolders = foldersFromScopes(nextScopes)
    const sameScopes =
      nextScopes.length === normalized.scopes.length &&
      nextScopes.every((scope, index) => {
        const prev = normalized.scopes[index]
        if (!prev || prev.kind !== scope.kind || prev.id !== scope.id) {
          return false
        }
        if (scope.kind === 'folder' && prev.kind === 'folder') {
          return scope.path === prev.path
        }
        if (scope.kind === 'node' && prev.kind === 'node') {
          return scope.nodeId === prev.nodeId
        }
        return false
      })
    const sameFolders =
      nextFolders.length === hub.folders.length &&
      nextFolders.every((path, index) => path === hub.folders[index])
    if (sameScopes && sameFolders && hub.scopes.length === nextScopes.length) {
      return
    }
    onHubChange({ ...hub, scopes: nextScopes, folders: nextFolders })
    // Only re-run when references change; avoid loops on scopes writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.references])

  useEffect(() => {
    if (!expanded || !dataSource?.getGitStatus || !hub.repo) return
    let cancelled = false
    void dataSource.getGitStatus().then((git) => {
      if (cancelled || !git.branch) return
      if (hub.repo?.branch === git.branch) return
      onHubChange({
        ...hub,
        repo: { label: hub.repo!.label, branch: git.branch },
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, hub.repo?.label, dataSource])

  function beginDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    rect: SatelliteRect,
  ) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, textarea, a, select, label')) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = {
      id: rect.id,
      originX: rect.x,
      originY: rect.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      width: rect.width,
      height: rect.height,
      side: rect.side,
    }
    setDraggingId(rect.id)
    const pointerId = event.pointerId
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const next = {
        x: drag.originX + (moveEvent.clientX - drag.startClientX),
        y: drag.originY + (moveEvent.clientY - drag.startClientY),
        width: drag.width,
        height: drag.height,
      }
      const others = satRects
        .filter((item) => item.id !== drag.id)
        .map((item) => ({
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        }))
      const separated = separateFromOthers(next, others, 10)
      const cardBlock = {
        x: card.x - 8,
        y: card.y - 8,
        width: card.width + 16,
        height: card.height + 16,
      }
      const awayFromCard = separateFromOthers(separated, [cardBlock], 12)
      const viewport =
        typeof window !== 'undefined'
          ? { width: window.innerWidth, height: window.innerHeight }
          : null
      const clamped = clampRectToBounds(awayFromCard, viewport, 8)
      setPositionOverrides((prev) => ({
        ...prev,
        [drag.id]: { x: clamped.x, y: clamped.y },
      }))
    }
    const onUp = () => {
      dragRef.current = null
      setDraggingId(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    void pointerId
  }

  async function handlePickerSelect(
    id: string,
    meta?: { drill?: boolean },
  ) {
    if (picker === 'skills') {
      const next = hub.skillIds.includes(id)
        ? hub.skillIds.filter((item) => item !== id)
        : [...hub.skillIds, id]
      patch({ skillIds: next })
      setPickerItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, selected: !item.selected } : item,
        ),
      )
      return
    }
    if (picker === 'folders') {
      if (meta?.drill) {
        void openFoldersPicker(id)
        return
      }
      toggleFolderScope(id)
      setPickerItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, selected: !item.selected } : item,
        ),
      )
      return
    }
    if (picker === 'repo') {
      const candidate = pickerItems.find((item) => item.id === id)
      if (candidate) {
        const git = await dataSource?.getGitStatus?.()
        patch({
          repo: {
            label: candidate.label,
            branch: git?.branch ?? hub.repo?.branch ?? 'main',
          },
        })
        await dataSource?.onSelectRepo?.(id)
      }
      closePicker()
      return
    }
  }

  const panel = wrapPanel ? (
    <div
      className={panelClassName ?? 'overlay-panel overlay-panel-chrome'}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
      }}
      {...panelProps}
    >
      {children}
    </div>
  ) : (
    children
  )

  const pickerAnchorId =
    picker === 'folders' ? 'scope' : picker === null ? null : picker
  const pickerAnchor =
    (pickerAnchorId && rectById.get(pickerAnchorId)) || null
  const pickerObstacles = useMemo(() => {
    if (!pickerAnchorId) return []
    const obstacles = satRects
      .filter((rect) => rect.id !== pickerAnchorId)
      .map((rect) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }))
    obstacles.push({
      x: card.x,
      y: card.y,
      width: card.width,
      height: card.height,
    })
    return obstacles
  }, [satRects, pickerAnchorId, card])
  const pickerPreferredSide =
    pickerAnchor?.side === 'right'
      ? ('left' as const)
      : pickerAnchor?.side === 'bottom'
        ? ('above' as const)
        : ('right' as const)

  return (
    <>
      {panel}

      {expanded ? (
        <div className={styles.layer} aria-hidden={false}>
          <svg className={styles.connectorSvg}>
            {satRects.map((rect, index) => (
              <SatelliteConnector
                key={`conn-${rect.id}`}
                from={rect.hubPoint}
                to={rect.satPoint}
                side={rect.side}
                delayMs={draggingId ? 0 : index * 50}
                reducedMotion={reducedMotion || Boolean(draggingId)}
              />
            ))}
          </svg>

          {rectById.get('repo') ? (
            <SatelliteCard
              side={rectById.get('repo')!.side}
              title={strings.repo}
              tone="repo"
              icon={GitBranch}
              delayMs={0}
              reducedMotion={reducedMotion}
              rect={rectById.get('repo')!}
              dragging={draggingId === 'repo'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('repo')!)
              }
              actions={
                <div className={styles.repoActions}>
                  {dataSource?.listGitBranches ? (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={strings.repoLocate}
                      title={strings.repoLocate}
                      onClick={() => setBranchLocatorOpen((open) => !open)}
                    >
                      <Search size={13} strokeWidth={2} aria-hidden />
                    </button>
                  ) : null}
                  {dataSource?.listRepoCandidates || dataSource?.getGitStatus ? (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={strings.repo}
                      title={strings.repo}
                      onClick={() => void openRepoPicker()}
                    >
                      <Plus size={13} strokeWidth={2} aria-hidden />
                    </button>
                  ) : null}
                </div>
              }
            >
              {hub.repo?.label ? (
                <>
                  <button
                    type="button"
                    className={styles.repoPath}
                    onClick={() => void openRepoPicker()}
                  >
                    {hub.repo.label}
                  </button>
                  {hub.repo.branch ? (
                    <button
                      type="button"
                      className={styles.branchPill}
                      onClick={() =>
                        dataSource?.listGitBranches
                          ? setBranchLocatorOpen(true)
                          : undefined
                      }
                    >
                      <GitBranch size={10} strokeWidth={2} aria-hidden />
                      {hub.repo.branch}
                    </button>
                  ) : null}
                  {liveGitStatus ? (
                    <div className={styles.repoStatusLine}>
                      <span>
                        {liveGitStatus.dirty
                          ? strings.repoDirty
                          : strings.repoClean}
                      </span>
                      {liveGitStatus.ahead !== undefined ||
                      liveGitStatus.behind !== undefined ? (
                        <span>
                          ↑{liveGitStatus.ahead ?? 0} ↓
                          {liveGitStatus.behind ?? 0}
                        </span>
                      ) : null}
                      {hub.repo.prNumber ? (
                        <span>PR #{hub.repo.prNumber}</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={styles.repoActionRow}>
                    {liveGitStatus?.remoteUrl || dataSource?.openExternalUrl ? (
                      <button
                        type="button"
                        className={styles.repoActionBtn}
                        onClick={() => {
                          const url = liveGitStatus?.remoteUrl
                          if (!url) return
                          const https = url
                            .replace(/^git@github\.com:/i, 'https://github.com/')
                            .replace(/\.git$/i, '')
                          dataSource?.openExternalUrl?.(https)
                        }}
                      >
                        <ExternalLink size={11} strokeWidth={2} aria-hidden />
                        {strings.repoOpenGithub}
                      </button>
                    ) : null}
                    {dataSource?.openGithubGraph ? (
                      <button
                        type="button"
                        className={styles.repoActionBtn}
                        onClick={() => dataSource.openGithubGraph?.()}
                      >
                        {strings.repoOpenGraph}
                      </button>
                    ) : null}
                    {dataSource?.fetchGit ? (
                      <button
                        type="button"
                        className={styles.repoActionBtn}
                        onClick={() => void dataSource.fetchGit?.()}
                      >
                        {strings.repoFetch}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.emptyHint}
                  onClick={() => void openRepoPicker()}
                >
                  {strings.repoEmpty}
                </button>
              )}
            </SatelliteCard>
          ) : null}

          {branchLocatorOpen && rectById.get('repo') ? (
            <GithubBranchLocator
              open={branchLocatorOpen}
              anchorRect={rectById.get('repo')!}
              hub={hub}
              onHubChange={onHubChange}
              strings={strings}
              dataSource={dataSource}
              onClose={() => setBranchLocatorOpen(false)}
            />
          ) : null}

          {rectById.get('scope') ? (
            <SatelliteCard
              side={rectById.get('scope')!.side}
              title={strings.scope}
              tone="folder"
              icon={Layers}
              delayMs={50}
              reducedMotion={reducedMotion}
              rect={rectById.get('scope')!}
              dragging={draggingId === 'scope'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('scope')!)
              }
              actions={
                (scopeMode === 'folders' && dataSource?.listDirectories) ||
                (scopeMode === 'map' && dataSource?.getProjectGraph) ? (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={strings.scopeAdd}
                    title={strings.scopeAdd}
                    onClick={() => {
                      if (scopeMode === 'map') void openMapPicker()
                      else void openFoldersPicker(folderPath || '')
                    }}
                  >
                    <Plus size={13} strokeWidth={2} aria-hidden />
                  </button>
                ) : null
              }
            >
              <div className={styles.scopeModeRow} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scopeMode === 'folders'}
                  className={`${styles.scopeModeBtn}${scopeMode === 'folders' ? ` ${styles.scopeModeBtnActive}` : ''}`}
                  onClick={() => {
                    setScopeMode('folders')
                    setMapPickerOpen(false)
                  }}
                >
                  {strings.scopeModeFolders}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scopeMode === 'map'}
                  className={`${styles.scopeModeBtn}${scopeMode === 'map' ? ` ${styles.scopeModeBtnActive}` : ''}`}
                  onClick={() => {
                    setScopeMode('map')
                    closePicker()
                  }}
                >
                  {strings.scopeModeMap}
                </button>
              </div>
              {visibleScopes.length === 0 ? (
                <span className={styles.emptyHint}>{strings.scopeEmpty}</span>
              ) : (
                <div className={styles.scopeListScroll}>
                  {visibleScopes.map((scope, scopeIndex) => (
                    <button
                      key={scope.id}
                      type="button"
                      className={styles.rowItem}
                      title={`Remove ${formatHubScopeToken(scope)}`}
                      onClick={() => removeScope(scope.id)}
                    >
                      <span className={styles.rowIcon}>
                        {scope.kind === 'folder' ? (
                          <Folder size={12} strokeWidth={2} aria-hidden />
                        ) : (
                          <Layers size={12} strokeWidth={2} aria-hidden />
                        )}
                      </span>
                      <span className={styles.rowLabel}>
                        {formatHubScopeToken(scope)}
                      </span>
                      <span className={styles.rowBadge}>{scopeIndex + 1}</span>
                    </button>
                  ))}
                </div>
              )}
            </SatelliteCard>
          ) : null}

          {rectById.get('mcp') ? (
            <SatelliteCard
              side={rectById.get('mcp')!.side}
              title={strings.mcp}
              tone="mcp"
              icon={Plug}
              delayMs={100}
              reducedMotion={reducedMotion}
              rect={rectById.get('mcp')!}
              dragging={draggingId === 'mcp'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('mcp')!)
              }
              actions={
                dataSource?.openMcpSettings ? (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={strings.mcpOpenSettings}
                    title={strings.mcpOpenSettings}
                    onClick={() => dataSource.openMcpSettings?.()}
                  >
                    <Plus size={13} strokeWidth={2} aria-hidden />
                  </button>
                ) : null
              }
            >
              {mcpLoading ? (
                <span className={styles.emptyHint}>…</span>
              ) : mcpServers.length === 0 ? (
                <button
                  type="button"
                  className={styles.emptyHint}
                  onClick={() => dataSource?.openMcpSettings?.()}
                >
                  {strings.mcpEmpty}
                  {dataSource?.openMcpSettings
                    ? ` · ${strings.mcpOpenSettings}`
                    : ''}
                </button>
              ) : (
                <div className={styles.rowList}>
                  {mcpServers.slice(0, 4).map((server) => (
                    <button
                      key={server.id}
                      type="button"
                      className={`${styles.mcpRow}${server.enabled ? '' : ` ${styles.mcpRowOff}`}`}
                      title={strings.mcpPolicyHint}
                      onClick={() => void toggleMcpServer(server)}
                    >
                      <span className={styles.rowIcon}>
                        <Plug size={12} strokeWidth={2} aria-hidden />
                      </span>
                      <span className={styles.rowLabel}>{server.name}</span>
                      <span className={styles.mcpStatus}>
                        {server.enabled
                          ? strings.mcpEnabled
                          : strings.mcpDisabled}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SatelliteCard>
          ) : null}

          {rectById.get('skills') ? (
            <SatelliteCard
              side={rectById.get('skills')!.side}
              title={strings.skills}
              tone="skill"
              icon={Sparkles}
              delayMs={150}
              reducedMotion={reducedMotion}
              rect={rectById.get('skills')!}
              dragging={draggingId === 'skills'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('skills')!)
              }
              actions={
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={strings.skillsAdd}
                  title={strings.skillsAdd}
                  onClick={() => void openSkillsPicker()}
                >
                  <Plus size={13} strokeWidth={2} aria-hidden />
                </button>
              }
            >
              {hub.skillIds.length === 0 ? (
                <button
                  type="button"
                  className={styles.emptyHint}
                  onClick={() => void openSkillsPicker()}
                >
                  {strings.skillsEmpty}
                </button>
              ) : (
                <div className={styles.rowList}>
                  {hub.skillIds.slice(0, 3).map((skillId) => (
                    <button
                      key={skillId}
                      type="button"
                      className={`${styles.rowItem}${slashSkills.has(skillId) ? ` ${styles.rowActive}` : ''}`}
                      title={`Remove ${skillId}`}
                      onClick={() =>
                        patch({
                          skillIds: hub.skillIds.filter((id) => id !== skillId),
                        })
                      }
                    >
                      <span className={styles.rowIcon}>
                        <Sparkles size={12} strokeWidth={2} aria-hidden />
                      </span>
                      <span className={styles.rowLabel}>
                        {skillId.replace(/-/g, ' ')} skill
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SatelliteCard>
          ) : null}

          {rectById.get('references') ? (
            <SatelliteCard
              side={rectById.get('references')!.side}
              title={strings.references}
              tone="reference"
              icon={Link2}
              delayMs={150}
              reducedMotion={reducedMotion}
              rect={rectById.get('references')!}
              dragging={draggingId === 'references'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('references')!)
              }
              actions={
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={strings.referencesAddPanel}
                  title={strings.referencesAddPanel}
                  onClick={() => setReferencePanelOpen((open) => !open)}
                >
                  <Plus size={13} strokeWidth={2} aria-hidden />
                </button>
              }
            >
              <div className={styles.refComposer}>
                {hub.references.length === 0 ? (
                  <button
                    type="button"
                    className={styles.emptyHint}
                    onClick={() => setReferencePanelOpen(true)}
                  >
                    {strings.referencesEmpty}
                  </button>
                ) : (
                  <div className={styles.refListScroll}>
                    {hub.references.map((ref) => {
                      if (ref.kind === 'image') {
                        const src = ref.assetPath
                          ? assetResolver?.(ref.assetPath)
                          : ref.url
                        if (src) {
                          return (
                            <button
                              key={ref.id}
                              type="button"
                              className={styles.rowItem}
                              title="Remove"
                              onClick={() => removeReference(ref.id)}
                            >
                              <img
                                className={styles.thumb}
                                src={src}
                                alt={referenceDisplayLabel(ref)}
                              />
                              <span className={styles.rowLabel}>
                                {referenceDisplayLabel(ref)}
                              </span>
                            </button>
                          )
                        }
                      }
                      return (
                        <button
                          key={ref.id}
                          type="button"
                          className={styles.rowItem}
                          title="Remove"
                          onClick={() => removeReference(ref.id)}
                        >
                          <span className={styles.refKindBadge}>
                            {referenceKindLabel(ref.kind, strings)}
                          </span>
                          <span className={styles.rowLabel}>
                            {referenceDisplayLabel(ref)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </SatelliteCard>
          ) : null}

          {referencePanelOpen && rectById.get('references') ? (
            <ReferenceAddPanel
              open={referencePanelOpen}
              anchorRect={rectById.get('references')!}
              hub={hub}
              onHubChange={onHubChange}
              strings={strings}
              dataSource={dataSource}
              onClose={() => setReferencePanelOpen(false)}
              onRemoveReference={removeReference}
            />
          ) : null}

          {hub.subagents.map((slot, index) => {
            const rect = rectById.get(`subagent:${slot.id}`)
            if (!rect) return null
            const link = linkBySlot.get(slot.id)
            const status = link?.status
            const onSegments = segmentCount(status)
            return (
              <SatelliteCard
                key={slot.id}
                side={rect.side}
                title={slot.name || strings.subagent}
                tone="agent"
                icon={Bot}
                delayMs={index * 50}
                reducedMotion={reducedMotion}
                rect={rect}
                dragging={draggingId === rect.id}
                onDragHandlePointerDown={(event) => beginDrag(event, rect)}
                actions={
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={strings.subagentRemove}
                    onClick={() =>
                      patch({
                        subagents: hub.subagents.filter(
                          (item) => item.id !== slot.id,
                        ),
                      })
                    }
                  >
                    <X size={12} strokeWidth={2} aria-hidden />
                  </button>
                }
                footer={
                  <div className={styles.satelliteMeta}>
                    <span
                      className={`${styles.statusDot}${
                        status === 'running'
                          ? ` ${styles.statusDotRunning}`
                          : status === 'done'
                            ? ` ${styles.statusDotDone}`
                            : status === 'error'
                              ? ` ${styles.statusDotError}`
                              : ''
                      }`}
                    />
                    <span>{statusLabel(status, strings)}</span>
                    <div className={styles.segmentTrack} aria-hidden>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`${styles.segment}${i < onSegments ? ` ${styles.segmentOn}` : ''}`}
                        />
                      ))}
                    </div>
                  </div>
                }
              >
                <span className={styles.agentPort} aria-hidden />
                <input
                  className={styles.fieldName}
                  value={slot.name}
                  aria-label={strings.subagentName}
                  onChange={(event) =>
                    patch({
                      subagents: hub.subagents.map((item) =>
                        item.id === slot.id
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <input
                  className={styles.field}
                  value={slot.brief}
                  placeholder={strings.subagentBrief}
                  aria-label={strings.subagentBrief}
                  onChange={(event) =>
                    patch({
                      subagents: hub.subagents.map((item) =>
                        item.id === slot.id
                          ? { ...item, brief: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <label className={styles.toggleRow}>
                  <input
                    type="checkbox"
                    checked={slot.enabled}
                    onChange={(event) =>
                      patch({
                        subagents: hub.subagents.map((item) =>
                          item.id === slot.id
                            ? { ...item, enabled: event.target.checked }
                            : item,
                        ),
                      })
                    }
                  />
                  {strings.subagentEnabled}
                </label>
                {link?.summary ? (
                  <div className={styles.briefLine}>
                    {link.summary.slice(0, 80)}
                  </div>
                ) : null}
              </SatelliteCard>
            )
          })}

          {rectById.get('add-subagent') ? (
            <SatelliteCard
              side={rectById.get('add-subagent')!.side}
              title={strings.subagentAdd}
              tone="agent"
              icon={Plus}
              delayMs={hub.subagents.length * 50}
              reducedMotion={reducedMotion}
              rect={rectById.get('add-subagent')!}
              dragging={draggingId === 'add-subagent'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('add-subagent')!)
              }
            >
              <button
                type="button"
                className={styles.ghostBtn}
                style={{ width: '100%', position: 'relative', height: 28 }}
                onClick={() =>
                  patch({
                    subagents: [
                      ...hub.subagents,
                      {
                        id: createSubagentId(),
                        name: `Agent ${hub.subagents.length + 1}`,
                        brief: '',
                        enabled: true,
                      },
                    ],
                  })
                }
              >
                <Plus size={13} strokeWidth={2} aria-hidden />
                {strings.subagentAdd}
              </button>
            </SatelliteCard>
          ) : null}

          {rectById.get('research') ? (
            <SatelliteCard
              side={rectById.get('research')!.side}
              title={strings.research}
              tone="research"
              icon={Bookmark}
              delayMs={0}
              reducedMotion={reducedMotion}
              rect={rectById.get('research')!}
              dragging={draggingId === 'research'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('research')!)
              }
              actions={
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Refresh research"
                  title="Refresh research"
                  onClick={() => void refreshResearchLines()}
                >
                  <Plus size={13} strokeWidth={2} aria-hidden />
                </button>
              }
            >
              {researchBusy ? (
                <span className={styles.emptyHint}>Researching…</span>
              ) : researchLines.length > 0 ? (
                <div className={styles.rowList}>
                  {researchLines.slice(0, 4).map((line) => (
                    <div key={line} className={styles.rowItem}>
                      <span className={styles.rowIcon}>
                        <Bookmark size={12} strokeWidth={2} aria-hidden />
                      </span>
                      <span className={styles.rowLabel}>{line}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className={styles.emptyHint}>{strings.researchEmpty}</span>
              )}
            </SatelliteCard>
          ) : null}

          {picker && pickerAnchor ? (
            <SatellitePicker
              open
              title={
                picker === 'skills'
                  ? strings.skills
                  : picker === 'folders'
                    ? strings.scopeModeFolders
                    : strings.repo
              }
              items={pickerItems}
              loading={pickerLoading}
              anchorRect={pickerAnchor}
              obstacleRects={pickerObstacles}
              preferredSide={pickerPreferredSide}
              onClose={closePicker}
              onSelect={(id, meta) => void handlePickerSelect(id, meta)}
              allowDrill={picker === 'folders'}
              pathLabel={
                picker === 'folders'
                  ? folderPath
                    ? `/${folderPath}`
                    : '/'
                  : undefined
              }
              onNavigateUp={
                picker === 'folders' && folderPath
                  ? () => {
                      const parts = folderPath.split('/').filter(Boolean)
                      parts.pop()
                      void openFoldersPicker(parts.join('/'))
                    }
                  : undefined
              }
            />
          ) : null}

          <ScopeMapPicker
            open={mapPickerOpen}
            nodes={graphNodes}
            edges={graphEdges}
            loading={graphLoading}
            selectedScopes={hubScopes}
            strings={strings}
            onClose={closeMapPicker}
            onToggleNode={toggleNodeScope}
          />
        </div>
      ) : null}
    </>
  )
}

export function ResearchToggle({
  enabled,
  onChange,
  strings = COMPOSE_HUB_STRINGS_EN,
}: {
  enabled: boolean
  onChange: (next: boolean) => void
  strings?: ComposeHubStrings
}) {
  return (
    <button
      type="button"
      className={`${styles.hubToggle}${enabled ? ` ${styles.hubToggleOn}` : ''}`}
      aria-pressed={enabled}
      onClick={() => onChange(!enabled)}
    >
      {strings.researchToggle}
    </button>
  )
}

export function ensureHub(value: PinComposerHub | undefined): PinComposerHub {
  const defaults = emptyPinComposerHub()
  if (!value) return defaults
  return normalizeHubScopes({
    ...defaults,
    ...value,
    folders: value.folders ?? defaults.folders,
    scopes: value.scopes ?? defaults.scopes,
    skillIds: value.skillIds ?? defaults.skillIds,
    references: value.references ?? defaults.references,
    referenceFolders: value.referenceFolders ?? defaults.referenceFolders,
    subagents: value.subagents ?? defaults.subagents,
  })
}
