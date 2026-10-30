import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import type {
  PinComposerHub,
  PinComposerHubReference,
  PinComposerHubScope,
} from '@contracts/spatial-pin'
import {
  createFolderScopeId,
  emptyPinComposerHub,
  foldersFromScopes,
  formatHubScopeToken,
  normalizeHubScopes,
} from '@contracts/spatial-pin'
import type { ComposeHubStrings } from './composeHubStrings'
import {
  deriveFolderScopesFromReferences,
  mergeFolderScopes,
} from './deriveHubFolders'
import type {
  ComposeHubDataSource,
  HubMcpServerOption,
  HubSkillOption,
} from './hubActions'

export type PickerKind = 'repo' | 'folders' | 'skills' | 'mcp' | null
export type ScopeEntryMode = 'folders' | 'map'

export interface ComposeHubPickerItem {
  id: string
  label: string
  description?: string
  selected?: boolean
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
    mcpServerIds: value.mcpServerIds ?? defaults.mcpServerIds,
    references: value.references ?? defaults.references,
    referenceFolders: value.referenceFolders ?? defaults.referenceFolders,
    subagents: value.subagents ?? defaults.subagents,
  })
}

export function referenceKindLabel(
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

export function referenceDisplayLabel(ref: PinComposerHubReference): string {
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

interface Options {
  hub: PinComposerHub
  onHubChange: (next: PinComposerHub) => void
  dataSource?: ComposeHubDataSource
  strings: ComposeHubStrings
  promptText?: string
  /** When false, skip background refreshes (git/mcp/skills/research). */
  active?: boolean
  researchLines?: readonly string[]
  onResearchLinesChange?: (lines: string[]) => void
}

export function useComposeHubController({
  hub: hubInput,
  onHubChange,
  dataSource,
  strings,
  promptText = '',
  active = true,
  researchLines = [],
  onResearchLinesChange,
}: Options) {
  const hub = ensureHub(hubInput)
  const [picker, setPicker] = useState<PickerKind>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerItems, setPickerItems] = useState<ComposeHubPickerItem[]>([])
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
  const [skillLibrary, setSkillLibrary] = useState<HubSkillOption[]>([])

  const hubScopes = useMemo(() => normalizeHubScopes(hub).scopes, [hub])

  const visibleScopes = useMemo(
    () =>
      hubScopes.filter((scope) =>
        scopeMode === 'folders'
          ? scope.kind === 'folder'
          : scope.kind === 'node',
      ),
    [hubScopes, scopeMode],
  )

  const slashSkills = useMemo(() => {
    const found = new Set<string>()
    for (const match of promptText.matchAll(/(^|\s)\/([a-zA-Z0-9._-]+)/g)) {
      const id = match[2]
      if (id) found.add(id)
    }
    return found
  }, [promptText])

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

  async function refreshSkillLibrary() {
    if (!dataSource?.listSkills) {
      setSkillLibrary([])
      return
    }
    try {
      setSkillLibrary(await dataSource.listSkills())
    } catch {
      setSkillLibrary([])
    }
  }

  async function openSkillsPicker() {
    if (!dataSource?.listSkills) return
    setPicker('skills')
    setPickerLoading(true)
    try {
      const skills = await dataSource.listSkills()
      setSkillLibrary(skills)
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

  async function openMcpPicker() {
    if (!dataSource?.listMcpServers) return
    setPicker('mcp')
    setPickerLoading(true)
    try {
      const servers = await dataSource.listMcpServers()
      setMcpServers(servers)
      setPickerItems(
        servers.map((server) => ({
          id: server.id,
          label: server.name || server.id,
          description: [
            server.transport,
            server.enabled ? strings.mcpEnabled : strings.mcpDisabled,
            server.toolCount !== undefined
              ? `${server.toolCount} tools`
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
          selected: hub.mcpServerIds.includes(server.id),
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

  async function loadMcpServerIntoHub(serverId: string, selected: boolean) {
    if (selected && dataSource?.setMcpServerEnabled) {
      const server = mcpServers.find((item) => item.id === serverId)
      if (server && !server.enabled) {
        const next = await dataSource.setMcpServerEnabled(serverId, true)
        if (next) {
          setMcpServers((prev) =>
            prev.map((item) => (item.id === next.id ? next : item)),
          )
        } else {
          void refreshMcpServers()
        }
      }
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
    if (picker === 'mcp') {
      const selecting = !hub.mcpServerIds.includes(id)
      const next = selecting
        ? [...hub.mcpServerIds, id]
        : hub.mcpServerIds.filter((item) => item !== id)
      patch({ mcpServerIds: next })
      setPickerItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, selected: selecting } : item,
        ),
      )
      await loadMcpServerIntoHub(id, selecting)
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
    }
  }

  useEffect(() => {
    if (!active || !hub.researchEnabled) return
    void refreshResearchLines()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    hub.researchEnabled,
    hub.folders.join('|'),
    hub.skillIds.join('|'),
    promptText,
  ])

  useEffect(() => {
    if (!active) {
      setReferencePanelOpen(false)
      setBranchLocatorOpen(false)
      closePicker()
      setMapPickerOpen(false)
    }
  }, [active, closePicker])

  useEffect(() => {
    if (!active || !dataSource?.getGitStatus) return
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
  }, [active, hub.repo?.label, hub.repo?.branch, dataSource])

  useEffect(() => {
    if (!active) return
    void refreshMcpServers()
    void refreshSkillLibrary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dataSource?.listMcpServers, dataSource?.listSkills])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.references])

  useEffect(() => {
    if (!active || !dataSource?.getGitStatus || !hub.repo) return
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
  }, [active, hub.repo?.label, dataSource])

  return {
    hub,
    patch,
    hubScopes,
    visibleScopes,
    formatHubScopeToken,
    slashSkills,
    picker,
    pickerLoading,
    pickerItems,
    folderPath,
    closePicker,
    openSkillsPicker,
    openMcpPicker,
    openFoldersPicker,
    openRepoPicker,
    handlePickerSelect,
    scopeMode,
    setScopeMode,
    mapPickerOpen,
    openMapPicker,
    closeMapPicker,
    graphNodes,
    graphEdges,
    graphLoading,
    toggleNodeScope,
    removeScope,
    referencePanelOpen,
    setReferencePanelOpen,
    branchLocatorOpen,
    setBranchLocatorOpen,
    liveGitStatus,
    mcpServers,
    mcpLoading,
    skillLibrary,
    removeReference,
    researchBusy,
    researchLines,
    refreshResearchLines,
  }
}
