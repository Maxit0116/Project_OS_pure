import { ChevronRight, Layers, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  ArchitectureLevel,
  FunctionalEdge,
  FunctionalNode,
} from '@contracts/index'
import {
  createNodeScopeId,
  resolveNodeScopePaths,
  type PinComposerHubScope,
} from '@contracts/spatial-pin'
import { buildDiagram } from '../FunctionMap/c4/buildDiagram'
import { applyElkLayoutToDiagram } from '../FunctionMap/c4/layoutWithElk'
import type { C4Diagram } from '../FunctionMap/c4/types'
import type { ComposeHubStrings } from './composeHubStrings'
import ScopeC4Graph from './ScopeC4Graph'
import styles from './hubMotion.module.css'

const LEVELS: ArchitectureLevel[] = [
  'context',
  'container',
  'component',
  'code',
]

interface BreadcrumbEntry {
  nodeId: string | null
  label: string
  level: ArchitectureLevel
}

interface Props {
  open: boolean
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  loading?: boolean
  selectedScopes: readonly PinComposerHubScope[]
  strings: ComposeHubStrings
  onClose: () => void
  onToggleNode: (scope: PinComposerHubScope) => void
}

function levelLabel(
  level: ArchitectureLevel,
  strings: ComposeHubStrings,
): string {
  switch (level) {
    case 'context':
      return strings.scopeMapLevelContext
    case 'container':
      return strings.scopeMapLevelContainer
    case 'component':
      return strings.scopeMapLevelComponent
    case 'code':
      return strings.scopeMapLevelCode
    default:
      return level
  }
}

function nextLevel(level: ArchitectureLevel): ArchitectureLevel | null {
  const index = LEVELS.indexOf(level)
  if (index < 0 || index >= LEVELS.length - 1) return null
  return LEVELS[index + 1]!
}

