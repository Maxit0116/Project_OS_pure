import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import type { MapArtifact, MapArtifactType } from '@contracts/index'
import { MAP_ARTIFACT_MAX_SIZE, MAP_ARTIFACT_MIN_SIZES } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { handleArtifactWheelNative } from './artifactWheelScroll'
import {
  getMapArtifactDisplayTitle,
  getMapArtifactStoredTitle,
} from './mapArtifactTitle'
import MapArtifactResizer from './MapArtifactResizer'
import MapArtifactTabStrip from './MapArtifactTabStrip'
import {
  measureAutoFitContentHeight,
  type AutoFitElementLike,
} from './mapArtifactAutoFit'
import type { MapArtifactResizeEndParams } from './useMapArtifactPointerResize'
import styles from './mapArtifactNodes.module.css'

const AUTO_GROW_TYPES = new Set<MapArtifactType>(['plan', 'acceptance_list', 'urls'])

interface Props {
  artifact: MapArtifact
  artifactType: MapArtifactType
  typeIcon: ReactNode
  scopeLabel: string
  isSelected: boolean
  linked: boolean
  dimmed: boolean
  children: ReactNode
  bodyClassName?: string
  /** When true, wheel events bubble to the canvas for zoom (e.g. image cards). */
  bodyWheelZoom?: boolean
  onHeaderContextMenu?: (event: ReactMouseEvent) => void
  stackNodeId?: string
  stackMembers?: MapArtifact[]
  onStackSelect?: (artifactId: string) => void
  onStackClose?: (artifactId: string) => void
  onStackDetach?: (artifactId: string, screenPoint: { x: number; y: number }) => void
  onStackMerge?: (artifactId: string, targetNodeId: string) => void
  onStackReorder?: (orderedIds: string[]) => void
  onGeometryResizeStart?: (memberNodeId: string) => void
  onGeometryResize?: (memberNodeId: string, params: MapArtifactResizeEndParams) => void
  onGeometryResizeEnd?: (memberNodeId: string, params: MapArtifactResizeEndParams) => void | Promise<void>
}

