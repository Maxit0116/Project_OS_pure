import {
  Bookmark,
  ExternalLink,
  Folder,
  GitBranch,
  Layers,
  Link2,
  Minus,
  Plus,
  Plug,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { PinComposerHub } from '@contracts/spatial-pin'
import { useI18n } from '../../../i18n'
import { useWorkbenchStore } from '../../../state/workbenchStore'
import { createWorkbenchComposeHubDataSource } from '../../SpatialComposeHub/createWorkbenchComposeHubDataSource'
import GithubBranchLocator from '../../SpatialComposeHub/GithubBranchLocator'
import type { SatelliteRect } from '../../SpatialComposeHub/hubLayout'
import ReferenceAddPanel from '../../SpatialComposeHub/ReferenceAddPanel'
import { ResearchToggle } from '../../SpatialComposeHub'
import SatellitePicker from '../../SpatialComposeHub/SatellitePicker'
import ScopeMapPicker from '../../SpatialComposeHub/ScopeMapPicker'
import {
  COMPOSER_STAGE_SLOTS,
  stageSlotBadgeCount,
  type ComposerStageSlot,
} from '../../SpatialComposeHub/composerHubPrompt'
import { useComposeHubStrings } from '../../SpatialComposeHub/useComposeHubStrings'
import {
  referenceDisplayLabel,
  referenceKindLabel,
  useComposeHubController,
} from '../../SpatialComposeHub/useComposeHubController'
import styles from './ComposerStageDock.module.css'

export const COMPOSER_STAGE_PANEL_ID = 'composer-stage-panel'

interface Props {
  openSlot: ComposerStageSlot | null
  onOpenSlotChange: (slot: ComposerStageSlot | null) => void
  /** Called when a stage panel opens so Usage card can close. */
  onStageOpen?: () => void
}

const SLOT_META: Record<
  ComposerStageSlot,
  { icon: LucideIcon; labelKey: ComposerStageSlot }
> = {
  repo: { icon: GitBranch, labelKey: 'repo' },
  scope: { icon: Layers, labelKey: 'scope' },
  mcp: { icon: Plug, labelKey: 'mcp' },
  skills: { icon: Sparkles, labelKey: 'skills' },
  references: { icon: Link2, labelKey: 'references' },
  research: { icon: Bookmark, labelKey: 'research' },
}

function toSatelliteRect(
  el: HTMLElement | null,
  side: SatelliteRect['side'] = 'bottom',
): SatelliteRect {
  const rect = el?.getBoundingClientRect()
  const x = rect?.left ?? 0
  const y = rect?.top ?? 0
  const width = rect?.width ?? 240
  const height = rect?.height ?? 120
  return {
    id: 'stage-panel',
    side,
    x,
    y,
    width,
    height,
    hubPoint: { x, y: y + height / 2 },
    satPoint: { x: x + width, y: y + height / 2 },
  }
}

export default function ComposerStageDock({
  openSlot,
  onOpenSlotChange,
  onStageOpen,
}: Props) {
  const { ts } = useI18n()
  const strings = useComposeHubStrings()
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const hub = useWorkbenchStore((s) => s.composerHub)
  const setComposerHub = useWorkbenchStore((s) => s.setComposerHub)
  const composerDraft = useWorkbenchStore((s) => s.composerDraft)
  const [researchLines, setResearchLines] = useState<string[]>([])
  const [hovering, setHovering] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const floatOpenRef = useRef(false)
  const [anchorRect, setAnchorRect] = useState<SatelliteRect>(() =>
    toSatelliteRect(null),
  )

  const dataSource = useMemo(
    () => createWorkbenchComposeHubDataSource({ client, project }),
    [client, project],
  )

  const onHubChange = useCallback(
    (next: PinComposerHub) => {
      setComposerHub(next)
    },
    [setComposerHub],
  )

  const ctrl = useComposeHubController({
    hub,
    onHubChange,
    dataSource,
    strings,
    promptText: composerDraft.text,
    active: true,
    researchLines,
    onResearchLinesChange: setResearchLines,
  })

  const floatOpen =
    Boolean(ctrl.picker) ||
    ctrl.referencePanelOpen ||
    ctrl.branchLocatorOpen ||
    ctrl.mapPickerOpen
  floatOpenRef.current = floatOpen

  const revealed =
    hovering || focusWithin || Boolean(openSlot) || floatOpen

  const activeBadgeCount = useMemo(
    () =>
      COMPOSER_STAGE_SLOTS.reduce(
        (sum, slot) => sum + (stageSlotBadgeCount(slot, ctrl.hub) > 0 ? 1 : 0),
        0,
      ),
    [ctrl.hub],
  )

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const revealStage = useCallback(() => {
    clearHideTimer()
    setHovering(true)
  }, [clearHideTimer])

  const scheduleCollapse = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null
      // Keep stage up while a portaled picker/locator is open.
      if (floatOpenRef.current) return
      setHovering(false)
      setFocusWithin(false)
      onOpenSlotChange(null)
    }, 160)
  }, [clearHideTimer, onOpenSlotChange])

  useEffect(() => {
    return () => clearHideTimer()
  }, [clearHideTimer])

  const prevFloatOpenRef = useRef(false)
  // After a portaled picker closes, collapse if the pointer already left.
  useEffect(() => {
    const wasOpen = prevFloatOpenRef.current
    prevFloatOpenRef.current = floatOpen
    if (wasOpen && !floatOpen && !hovering && !focusWithin) {
      scheduleCollapse()
    }
  }, [floatOpen, hovering, focusWithin, scheduleCollapse])

  const measureAnchor = useCallback(() => {
    setAnchorRect(toSatelliteRect(panelRef.current ?? dockRef.current, 'right'))
  }, [])

  useEffect(() => {
    if (!revealed) return
    measureAnchor()
    const onResize = () => measureAnchor()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [
    revealed,
    openSlot,
    measureAnchor,
    ctrl.picker,
    ctrl.referencePanelOpen,
    ctrl.branchLocatorOpen,
  ])

  useEffect(() => {
    if (!openSlot && !floatOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (
          ctrl.picker ||
          ctrl.referencePanelOpen ||
          ctrl.branchLocatorOpen ||
          ctrl.mapPickerOpen
        ) {
          return
        }
        onOpenSlotChange(null)
        setHovering(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [
    openSlot,
    floatOpen,
    onOpenSlotChange,
    ctrl.picker,
    ctrl.referencePanelOpen,
    ctrl.branchLocatorOpen,
    ctrl.mapPickerOpen,
  ])

  function toggleSlot(slot: ComposerStageSlot) {
    if (openSlot === slot) {
      onOpenSlotChange(null)
      return
    }
    onStageOpen?.()
    onOpenSlotChange(slot)
  }

  function slotTitle(slot: ComposerStageSlot): string {
    switch (slot) {
      case 'repo':
        return strings.repo
      case 'scope':
        return strings.scope
      case 'mcp':
        return strings.mcp
      case 'skills':
        return strings.skills
      case 'references':
        return strings.references
      case 'research':
        return strings.research
    }
  }

  function slotTooltip(slot: ComposerStageSlot): string {
    const title = slotTitle(slot)
    const count = stageSlotBadgeCount(slot, ctrl.hub)
    if (slot === 'repo' && ctrl.hub.repo?.label) {
      const branch = ctrl.hub.repo.branch ? ` · ${ctrl.hub.repo.branch}` : ''
      const dirty = ctrl.liveGitStatus?.dirty ? ` · ${strings.repoDirty}` : ''
      return `${title} · ${ctrl.hub.repo.label}${branch}${dirty}`
    }
    if (slot === 'research') {
      return `${title} · ${ctrl.hub.researchEnabled ? strings.mcpEnabled : strings.mcpDisabled}`
    }
    if (count > 0) return `${title} · ${count}`
    return title
  }

  function renderPanelActions(slot: ComposerStageSlot): ReactNode {
    switch (slot) {
      case 'repo':
        return (
          <>
            {dataSource.listGitBranches ? (
              <button
                type="button"
                className={styles.headerIconBtn}
                aria-label={strings.repoLocate}
                title={strings.repoLocate}
                onClick={() => {
                  measureAnchor()
                  ctrl.setBranchLocatorOpen((open) => !open)
                }}
              >
                <Search size={13} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
            {dataSource.listRepoCandidates || dataSource.getGitStatus ? (
              <button
                type="button"
                className={styles.headerIconBtn}
                aria-label={strings.repo}
                title={strings.repo}
                onClick={() => {
                  measureAnchor()
                  void ctrl.openRepoPicker()
                }}
              >
                <Plus size={13} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
          </>
        )
      case 'scope':
        return (ctrl.scopeMode === 'folders' && dataSource.listDirectories) ||
          (ctrl.scopeMode === 'map' && dataSource.getProjectGraph) ? (
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-label={strings.scopeAdd}
            title={strings.scopeAdd}
            onClick={() => {
              measureAnchor()
              if (ctrl.scopeMode === 'map') void ctrl.openMapPicker()
              else void ctrl.openFoldersPicker(ctrl.folderPath || '')
            }}
          >
            <Plus size={13} strokeWidth={2} aria-hidden />
          </button>
        ) : null
      case 'mcp':
        return (
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-label={strings.mcpAdd}
            title={strings.mcpAdd}
            onClick={() => {
              measureAnchor()
              void ctrl.openMcpPicker()
            }}
          >
            <Plus size={13} strokeWidth={2} aria-hidden />
          </button>
        )
      case 'skills':
        return (
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-label={strings.skillsAdd}
            title={strings.skillsAdd}
            onClick={() => {
              measureAnchor()
              void ctrl.openSkillsPicker()
            }}
          >
            <Plus size={13} strokeWidth={2} aria-hidden />
          </button>
        )
      case 'references':
        return (
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-label={strings.referencesAddPanel}
            title={strings.referencesAddPanel}
            onClick={() => {
              measureAnchor()
              ctrl.setReferencePanelOpen((open) => !open)
            }}
          >
            <Plus size={13} strokeWidth={2} aria-hidden />
          </button>
        )
      case 'research':
        return (
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-label={ts('composer.stageResearchRefresh')}
            title={ts('composer.stageResearchRefresh')}
            onClick={() => void ctrl.refreshResearchLines()}
          >
            <Plus size={13} strokeWidth={2} aria-hidden />
          </button>
        )
    }
  }

  function renderPanelBody(slot: ComposerStageSlot): ReactNode {
    switch (slot) {
      case 'repo':
        return ctrl.hub.repo?.label ? (
          <>
            <button
              type="button"
              className={styles.repoPath}
              onClick={() => void ctrl.openRepoPicker()}
            >
              {ctrl.hub.repo.label}
            </button>
            {ctrl.hub.repo.branch ? (
              <button
                type="button"
                className={styles.branchPill}
                onClick={() =>
                  dataSource.listGitBranches
                    ? ctrl.setBranchLocatorOpen(true)
                    : undefined
                }
              >
                <GitBranch size={10} strokeWidth={2} aria-hidden />
                {ctrl.hub.repo.branch}
              </button>
            ) : null}
            {ctrl.liveGitStatus ? (
              <div className={styles.repoStatusLine}>
                <span>
                  {ctrl.liveGitStatus.dirty
                    ? strings.repoDirty
                    : strings.repoClean}
                </span>
                {ctrl.liveGitStatus.ahead !== undefined ||
                ctrl.liveGitStatus.behind !== undefined ? (
                  <span>
                    ↑{ctrl.liveGitStatus.ahead ?? 0} ↓
                    {ctrl.liveGitStatus.behind ?? 0}
                  </span>
                ) : null}
                {ctrl.hub.repo.prNumber ? (
                  <span>PR #{ctrl.hub.repo.prNumber}</span>
                ) : null}
              </div>
            ) : null}
            <div className={styles.repoActionRow}>
              {ctrl.liveGitStatus?.remoteUrl || dataSource.openExternalUrl ? (
                <button
                  type="button"
                  className={styles.repoActionBtn}
                  onClick={() => {
                    const url = ctrl.liveGitStatus?.remoteUrl
                    if (!url) return
                    const https = url
                      .replace(/^git@github\.com:/i, 'https://github.com/')
                      .replace(/\.git$/i, '')
                    dataSource.openExternalUrl?.(https)
                  }}
                >
                  <ExternalLink size={11} strokeWidth={2} aria-hidden />
                  {strings.repoOpenGithub}
                </button>
              ) : null}
              {dataSource.openGithubGraph ? (
                <button
                  type="button"
                  className={styles.repoActionBtn}
                  onClick={() => dataSource.openGithubGraph?.()}
                >
                  {strings.repoOpenGraph}
                </button>
              ) : null}
              {dataSource.fetchGit ? (
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
            onClick={() => void ctrl.openRepoPicker()}
          >
            {strings.repoEmpty}
          </button>
        )
      case 'scope':
        return (
          <>
            <div className={styles.scopeModeRow} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={ctrl.scopeMode === 'folders'}
                className={`${styles.scopeModeBtn}${ctrl.scopeMode === 'folders' ? ` ${styles.scopeModeBtnActive}` : ''}`}
                onClick={() => {
                  ctrl.setScopeMode('folders')
                  ctrl.closeMapPicker()
                }}
              >
                {strings.scopeModeFolders}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={ctrl.scopeMode === 'map'}
                className={`${styles.scopeModeBtn}${ctrl.scopeMode === 'map' ? ` ${styles.scopeModeBtnActive}` : ''}`}
                onClick={() => {
                  ctrl.setScopeMode('map')
                  ctrl.closePicker()
                }}
              >
                {strings.scopeModeMap}
              </button>
            </div>
            {ctrl.visibleScopes.length === 0 ? (
              <span className={styles.emptyHint}>{strings.scopeEmpty}</span>
            ) : (
              <div className={styles.rowList}>
                {ctrl.visibleScopes.map((scope, scopeIndex) => (
                  <button
                    key={scope.id}
                    type="button"
                    className={styles.rowItem}
                    title={`Remove ${ctrl.formatHubScopeToken(scope)}`}
                    onClick={() => ctrl.removeScope(scope.id)}
                  >
                    <span className={styles.rowIcon}>
                      {scope.kind === 'folder' ? (
                        <Folder size={12} strokeWidth={2} aria-hidden />
                      ) : (
                        <Layers size={12} strokeWidth={2} aria-hidden />
                      )}
                    </span>
                    <span className={styles.rowLabel}>
                      {ctrl.formatHubScopeToken(scope)}
                    </span>
                    <span className={styles.rowBadge}>{scopeIndex + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )
      case 'mcp':
        return ctrl.mcpLoading ? (
          <span className={styles.emptyHint}>…</span>
        ) : ctrl.hub.mcpServerIds.length === 0 ? (
          <button
            type="button"
            className={styles.emptyHint}
            onClick={() => {
              if (ctrl.mcpServers.length === 0 && dataSource.openMarketplace) {
                dataSource.openMarketplace('mcp')
                return
              }
              void ctrl.openMcpPicker()
            }}
          >
            {ctrl.mcpServers.length === 0
              ? strings.mcpLibraryEmpty
              : strings.mcpEmpty}
          </button>
        ) : (
          <div className={styles.rowList}>
            {ctrl.hub.mcpServerIds.map((serverId) => {
              const server = ctrl.mcpServers.find((item) => item.id === serverId)
              return (
                <button
                  key={serverId}
                  type="button"
                  className={`${styles.rowItem}${server && !server.enabled ? ` ${styles.mcpRowOff}` : ''}`}
                  title={strings.mcpPolicyHint}
                  onClick={() =>
                    ctrl.patch({
                      mcpServerIds: ctrl.hub.mcpServerIds.filter(
                        (id) => id !== serverId,
                      ),
                    })
                  }
                >
                  <span className={styles.rowIcon}>
                    <Plug size={12} strokeWidth={2} aria-hidden />
                  </span>
                  <span className={styles.rowLabel}>
                    {server?.name ?? serverId}
                  </span>
                  <span className={styles.mcpStatus}>
                    {server?.enabled ? strings.mcpEnabled : strings.mcpDisabled}
                  </span>
                </button>
              )
            })}
          </div>
        )
      case 'skills':
        return ctrl.hub.skillIds.length === 0 ? (
          <button
            type="button"
            className={styles.emptyHint}
            onClick={() => {
              if (
                ctrl.skillLibrary.length === 0 &&
                dataSource.openMarketplace
              ) {
                dataSource.openMarketplace('skills')
                return
              }
              void ctrl.openSkillsPicker()
            }}
          >
            {ctrl.skillLibrary.length === 0
              ? strings.skillsLibraryEmpty
              : strings.skillsEmpty}
          </button>
        ) : (
          <div className={styles.rowList}>
            {ctrl.hub.skillIds.map((skillId) => {
              const skill = ctrl.skillLibrary.find((item) => item.id === skillId)
              return (
                <button
                  key={skillId}
                  type="button"
                  className={`${styles.rowItem}${ctrl.slashSkills.has(skillId) ? ` ${styles.rowActive}` : ''}`}
                  title={`Remove ${skill?.name ?? skillId}`}
                  onClick={() =>
                    ctrl.patch({
                      skillIds: ctrl.hub.skillIds.filter((id) => id !== skillId),
                    })
                  }
                >
                  <span className={styles.rowIcon}>
                    <Sparkles size={12} strokeWidth={2} aria-hidden />
                  </span>
                  <span className={styles.rowLabel}>
                    {skill?.name ?? skillId}
                  </span>
                </button>
              )
            })}
          </div>
        )
      case 'references':
        return ctrl.hub.references.length === 0 ? (
          <button
            type="button"
            className={styles.emptyHint}
            onClick={() => ctrl.setReferencePanelOpen(true)}
          >
            {strings.referencesEmpty}
          </button>
        ) : (
          <div className={styles.rowList}>
            {ctrl.hub.references.map((ref) => {
              if (ref.kind === 'image') {
                const src = ref.assetPath
                  ? dataSource.resolveAssetUrl?.(ref.assetPath)
                  : ref.url
                if (src) {
                  return (
                    <button
                      key={ref.id}
                      type="button"
                      className={styles.rowItem}
                      title="Remove"
                      onClick={() => ctrl.removeReference(ref.id)}
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
                  onClick={() => ctrl.removeReference(ref.id)}
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
        )
      case 'research':
        return (
          <>
            <ResearchToggle
              enabled={ctrl.hub.researchEnabled}
              onChange={(next) => ctrl.patch({ researchEnabled: next })}
              strings={strings}
            />
            {ctrl.researchBusy ? (
              <span className={styles.emptyHint}>
                {ts('composer.stageResearchBusy')}
              </span>
            ) : researchLines.length > 0 ? (
              <div className={styles.rowList}>
                {researchLines.slice(0, 6).map((line) => (
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
          </>
        )
    }
  }

  const pickerTitle =
    ctrl.picker === 'skills'
      ? strings.skills
      : ctrl.picker === 'mcp'
        ? strings.mcp
        : ctrl.picker === 'folders'
          ? strings.scopeModeFolders
          : strings.repo

  const floatPortal =
    typeof document !== 'undefined' &&
    (ctrl.picker ||
      ctrl.referencePanelOpen ||
      ctrl.branchLocatorOpen ||
      ctrl.mapPickerOpen)
      ? createPortal(
          <div id="composer-stage-float" className={styles.floatLayer}>
            {ctrl.picker ? (
              <SatellitePicker
                open
                title={pickerTitle}
                items={ctrl.pickerItems}
                loading={ctrl.pickerLoading}
                emptyLabel={
                  ctrl.picker === 'skills'
                    ? strings.skillsLibraryEmpty
                    : ctrl.picker === 'mcp'
                      ? strings.mcpLibraryEmpty
                      : undefined
                }
                anchorRect={anchorRect}
                preferredSide="above"
                onClose={ctrl.closePicker}
                onSelect={(id, meta) => void ctrl.handlePickerSelect(id, meta)}
                allowDrill={ctrl.picker === 'folders'}
                pathLabel={
                  ctrl.picker === 'folders' ? ctrl.folderPath || '/' : undefined
                }
                onNavigateUp={
                  ctrl.picker === 'folders'
                    ? () => {
                        const parts = ctrl.folderPath
                          .split('/')
                          .filter(Boolean)
                        parts.pop()
                        void ctrl.openFoldersPicker(parts.join('/'))
                      }
                    : undefined
                }
              />
            ) : null}
            {ctrl.branchLocatorOpen ? (
              <GithubBranchLocator
                open={ctrl.branchLocatorOpen}
                anchorRect={anchorRect}
                hub={ctrl.hub}
                onHubChange={onHubChange}
                strings={strings}
                dataSource={dataSource}
                onClose={() => ctrl.setBranchLocatorOpen(false)}
              />
            ) : null}
            {ctrl.referencePanelOpen ? (
              <ReferenceAddPanel
                open={ctrl.referencePanelOpen}
                anchorRect={anchorRect}
                hub={ctrl.hub}
                onHubChange={onHubChange}
                strings={strings}
                dataSource={dataSource}
                onClose={() => ctrl.setReferencePanelOpen(false)}
                onRemoveReference={ctrl.removeReference}
              />
            ) : null}
            {ctrl.mapPickerOpen ? (
              <ScopeMapPicker
                open={ctrl.mapPickerOpen}
                nodes={ctrl.graphNodes}
                edges={ctrl.graphEdges}
                loading={ctrl.graphLoading}
                selectedScopes={ctrl.hubScopes}
                strings={strings}
                onClose={ctrl.closeMapPicker}
                onToggleNode={ctrl.toggleNodeScope}
              />
            ) : null}
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={dockRef}
      className={`${styles.dock}${revealed ? ` ${styles.dockRevealed}` : ''}`}
      onMouseEnter={revealStage}
      onMouseLeave={scheduleCollapse}
      onFocusCapture={() => {
        clearHideTimer()
        setFocusWithin(true)
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && dockRef.current?.contains(next)) return
        setFocusWithin(false)
        if (!hovering && !floatOpenRef.current) scheduleCollapse()
      }}
    >
      <div
        className={styles.hotZone}
        aria-label={ts('composer.stageDockHotZone')}
        title={ts('composer.stageDockHotZone')}
      >
        <span
          className={`${styles.peep}${activeBadgeCount > 0 ? ` ${styles.peepHasBadges}` : ''}`}
          aria-hidden
        />
        {activeBadgeCount > 0 && !revealed ? (
          <span className={styles.peepDots} aria-hidden>
            {Array.from({ length: Math.min(activeBadgeCount, 4) }, (_, i) => (
              <span key={i} className={styles.peepDot} />
            ))}
          </span>
        ) : null}
      </div>

      <div
        className={`${styles.stagePopup}${revealed ? '' : ` ${styles.stagePopupHidden}`}`}
        aria-hidden={!revealed}
      >
        {openSlot ? (
          <div
            ref={panelRef}
            id={COMPOSER_STAGE_PANEL_ID}
            className={styles.panel}
            role="dialog"
            aria-label={slotTitle(openSlot)}
          >
            <div className={styles.panelHeader}>
              <div className={styles.panelTitleRow}>
                {(() => {
                  const Icon = SLOT_META[openSlot].icon
                  return <Icon size={14} strokeWidth={2} aria-hidden />
                })()}
                <span className={styles.panelTitle}>{slotTitle(openSlot)}</span>
              </div>
              <div className={styles.panelActions}>
                {renderPanelActions(openSlot)}
                <button
                  type="button"
                  className={styles.headerIconBtn}
                  onClick={() => onOpenSlotChange(null)}
                  aria-label={ts('context.collapse')}
                  title={ts('context.collapse')}
                >
                  <Minus size={14} strokeWidth={2.25} aria-hidden />
                </button>
              </div>
            </div>
            <div className={styles.panelBody}>{renderPanelBody(openSlot)}</div>
          </div>
        ) : null}

        <div
          className={styles.rail}
          role="toolbar"
          aria-label={ts('composer.stageDockLabel')}
        >
          {COMPOSER_STAGE_SLOTS.map((slot) => {
            const Icon = SLOT_META[slot].icon
            const count = stageSlotBadgeCount(slot, ctrl.hub)
            const active = openSlot === slot
            return (
              <button
                key={slot}
                type="button"
                tabIndex={revealed ? 0 : -1}
                className={`${styles.iconBtn}${active ? ` ${styles.iconBtnActive}` : ''}`}
                aria-label={slotTooltip(slot)}
                aria-pressed={active}
                aria-controls={active ? COMPOSER_STAGE_PANEL_ID : undefined}
                title={slotTooltip(slot)}
                onClick={() => toggleSlot(slot)}
              >
                <Icon size={14} strokeWidth={2} aria-hidden />
                {count > 0 ? (
                  <span
                    className={`${styles.badge}${count === 1 && (slot === 'repo' || slot === 'research') ? ` ${styles.badgeDot}` : ''}`}
                  >
                    {count === 1 && (slot === 'repo' || slot === 'research')
                      ? null
                      : count > 9
                        ? '9+'
                        : count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      {floatPortal}
    </div>
  )
}