export default function ScopeMapPicker({
  open,
  nodes,
  edges,
  loading = false,
  selectedScopes,
  strings,
  onClose,
  onToggleNode,
}: Props) {
  const [level, setLevel] = useState<ArchitectureLevel>('context')
  const [parentId, setParentId] = useState<string | null>(null)
  const [trail, setTrail] = useState<BreadcrumbEntry[]>([
    { nodeId: null, label: levelLabel('context', strings), level: 'context' },
  ])
  const [laidOutDiagram, setLaidOutDiagram] = useState<C4Diagram | null>(null)
  const [layoutBusy, setLayoutBusy] = useState(false)

  const selectedNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const scope of selectedScopes) {
      if (scope.kind === 'node') ids.add(scope.nodeId)
    }
    return ids
  }, [selectedScopes])

  const nodeById = useMemo(() => {
    const map = new Map(nodes.map((node) => [node.id, node]))
    return map
  }, [nodes])

  /** Same pre-ELK diagram Function Map builds for the active C4 level/scope. */
  const diagramBase = useMemo(() => {
    if (!open || nodes.length === 0) return null
    try {
      return buildDiagram({
        level,
        nodes,
        edges,
        scope: parentId ? { parentId } : {},
      })
    } catch {
      return null
    }
  }, [open, nodes, edges, level, parentId])

  // Function Map path: buildDiagram → applyElkLayoutToDiagram → render.
  useEffect(() => {
    if (!open || !diagramBase) {
      setLaidOutDiagram(null)
      setLayoutBusy(false)
      return
    }
    let cancelled = false
    setLayoutBusy(true)
    setLaidOutDiagram(null)
    void applyElkLayoutToDiagram(diagramBase).then((laidOut) => {
      if (cancelled) return
      setLaidOutDiagram(laidOut)
      setLayoutBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, diagramBase])

  useEffect(() => {
    if (!open) return
    setLevel('context')
    setParentId(null)
    setTrail([
      {
        nodeId: null,
        label: levelLabel('context', strings),
        level: 'context',
      },
    ])
  }, [open, strings])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  function jumpTo(entry: BreadcrumbEntry, index: number) {
    setLevel(entry.level)
    setParentId(entry.nodeId)
    setTrail((prev) => prev.slice(0, index + 1))
  }

  function selectLevel(next: ArchitectureLevel) {
    setLevel(next)
    setParentId(null)
    setTrail([
      {
        nodeId: null,
        label: levelLabel(next, strings),
        level: next,
      },
    ])
  }

  function drillInto(nodeId: string) {
    const childLevel = nextLevel(level)
    if (!childLevel) return
    const node = nodeById.get(nodeId)
    if (!node || (node.children?.length ?? 0) === 0) return
    setLevel(childLevel)
    setParentId(node.id)
    setTrail((prev) => [
      ...prev,
      { nodeId: node.id, label: node.name, level: childLevel },
    ])
  }

  function toggle(nodeId: string) {
    const node = nodeById.get(nodeId)
    if (!node) return
    const resolved = resolveNodeScopePaths(nodes, node.id)
    onToggleNode({
      kind: 'node',
      id: createNodeScopeId(node.id),
      nodeId: node.id,
      label: node.name,
      level: node.level ?? level,
      paths: resolved.paths,
    })
  }

  const showLoading = loading || layoutBusy || (Boolean(diagramBase) && !laidOutDiagram)
  const showEmpty =
    !loading &&
    !layoutBusy &&
    (!diagramBase || diagramBase.nodes.length === 0)

  const content = (
    <div
      className={styles.scopeMapBackdrop}
      data-scope-map-picker="true"
      role="presentation"
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={styles.scopeMapModal}
        role="dialog"
        aria-modal="true"
        aria-label={strings.scopeMapTitle}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={styles.scopeMapHeader}>
          <span className={styles.scopeMapTitle}>
            <Layers size={14} strokeWidth={2} aria-hidden />
            {strings.scopeMapTitle}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={strings.scopeMapDone}
            title={strings.scopeMapDone}
            onClick={onClose}
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className={styles.scopeMapLevels} role="tablist">
          {LEVELS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={level === item}
              className={`${styles.scopeMapLevel}${level === item ? ` ${styles.scopeMapLevelActive}` : ''}`}
              onClick={() => selectLevel(item)}
            >
              {levelLabel(item, strings)}
            </button>
          ))}
        </div>

        <div className={styles.scopeMapTrail}>
          {trail.map((entry, index) => (
            <button
              key={`${entry.level}:${entry.nodeId ?? 'root'}:${index}`}
              type="button"
              className={styles.scopeMapCrumb}
              onClick={() => jumpTo(entry, index)}
            >
              {index > 0 ? (
                <ChevronRight size={10} strokeWidth={2} aria-hidden />
              ) : null}
              <span>{entry.label}</span>
            </button>
          ))}
          <span className={styles.scopeMapHint}>{strings.scopeMapHint}</span>
        </div>

        <div className={styles.scopeMapCanvasWrap}>
          {showLoading ? (
            <div className={styles.pickerEmpty}>{strings.scopeMapLoading}</div>
          ) : showEmpty ? (
            <div className={styles.pickerEmpty}>{strings.scopeMapEmpty}</div>
          ) : laidOutDiagram ? (
            <ScopeC4Graph
              key={`${level}:${parentId ?? 'root'}:${laidOutDiagram.bounds.width}x${laidOutDiagram.bounds.height}`}
              diagram={laidOutDiagram}
              selectedNodeIds={selectedNodeIds}
              onToggleNode={toggle}
              onDrillNode={drillInto}
              canDrillNode={(nodeId) => {
                if (!nextLevel(level)) return false
                const node = nodeById.get(nodeId)
                return Boolean(node && (node.children?.length ?? 0) > 0)
              }}
            />
          ) : null}
        </div>

        <div className={styles.scopeMapFooter}>
          <span className={styles.scopeMapSelectedCount}>
            {strings.scopeMapSelected.replace(
              '{count}',
              String(selectedNodeIds.size),
            )}
          </span>
          <button
            type="button"
            className={styles.scopeMapDone}
            onClick={onClose}
          >
            {strings.scopeMapDone}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