export default function MapArtifactChrome({
  artifact,
  artifactType,
  typeIcon,
  scopeLabel,
  isSelected,
  linked,
  dimmed,
  children,
  bodyClassName,
  bodyWheelZoom = false,
  onHeaderContextMenu,
  stackNodeId,
  stackMembers,
  onStackSelect,
  onStackClose,
  onStackDetach,
  onStackMerge,
  onStackReorder,
  onGeometryResizeStart,
  onGeometryResize,
  onGeometryResizeEnd,
}: Props) {
  const deleteMapArtifact = useWorkbenchStore((s) => s.deleteMapArtifact)
  const updateMapArtifact = useWorkbenchStore((s) => s.updateMapArtifact)
  const applyMapWorkGroupMutation = useWorkbenchStore((s) => s.applyMapWorkGroupMutation)
  const { ts } = useI18n()
  const [isHovered, setIsHovered] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const untitledLabel = ts('mapArtifacts.untitledTitle')
  const storedTitle = getMapArtifactStoredTitle(artifact)
  const displayTitle = getMapArtifactDisplayTitle(artifact, untitledLabel)
  const showUntitledPlaceholder = artifact.type !== 'image' && !storedTitle

  useEffect(() => {
    if (bodyWheelZoom) return

    const body = bodyRef.current
    if (!body) return

    body.addEventListener('wheel', handleArtifactWheelNative, false)
    return () => body.removeEventListener('wheel', handleArtifactWheelNative, false)
  }, [bodyWheelZoom])

  const shouldAutoFit = AUTO_GROW_TYPES.has(artifactType)

  const lastAutoFitHeight = useRef(artifact.size.height)

  const tryAutoFit = useCallback(() => {
    const body = bodyRef.current
    if (!body) return

    const chromeShell = body.previousElementSibling as HTMLElement | null
    const chromeH = chromeShell?.offsetHeight ?? 0
    const BODY_PADDING = 20
    const NODE_BORDER = 2

    const contentH = measureAutoFitContentHeight(
      body.children as unknown as ArrayLike<AutoFitElementLike>,
      styles.criteriaList,
    )

    const idealH = chromeH + BODY_PADDING + contentH + NODE_BORDER
    const minH = MAP_ARTIFACT_MIN_SIZES[artifactType].height
    const clampedH = Math.round(Math.max(minH, Math.min(idealH, MAP_ARTIFACT_MAX_SIZE.height)))

    if (Math.abs(clampedH - artifact.size.height) < 4) return
    if (clampedH === lastAutoFitHeight.current) return

    lastAutoFitHeight.current = clampedH

    void updateMapArtifact(artifact.id, {
      size: { width: artifact.size.width, height: clampedH },
    })
  }, [artifact.id, artifact.size.height, artifact.size.width, artifactType, updateMapArtifact])

  useEffect(() => {
    if (!shouldAutoFit) return
    const body = bodyRef.current
    if (!body) return

    lastAutoFitHeight.current = artifact.size.height

    let rafId: number | null = null
    const scheduleCheck = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        tryAutoFit()
      })
    }

    const observer = new MutationObserver(scheduleCheck)
    observer.observe(body, { childList: true, subtree: true, characterData: true })

    scheduleCheck()

    return () => {
      observer.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [shouldAutoFit, tryAutoFit, artifact.size.height])

  const minSize = MAP_ARTIFACT_MIN_SIZES[artifactType]
  const showResize = isSelected || isHovered
  const dropTargetId = stackNodeId ?? artifact.id
  const showTabStrip =
    stackMembers &&
    stackMembers.length >= 1 &&
    stackNodeId &&
    onStackSelect &&
    onStackClose &&
    onStackDetach &&
    onStackMerge

  const handleHeaderContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onHeaderContextMenu?.(event)
  }

  return (
    <div
      className={`${styles.root} ${showTabStrip ? styles.rootWithTabs : ''} ${showResize ? styles.resizeActive : ''}`}
      data-zone-interactive
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={(event) => {
        const flowNode = event.currentTarget.closest('.react-flow__node')
        if (flowNode?.classList.contains('dragging')) return
        setIsHovered(false)
      }}
    >
      <div
        className={`${styles.node} ${showTabStrip ? styles.nodeWithTabs : ''} ${isSelected ? styles.selected : ''} ${linked ? styles.linked : ''} ${dimmed ? styles.dimmed : ''}`}
        aria-label={ts('mapArtifacts.resizeCard')}
      >
        <Handle type="target" position={Position.Top} className={styles.handleHidden} />
        <Handle type="source" position={Position.Bottom} className={styles.handleHidden} />

        <div
          className={`${styles.chromeShell} ${showTabStrip ? styles.chromeShellWithTabs : ''}`}
        >
          {showTabStrip && (
            <MapArtifactTabStrip
              members={stackMembers}
              activeId={artifact.id}
              stackNodeId={stackNodeId}
              onSelect={onStackSelect}
              onClose={onStackClose}
              onDetach={onStackDetach}
              onMerge={onStackMerge}
              onReorder={onStackReorder}
            />
          )}
          <div className={styles.header} onContextMenu={handleHeaderContextMenu}>
            <span className={styles.typeIcon} aria-hidden>
              {typeIcon}
            </span>
            <div className={styles.headerTitle}>
              <span
                className={`${styles.headerTitleText}${showUntitledPlaceholder ? ` ${styles.headerTitlePlaceholder}` : ''}`}
                title={displayTitle}
              >
                {displayTitle}
              </span>
            </div>
            <span className={styles.scopeChip} title={scopeLabel}>
              {scopeLabel}
            </span>
            <button
              type="button"
              className={`${styles.deleteBtn} nodrag nopan`}
              aria-label={ts('mapArtifacts.delete')}
              title={ts('mapArtifacts.delete')}
              onContextMenu={(event) => event.stopPropagation()}
              onClick={() => void deleteMapArtifact(artifact.id)}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div
          ref={bodyRef}
          className={`${styles.body}${bodyWheelZoom ? '' : ' nowheel'} ${bodyClassName ?? ''}`}
        >
          {children}
        </div>
      </div>

      <MapArtifactResizer
        flowNodeId={dropTargetId}
        minWidth={minSize.width}
        minHeight={minSize.height}
        maxWidth={MAP_ARTIFACT_MAX_SIZE.width}
        maxHeight={MAP_ARTIFACT_MAX_SIZE.height}
        onResizeStart={() => {
          onGeometryResizeStart?.(dropTargetId)
        }}
        onResize={(params) => {
          onGeometryResize?.(dropTargetId, params)
        }}
        onResizeEnd={({ x, y, width, height }) => {
          if (onGeometryResizeEnd) {
            void onGeometryResizeEnd(dropTargetId, { x, y, width, height })
            return
          }
          if (artifact.workGroupId) {
            void applyMapWorkGroupMutation({
              type: 'resize_member',
              memberNodeId: dropTargetId,
              size: { width, height },
              position: { x, y },
            })
            return
          }
          void updateMapArtifact(artifact.id, {
            size: { width, height },
            position: { x, y },
          })
        }}
      />
    </div>
  )
}

export interface MapArtifactNodeData {
  artifact: MapArtifact
  artifactId: string
  scopeLabel: string
  isSelected: boolean
  linked: boolean
  dimmed: boolean
  onHeaderContextMenu?: (event: ReactMouseEvent) => void
  onGeometryResizeStart?: (memberNodeId: string) => void
  onGeometryResize?: (memberNodeId: string, params: MapArtifactResizeEndParams) => void
  onGeometryResizeEnd?: (
    memberNodeId: string,
    params: MapArtifactResizeEndParams,
  ) => void | Promise<void>
}
