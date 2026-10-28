import {
  Bookmark,
  Bot,
  Folder,
  GitBranch,
  Image as ImageIcon,
  Plus,
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
  PinComposerHubSubagentLink,
  ScreenRect,
} from '@contracts/spatial-pin'
import { emptyPinComposerHub } from '@contracts/spatial-pin'
import { useReducedMotion3d } from '../FunctionMap/hooks/useReducedMotion3d'
import {
  COMPOSE_HUB_STRINGS_EN,
  type ComposeHubStrings,
} from './composeHubStrings'
import type { ComposeHubDataSource } from './hubActions'
import {
  attachPointsForSatellite,
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
import SatelliteCard from './SatelliteCard'
import SatelliteConnector from './SatelliteConnector'
import SatellitePicker from './SatellitePicker'
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

type PickerKind = 'repo' | 'folders' | 'skills' | 'references' | null

function createSubagentId(): string {
  return `sub_${crypto.randomUUID().slice(0, 8)}`
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
  hub,
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
  const [researchBusy, setResearchBusy] = useState(false)

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
      { id: 'folders', side: 'left', index: 1, count: 4 },
      { id: 'skills', side: 'left', index: 2, count: 4 },
      { id: 'references', side: 'left', index: 3, count: 4 },
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
    if (hub.researchEnabled) {
      slots.push({ id: 'research', side: 'bottom', index: 0, count: 1 })
    }
    return slots
  }, [expanded, hub.researchEnabled, hub.subagents])

  const baseRects = useMemo(
    () => layoutSatellites(card, layoutSlots),
    [card, layoutSlots],
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

  const closePicker = useCallback(() => {
    setPicker(null)
    setPickerItems([])
    setPickerLoading(false)
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
    setPicker('folders')
    setFolderPath(path)
    setPickerLoading(true)
    try {
      const dirs = await dataSource.listDirectories(path)
      setPickerItems(
        dirs.map((dir) => ({
          id: dir.path,
          label: dir.name,
          description: dir.path,
          selected: hub.folders.includes(dir.path),
        })),
      )
    } catch {
      setPickerItems([])
    } finally {
      setPickerLoading(false)
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

  async function openReferencesPicker() {
    if (!dataSource?.listMentionFiles) return
    setPicker('references')
    setPickerLoading(true)
    try {
      const query = promptText.trim().slice(0, 40) || ''
      const files = await dataSource.listMentionFiles(query)
      setPickerItems(
        files.slice(0, 40).map((path) => ({
          id: path,
          label: path.split('/').pop() ?? path,
          description: path,
          selected: hub.references.some(
            (ref) => ref.kind === 'file' && ref.path === path,
          ),
        })),
      )
    } catch {
      setPickerItems([])
    } finally {
      setPickerLoading(false)
    }
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
      const next = hub.folders.includes(id)
        ? hub.folders.filter((item) => item !== id)
        : [...hub.folders, id]
      patch({ folders: next })
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
    if (picker === 'references') {
      const existing = hub.references.find(
        (ref) => ref.kind === 'file' && ref.path === id,
      )
      if (existing) {
        patch({
          references: hub.references.filter((ref) => ref.id !== existing.id),
        })
      } else {
        patch({
          references: [
            ...hub.references,
            {
              kind: 'file' as const,
              id: `ref_file_${crypto.randomUUID().slice(0, 8)}`,
              path: id,
              label: id.split('/').pop() ?? id,
            },
          ],
        })
      }
      setPickerItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, selected: !item.selected } : item,
        ),
      )
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

  const pickerAnchor =
    (picker && rectById.get(picker)) ||
    (picker === 'folders' ? rectById.get('folders') : null)

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
                dataSource?.listRepoCandidates || dataSource?.getGitStatus ? (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={strings.repo}
                    title={strings.repo}
                    onClick={() => void openRepoPicker()}
                  >
                    <Plus size={13} strokeWidth={2} aria-hidden />
                  </button>
                ) : null
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
                    <span className={styles.branchPill}>
                      <GitBranch size={10} strokeWidth={2} aria-hidden />
                      {hub.repo.branch}
                    </span>
                  ) : null}
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

          {rectById.get('folders') ? (
            <SatelliteCard
              side={rectById.get('folders')!.side}
              title={strings.folders}
              tone="folder"
              icon={Folder}
              delayMs={50}
              reducedMotion={reducedMotion}
              rect={rectById.get('folders')!}
              dragging={draggingId === 'folders'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('folders')!)
              }
              actions={
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={strings.foldersAdd}
                  title={strings.foldersAdd}
                  onClick={() => void openFoldersPicker(folderPath || '')}
                >
                  <Plus size={13} strokeWidth={2} aria-hidden />
                </button>
              }
            >
              {hub.folders.length === 0 ? (
                <button
                  type="button"
                  className={styles.emptyHint}
                  onClick={() => void openFoldersPicker('')}
                >
                  {strings.foldersEmpty}
                </button>
              ) : (
                <div className={styles.rowList}>
                  {hub.folders.slice(0, 3).map((folder, folderIndex) => (
                    <button
                      key={folder}
                      type="button"
                      className={styles.rowItem}
                      title={`Remove ${folder}`}
                      onClick={() =>
                        patch({
                          folders: hub.folders.filter((item) => item !== folder),
                        })
                      }
                    >
                      <span className={styles.rowIcon}>
                        <Folder size={12} strokeWidth={2} aria-hidden />
                      </span>
                      <span className={styles.rowLabel}>{folder}</span>
                      <span className={styles.rowBadge}>{folderIndex + 1}</span>
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
              delayMs={100}
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
              icon={ImageIcon}
              delayMs={150}
              reducedMotion={reducedMotion}
              rect={rectById.get('references')!}
              dragging={draggingId === 'references'}
              onDragHandlePointerDown={(event) =>
                beginDrag(event, rectById.get('references')!)
              }
              actions={
                dataSource?.listMentionFiles ? (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={strings.references}
                    onClick={() => void openReferencesPicker()}
                  >
                    <Plus size={13} strokeWidth={2} aria-hidden />
                  </button>
                ) : null
              }
            >
              {hub.references.length === 0 ? (
                <button
                  type="button"
                  className={styles.emptyHint}
                  onClick={() => void openReferencesPicker()}
                >
                  {strings.referencesEmpty}
                </button>
              ) : (
                <div className={styles.thumbRow}>
                  {hub.references.slice(0, 3).map((ref) => {
                    if (ref.kind === 'image') {
                      const src = assetResolver?.(ref.assetPath)
                      return src ? (
                        <img
                          key={ref.id}
                          className={styles.thumb}
                          src={src}
                          alt={ref.label ?? ref.assetPath}
                        />
                      ) : (
                        <button
                          key={ref.id}
                          type="button"
                          className={styles.thumbPlaceholder}
                          title="Remove"
                          onClick={() =>
                            patch({
                              references: hub.references.filter(
                                (item) => item.id !== ref.id,
                              ),
                            })
                          }
                        >
                          {ref.label?.slice(0, 4) ?? 'img'}
                        </button>
                      )
                    }
                    return (
                      <button
                        key={ref.id}
                        type="button"
                        className={styles.chip}
                        title="Remove"
                        onClick={() =>
                          patch({
                            references: hub.references.filter(
                              (item) => item.id !== ref.id,
                            ),
                          })
                        }
                      >
                        {ref.label ?? ref.path.split('/').pop() ?? ref.path}
                      </button>
                    )
                  })}
                </div>
              )}
            </SatelliteCard>
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
                    ? strings.folders
                    : picker === 'repo'
                      ? strings.repo
                      : strings.references
              }
              items={pickerItems}
              loading={pickerLoading}
              anchorRect={pickerAnchor}
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
  return value ?? emptyPinComposerHub()
}
