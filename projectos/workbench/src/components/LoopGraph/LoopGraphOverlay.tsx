import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  isConfigNode,
  isIntentGraphReadyForCompile,
  sessionGraphShieldCssInsets,
  type AgentDefinition,
  type IntentEdgePort,
  type IntentGraph,
  type IntentGraphEdge,
  type IntentGraphNode,
  type LoopAgentConfigPort,
  type LoopSatelliteKind,
} from '@contracts/index'
import { ChevronDown, Link2, Plus, Share2, Sparkles, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useLoopGraphStore, type LoopPhase } from '../../state/loopGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import AgentPicker from '../AgentWorkforce/AgentPicker'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import Checkbox from '../ui/Checkbox'
import LoopGoalComposer from './LoopGoalComposer'
import LoopGraphContextMenu, {
  type LoopGraphContextMenuState,
} from './LoopGraphContextMenu'
import LoopConfigAssetPicker, {
  isCommunityMcpServer,
  type ConfigAssetPick,
} from './LoopConfigAssetPicker'
import LoopGraphPalette from './LoopGraphPalette'
import LoopNodeDutyCard from './LoopNodeDutyCard'
import LoopGraphRail from './LoopGraphRail'
import {
  decodePaletteDragPayload,
  LOOP_PALETTE_MIME,
  visualForIntentNode,
} from './loopNodeVisuals'
import {
  AGENT_WIRING_PORTS,
  expectedConfigPort,
  nodeBoxSize,
  wiringPortOffset,
} from './loopWiringVisuals'
import {
  createLoopRailFolder,
  emptyLoopGraphRailLayout,
  findLoopFolderEntry,
  insertLoopFolderOnRail,
  insertLoopOnRail,
  loadLoopGraphRailLayout,
  moveLoopFolderIntoFolder,
  moveLoopIntoFolder,
  removeLoopFolderFromLayout,
  renameLoopRailFolder,
  saveLoopGraphRailLayout,
  syncRailLayoutWithLoops,
  type LoopGraphRailLayout,
} from './loopGraphRailLayout'
import {
  LOOP_NODE_H,
  LOOP_NODE_W,
  nearestPort,
  portPoint,
  routeLoopEdge,
  truncateEdgeLabel,
} from './loopEdgeRouting'
import styles from './LoopGraphOverlay.module.css'

const NODE_W = LOOP_NODE_W
const NODE_H = LOOP_NODE_H
const PORTS: IntentEdgePort[] = ['n', 'e', 's', 'w']

export default function LoopGraphOverlay() {
  const open = useChatSessionStore((s) => s.loopGraphOpen)
  const setLoopGraphOpen = useChatSessionStore((s) => s.setLoopGraphOpen)
  const activeSessionId = useChatSessionStore((s) => s.activeSessionId)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const project = useWorkbenchStore((s) => s.project)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const { ts } = useI18n()

  const heads = useLoopGraphStore((s) => s.heads)
  const document = useLoopGraphStore((s) => s.document)
  const phase = useLoopGraphStore((s) => s.phase)
  const compileResult = useLoopGraphStore((s) => s.compileResult)
  const error = useLoopGraphStore((s) => s.error)
  const connectingFromId = useLoopGraphStore((s) => s.connectingFromId)
  const pendingDelete = useLoopGraphStore((s) => s.pendingDelete)
  const loadForWorkspace = useLoopGraphStore((s) => s.loadForWorkspace)
  const clear = useLoopGraphStore((s) => s.clear)
  const setPhase = useLoopGraphStore((s) => s.setPhase)
  const selectLoop = useLoopGraphStore((s) => s.selectLoop)
  const createLoop = useLoopGraphStore((s) => s.createLoop)
  const updateDraft = useLoopGraphStore((s) => s.updateDraft)
  const setConnectingFrom = useLoopGraphStore((s) => s.setConnectingFrom)
  const setPendingDelete = useLoopGraphStore((s) => s.setPendingDelete)
  const beginAuthorNode = useLoopGraphStore((s) => s.beginAuthorNode)
  const beginAuthorNodeFromPalette = useLoopGraphStore((s) => s.beginAuthorNodeFromPalette)
  const setNodeAgentDefinition = useLoopGraphStore((s) => s.setNodeAgentDefinition)
  const beginAuthorConfigSatellite = useLoopGraphStore((s) => s.beginAuthorConfigSatellite)
  const updateConfigSatellite = useLoopGraphStore((s) => s.updateConfigSatellite)
  const applyWiringToAgentDefinition = useLoopGraphStore((s) => s.applyWiringToAgentDefinition)
  const saveWiringAsNewAgent = useLoopGraphStore((s) => s.saveWiringAsNewAgent)
  const settings = useWorkbenchStore((s) => s.settings)
  const setComposerMode = useLoopGraphStore((s) => s.setComposerMode)
  const beginAuthorEdge = useLoopGraphStore((s) => s.beginAuthorEdge)
  const client = useWorkbenchStore((s) => s.client)
  const beginCreateAgentComposer = useWorkbenchStore((s) => s.beginCreateAgentComposer)
  const exportCapabilityPack = useWorkbenchStore((s) => s.exportCapabilityPack)
  const pushToast = useWorkbenchStore((s) => s.pushToast)
  const refineAuthoringTarget = useLoopGraphStore((s) => s.refineAuthoringTarget)
  const removeAuthoringTarget = useLoopGraphStore((s) => s.removeAuthoringTarget)
  const compile = useLoopGraphStore((s) => s.compile)
  const approve = useLoopGraphStore((s) => s.approve)
  const startRun = useLoopGraphStore((s) => s.startRun)
  const pauseRun = useLoopGraphStore((s) => s.pauseRun)
  const resumeRun = useLoopGraphStore((s) => s.resumeRun)
  const advanceRun = useLoopGraphStore((s) => s.advanceRun)
  const resolveHitl = useLoopGraphStore((s) => s.resolveHitl)
  const linkActiveSession = useLoopGraphStore((s) => s.linkActiveSession)

  const [viewport, setViewport] = useState({ x: 32, y: 32, scale: 1 })
  const [dragging, setDragging] = useState(false)
  const [railLayout, setRailLayout] = useState<LoopGraphRailLayout>(() =>
    emptyLoopGraphRailLayout(),
  )
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const railLayoutRef = useRef(railLayout)
  railLayoutRef.current = railLayout
  const [expandedNodeIds, setExpandedNodeIds] = useState<Record<string, boolean>>({})
  const [acceptedAssumptions, setAcceptedAssumptions] = useState<Record<string, boolean>>({})
  const [confirmedCycles, setConfirmedCycles] = useState<Record<string, boolean>>({})
  const [contextMenu, setContextMenu] = useState<LoopGraphContextMenuState | null>(null)
  const [dutyCardNodeId, setDutyCardNodeId] = useState<string | null>(null)
  const [switchAgentMenu, setSwitchAgentMenu] = useState<{
    nodeId: string
    x: number
    y: number
  } | null>(null)
  const [workforceAgents, setWorkforceAgents] = useState<AgentDefinition[]>([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [paletteDropActive, setPaletteDropActive] = useState(false)
  const [pointerWorld, setPointerWorld] = useState<{ x: number; y: number } | null>(null)
  const [wiringPicker, setWiringPicker] = useState<{
    agentNodeId: string
    kind: Extract<LoopSatelliteKind, 'model' | 'skill' | 'mcp'>
    anchor: { x: number; y: number }
  } | null>(null)
  const [satelliteFillPicker, setSatelliteFillPicker] = useState<{
    nodeId: string
    kind: Extract<LoopSatelliteKind, 'model' | 'skill' | 'mcp'>
    anchor: { x: number; y: number }
  } | null>(null)
  const [capabilityChooser, setCapabilityChooser] = useState<{
    agentNodeId: string
    x: number
    y: number
  } | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const nodeDragRef = useRef<{ id: string; ox: number; oy: number; px: number; py: number } | null>(
    null,
  )

  useEffect(() => {
    if (!open || !project) return
    void loadForWorkspace()
  }, [open, project, loadForWorkspace])

  useEffect(() => {
    if (!project?.projectId) {
      setRailLayout(emptyLoopGraphRailLayout())
      return
    }
    setRailLayout(loadLoopGraphRailLayout(project.projectId))
  }, [project?.projectId])

  const mergedRail = useMemo(
    () => syncRailLayoutWithLoops(railLayout, heads),
    [railLayout, heads],
  )

  const persistRail = (next: LoopGraphRailLayout) => {
    setRailLayout(next)
    if (project?.projectId) saveLoopGraphRailLayout(project.projectId, next)
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (connectingFromId) {
          setConnectingFrom(null)
          setPointerWorld(null)
          return
        }
        if (contextMenu) {
          setContextMenu(null)
          return
        }
        if (pendingDelete) {
          setPendingDelete(null)
          return
        }
        setLoopGraphOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    open,
    connectingFromId,
    contextMenu,
    pendingDelete,
    setConnectingFrom,
    setPendingDelete,
    setLoopGraphOpen,
  ])

  useEffect(() => {
    clear()
  }, [project?.projectId, clear])

  useEffect(() => {
    if (!dutyCardNodeId || !document) return
    if (!document.draft.nodes.some((node) => node.id === dutyCardNodeId)) {
      setDutyCardNodeId(null)
    }
  }, [document, dutyCardNodeId])

  const activeInstance = useMemo(() => {
    const instances = document?.instances ?? []
    return (
      [...instances]
        .reverse()
        .find((item) =>
          ['queued', 'running', 'paused', 'awaiting_hitl', 'awaiting_review'].includes(item.status),
        ) ?? instances[instances.length - 1]
    )
  }, [document])

  const draftAhead =
    Boolean(activeInstance) &&
    Boolean(document) &&
    document!.draft.revision !==
      document!.approvedSpecs.find((spec) => spec.version === activeInstance?.specVersion)
        ?.graphRevision

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  const draft = document?.draft ?? {
    revision: 0,
    graphPrompt: '',
    nodes: [] as IntentGraphNode[],
    edges: [] as IntentGraphEdge[],
  }

  const compileReady = isIntentGraphReadyForCompile(draft)

  const patchDraft = (next: IntentGraph) => {
    updateDraft({ ...next, revision: draft.revision + 1 })
  }

  const updateNode = (nodeId: string, patch: Partial<IntentGraphNode>) => {
    patchDraft({
      ...draft,
      nodes: draft.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    })
  }

  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 40, y: 40 }
    return {
      x: (clientX - rect.left - viewport.x) / viewport.scale,
      y: (clientY - rect.top - viewport.y) / viewport.scale,
    }
  }

  const placeFromPalette = async (
    paletteItemId: string,
    position: { x: number; y: number },
    screenAnchor?: { x: number; y: number },
  ) => {
    const id = await beginAuthorNodeFromPalette(paletteItemId, {
      x: Math.max(16, position.x - NODE_W / 2),
      y: Math.max(16, position.y - NODE_H / 2),
    })
    if (!id) return
    setSelectedNodeId(id)
    const fillKind =
      paletteItemId === 'config.model'
        ? ('model' as const)
        : paletteItemId === 'config.skill'
          ? ('skill' as const)
          : paletteItemId === 'config.mcp'
            ? ('mcp' as const)
            : null
    if (fillKind && screenAnchor) {
      setSatelliteFillPicker({
        nodeId: id,
        kind: fillKind,
        anchor: screenAnchor,
      })
    }
  }

  const openDutyCard = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    setDutyCardNodeId(nodeId)
  }

  const placeWiredAsset = async (
    agentNodeId: string,
    asset: ConfigAssetPick,
  ) => {
    const agent = draft.nodes.find((node) => node.id === agentNodeId)
    if (!agent) return
    const base = {
      x: agent.position.x - 20,
      y: agent.position.y + 100,
    }
    if (asset.kind === 'model') {
      await beginAuthorConfigSatellite({
        satelliteKind: 'model',
        title: `Model · ${asset.name}`,
        configRef: { modelProfileId: asset.id },
        position: base,
        wireToAgentId: agentNodeId,
      })
      return
    }
    if (asset.kind === 'skill') {
      await beginAuthorConfigSatellite({
        satelliteKind: 'skill',
        title: `Skill · ${asset.name}`,
        configRef: { skillId: asset.id },
        position: { x: base.x + 110, y: base.y },
        wireToAgentId: agentNodeId,
      })
      return
    }
    await beginAuthorConfigSatellite({
      satelliteKind: 'mcp',
      title: `MCP · ${asset.name}`,
      configRef: { mcpServerId: asset.id },
      position: { x: base.x + 220, y: base.y },
      wireToAgentId: agentNodeId,
    })
  }

  const addNodeAt = (position: { x: number; y: number }) => {
    void beginAuthorNode({
      x: Math.max(16, position.x - NODE_W / 2),
      y: Math.max(16, position.y - NODE_H / 2),
    }).then((nodeId) => {
      if (nodeId) setSelectedNodeId(nodeId)
    })
  }

  const addNodeCentered = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      addNodeAt({
        x: 40 + draft.nodes.length * 24,
        y: 40 + draft.nodes.length * 24,
      })
      return
    }
    addNodeAt({
      x: (rect.width / 2 - viewport.x) / viewport.scale,
      y: (rect.height / 2 - viewport.y) / viewport.scale,
    })
  }

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = Math.min(1.8, Math.max(0.45, viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08)))
    setViewport((current) => ({ ...current, scale: nextScale }))
  }

  const worldWidth = Math.max(
    800,
    ...draft.nodes.map((node) => {
      const size = nodeBoxSize(node)
      return node.position.x + size.width + 80
    }),
    pointerWorld ? pointerWorld.x + 40 : 0,
  )
  const worldHeight = Math.max(
    600,
    ...draft.nodes.map((node) => {
      const size = nodeBoxSize(node)
      return node.position.y + size.height + 120
    }),
    pointerWorld ? pointerWorld.y + 40 : 0,
  )

  const connectingSource = connectingFromId
    ? draft.nodes.find((node) => node.id === connectingFromId)
    : null

  const previewRoute =
    connectingSource && pointerWorld
      ? routeLoopEdge({
          source: connectingSource,
          endPoint: pointerWorld,
          sourcePort: nearestPort(connectingSource, pointerWorld),
          obstacles: draft.nodes,
        })
      : null

  const startConnectFrom = (
    nodeId: string,
    seedWorld?: { x: number; y: number },
    sourcePort?: IntentEdgePort,
  ) => {
    const node = draft.nodes.find((item) => item.id === nodeId)
    setConnectingFrom(nodeId)
    if (seedWorld) {
      setPointerWorld(seedWorld)
      return
    }
    if (node) {
      setPointerWorld(portPoint(node, sourcePort ?? 's'))
    }
  }

  const steps: Array<{ id: LoopPhase; label: string }> = [
    { id: 'draw', label: ts('chat.loopGraph.phase.draw') },
    { id: 'review', label: ts('chat.loopGraph.phase.review') },
    { id: 'run', label: ts('chat.loopGraph.phase.run') },
  ]

  const pendingDeleteLabel =
    pendingDelete?.type === 'node'
      ? ts('chat.loopGraph.deleteNodeConfirm')
      : ts('chat.loopGraph.deleteEdgeConfirm')

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.loopGraph.title')}
    >
      <LoopGraphRail
        layout={mergedRail}
        items={heads}
        activeLoopId={document?.id ?? null}
        renamingFolderId={renamingFolderId}
        onOpen={(id) => void selectLoop(id)}
        onCreate={() => void createLoop()}
        onCreateFolder={() => {
          const created = createLoopRailFolder(
            railLayoutRef.current,
            ts('chat.loopGraph.folderUntitled'),
          )
          persistRail(created.layout)
          setRenamingFolderId(created.folderId)
        }}
        onRenameFolder={(folderId, title) => {
          persistRail(renameLoopRailFolder(railLayoutRef.current, folderId, title))
          setRenamingFolderId(null)
        }}
        onCancelRenameFolder={() => {
          if (renamingFolderId) {
            const folder = findLoopFolderEntry(
              railLayoutRef.current.entries,
              renamingFolderId,
            )
            if (
              folder &&
              folder.children.length === 0 &&
              (!folder.title.trim() ||
                folder.title.trim() === ts('chat.loopGraph.folderUntitled'))
            ) {
              persistRail(
                removeLoopFolderFromLayout(railLayoutRef.current, renamingFolderId),
              )
            }
          }
          setRenamingFolderId(null)
        }}
        onRemoveFolder={(folderId) => {
          if (renamingFolderId === folderId) setRenamingFolderId(null)
          persistRail(removeLoopFolderFromLayout(mergedRail, folderId))
        }}
        onMoveIntoFolder={(loopId, folderId) => {
          persistRail(moveLoopIntoFolder(railLayoutRef.current, loopId, folderId))
        }}
        onMoveFolderIntoFolder={(folderId, targetFolderId) => {
          persistRail(
            moveLoopFolderIntoFolder(railLayoutRef.current, folderId, targetFolderId),
          )
        }}
        onMoveToRail={(loopId) => {
          persistRail(insertLoopOnRail(railLayoutRef.current, loopId))
        }}
        onMoveFolderToRail={(folderId) => {
          persistRail(insertLoopFolderOnRail(railLayoutRef.current, folderId))
        }}
      />
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <input
              className={styles.title}
              value={document?.title ?? ts('chat.loopGraph.title')}
              aria-label={ts('chat.loopGraph.rename')}
              disabled={!document}
              onChange={(event) => {
                if (!document) return
                updateDraft(document.draft, event.target.value)
              }}
            />
            <div className={styles.stepper} role="tablist" aria-label={ts('chat.loopGraph.phases')}>
              {steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={phase === step.id}
                  className={`${styles.step} ${phase === step.id ? styles.stepActive : ''}`}
                  onClick={() => setPhase(step.id)}
                >
                  {step.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.headerActions}>
            {phase === 'draw' ? (
              <>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={addNodeCentered}
                  disabled={!document}
                  title={ts('chat.loopGraph.addNode')}
                  aria-label={ts('chat.loopGraph.addNode')}
                >
                  <Plus size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.iconButtonPrimary}`}
                  onClick={() => void compile()}
                  disabled={!document || !compileReady}
                  title={ts('chat.loopGraph.compile')}
                  aria-label={ts('chat.loopGraph.compile')}
                >
                  <Sparkles size={14} aria-hidden />
                </button>
              </>
            ) : null}
            {phase === 'review' ? (
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={() => void approve()}
                disabled={!compileResult}
              >
                {ts('chat.loopGraph.approve')}
              </button>
            ) : null}
            {phase === 'run' ? (
              <>
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                  onClick={() => void startRun()}
                  disabled={!document?.approvedSpecs.length}
                >
                  {ts('chat.loopGraph.start')}
                </button>
                <button type="button" className={styles.actionButton} onClick={() => void pauseRun()}>
                  {ts('chat.loopGraph.pause')}
                </button>
                <button type="button" className={styles.actionButton} onClick={() => void resumeRun()}>
                  {ts('chat.loopGraph.resume')}
                </button>
                <button type="button" className={styles.actionButton} onClick={() => void advanceRun()}>
                  {ts('chat.loopGraph.advance')}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={styles.iconButton}
              aria-label={ts('chat.loopGraph.linkSession')}
              title={ts('chat.loopGraph.linkSession')}
              disabled={!document || !activeSessionId}
              onClick={() => void linkActiveSession()}
            >
              <Link2 size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={ts('chat.loopGraph.exportWorkflow')}
              title={ts('chat.loopGraph.exportWorkflow')}
              disabled={!document || document.draft.nodes.length === 0}
              onClick={() => {
                if (!document) return
                void (async () => {
                  const pack = await exportCapabilityPack({
                    kind: 'workflow',
                    loopId: document.id,
                  })
                  if (!pack || pack.kind !== 'workflow') return
                  try {
                    await navigator.clipboard.writeText(pack.packJson)
                    pushToast({
                      type: 'success',
                      message: ts('chat.loopGraph.exportWorkflowCopied'),
                    })
                  } catch {
                    pushToast({
                      type: 'error',
                      message: ts('chat.marketplace.loadFailed'),
                    })
                  }
                })()
              }}
            >
              <Share2 size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.closeButton}
              aria-label={ts('chat.loopGraph.close')}
              onClick={() => setLoopGraphOpen(false)}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        {error ? <div className={styles.error}>{error}</div> : null}
        {draftAhead ? (
          <div className={styles.banner}>{ts('chat.loopGraph.versionConflict')}</div>
        ) : null}
        {phase === 'draw' && connectingFromId ? (
          <div className={styles.banner} data-loop-connecting-hint="">
            {ts('chat.loopGraph.connectingHint')}
          </div>
        ) : null}

        <div className={styles.body}>
          <div className={styles.stage}>
            {phase === 'review' && compileResult ? (
              <div className={styles.review}>
                <div className={styles.reviewCard}>
                  <h3>{ts('chat.loopGraph.goalUnderstanding')}</h3>
                  <p>{compileResult.specDraft.goal}</p>
                </div>
                <div className={styles.reviewCard}>
                  <h3>{ts('chat.loopGraph.executionPlan')}</h3>
                  <ol>
                    {compileResult.specDraft.nodes.map((node) => (
                      <li key={node.id}>
                        <strong>{node.role}</strong> — {node.goal}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className={styles.reviewCard}>
                  <h3>{ts('chat.loopGraph.assumptions')}</h3>
                  {compileResult.assumptions.length === 0 ? (
                    <p>{ts('chat.loopGraph.noAssumptions')}</p>
                  ) : (
                    compileResult.assumptions.map((item) => (
                      <Checkbox
                        key={item.id}
                        className={styles.assumptionRow}
                        checked={acceptedAssumptions[item.id] ?? false}
                        onCheckedChange={(next) =>
                          setAcceptedAssumptions((current) => ({
                            ...current,
                            [item.id]: next,
                          }))
                        }
                        label={item.text}
                      />
                    ))
                  )}
                </div>
                <div className={styles.reviewCard}>
                  <h3>{ts('chat.loopGraph.cycleGates')}</h3>
                  {compileResult.cycleGates.length === 0 ? (
                    <p>{ts('chat.loopGraph.noCycles')}</p>
                  ) : (
                    compileResult.cycleGates.map((gate) => (
                      <Checkbox
                        key={gate.edgeId}
                        className={styles.cycleRow}
                        checked={confirmedCycles[gate.edgeId] ?? false}
                        onCheckedChange={(next) =>
                          setConfirmedCycles((current) => ({
                            ...current,
                            [gate.edgeId]: next,
                          }))
                        }
                        label={`${gate.triggerWhen} · max ${gate.maxRounds}`}
                      />
                    ))
                  )}
                </div>
                {activeInstance?.status === 'awaiting_hitl' ? (
                  <div className={styles.reviewCard}>
                    <h3>{ts('chat.loopGraph.hitl')}</h3>
                    <p>{ts('chat.loopGraph.hitlHint')}</p>
                    <div className={styles.headerActions}>
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() =>
                          void resolveHitl([{ questionId: 'stop', answer: 'stop' }])
                        }
                      >
                        {ts('chat.loopGraph.hitlStop')}
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                        onClick={() =>
                          void resolveHitl([{ questionId: 'continue', answer: 'continue' }])
                        }
                      >
                        {ts('chat.loopGraph.hitlContinue')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                ref={canvasRef}
                className={`${styles.canvas} ${dragging ? styles.canvasDragging : ''} ${
                  connectingFromId ? styles.canvasConnecting : ''
                } ${paletteDropActive ? styles.canvasDropTarget : ''}`}
                onWheel={onWheel}
                onDragOver={(event) => {
                  if (phase !== 'draw') return
                  const types = Array.from(event.dataTransfer.types)
                  if (
                    !types.includes(LOOP_PALETTE_MIME) &&
                    !types.includes('text/plain')
                  ) {
                    return
                  }
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                  setPaletteDropActive(true)
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget === event.target) {
                    setPaletteDropActive(false)
                  }
                }}
                onDrop={(event) => {
                  if (phase !== 'draw') return
                  event.preventDefault()
                  setPaletteDropActive(false)
                  const raw =
                    event.dataTransfer.getData(LOOP_PALETTE_MIME) ||
                    event.dataTransfer.getData('text/plain')
                  const paletteItemId =
                    decodePaletteDragPayload(raw) ||
                    (raw.startsWith('{') ? null : raw.trim() || null)
                  if (!paletteItemId) return
                  const world = clientToWorld(event.clientX, event.clientY)
                  void placeFromPalette(paletteItemId, world, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                }}
                onContextMenu={(event) => {
                  if (phase !== 'draw' || !document) return
                  event.preventDefault()
                  // Right-click may be retargeted to the canvas after pointer capture
                  // from a prior node pointerdown — resolve the hit under the cursor.
                  const hitFromTarget =
                    event.target instanceof Element
                      ? event.target.closest('[data-loop-node], [data-loop-edge]')
                      : null
                  const hitFromPoint = globalThis.document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest('[data-loop-node], [data-loop-edge]')
                  const hit = hitFromTarget ?? hitFromPoint ?? null
                  if (hit) {
                    const nodeId = hit.getAttribute('data-loop-node')
                    const edgeId = hit.getAttribute('data-loop-edge')
                    if (nodeId) {
                      const hitNode = draft.nodes.find((item) => item.id === nodeId)
                      setSelectedNodeId(nodeId)
                      setContextMenu({
                        kind: 'node',
                        x: event.clientX,
                        y: event.clientY,
                        nodeId,
                        isAgentNode: (hitNode?.type ?? 'agent') === 'agent',
                        restoreFocusTo: event.currentTarget,
                      })
                      return
                    }
                    if (edgeId) {
                      setContextMenu({
                        kind: 'edge',
                        x: event.clientX,
                        y: event.clientY,
                        edgeId,
                        restoreFocusTo: event.currentTarget,
                      })
                      return
                    }
                  }
                  const world = clientToWorld(event.clientX, event.clientY)
                  setContextMenu({
                    kind: 'blank',
                    x: event.clientX,
                    y: event.clientY,
                    worldX: world.x,
                    worldY: world.y,
                    restoreFocusTo: event.currentTarget,
                  })
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  if ((event.target as HTMLElement).closest('[data-loop-node]')) return
                  if ((event.target as HTMLElement).closest('[data-loop-edge]')) return
                  if (connectingFromId && event.button === 0) {
                    setConnectingFrom(null)
                    setPointerWorld(null)
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
                  if (connectingFromId) {
                    setPointerWorld(clientToWorld(event.clientX, event.clientY))
                  }
                  const nodeDrag = nodeDragRef.current
                  if (nodeDrag && document) {
                    const dx = (event.clientX - nodeDrag.px) / viewport.scale
                    const dy = (event.clientY - nodeDrag.py) / viewport.scale
                    updateNode(nodeDrag.id, {
                      position: { x: nodeDrag.ox + dx, y: nodeDrag.oy + dy },
                    })
                    return
                  }
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
                  nodeDragRef.current = null
                  setDragging(false)
                }}
              >
                {!document ? (
                  <p className={styles.empty}>{ts('chat.loopGraph.empty')}</p>
                ) : draft.nodes.length === 0 ? (
                  <p className={styles.empty}>{ts('chat.loopGraph.canvasEmpty')}</p>
                ) : (
                  <>
                  <div
                    className={styles.world}
                    style={{
                      width: worldWidth,
                      height: worldHeight,
                      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                    }}
                  >
                    <svg className={styles.edges} width={worldWidth} height={worldHeight}>
                      {draft.edges.map((edge) => {
                        const source = draft.nodes.find((node) => node.id === edge.source)
                        const target = draft.nodes.find((node) => node.id === edge.target)
                        if (!source || !target) return null
                        const sourceSize = nodeBoxSize(source)
                        const targetSize = nodeBoxSize(target)
                        const provides = edge.kind === 'provides'
                        const routed = routeLoopEdge({
                          source,
                          target,
                          sourcePort: edge.sourcePort ?? (provides ? 'n' : undefined),
                          targetPort: edge.targetPort ?? (provides ? 's' : undefined),
                          obstacles: draft.nodes,
                          width: sourceSize.width,
                          height: sourceSize.height,
                          targetWidth: targetSize.width,
                          targetHeight: targetSize.height,
                        })
                        const incomplete =
                          !provides && (!edge.prompt?.trim() || !edge.kind)
                        const feedback = edge.kind === 'feedback'
                        const conditional = edge.kind === 'conditional'
                        const label = provides
                          ? edge.configPort ??
                            expectedConfigPort(source) ??
                            ts('chat.loopGraph.wiringProvides')
                          : truncateEdgeLabel(
                              edge.branchKey
                                ? `${edge.branchKey}: ${edge.prompt ?? ''}`
                                : (edge.prompt ?? ''),
                            ) || ts('chat.loopGraph.edgeLabelPending')
                        return (
                          <g key={edge.id} data-loop-edge={edge.id}>
                            <path
                              className={styles.edgeHit}
                              d={routed.d}
                              onContextMenu={(event) => {
                                if (phase !== 'draw') return
                                event.preventDefault()
                                event.stopPropagation()
                                setContextMenu({
                                  kind: 'edge',
                                  x: event.clientX,
                                  y: event.clientY,
                                  edgeId: edge.id,
                                  restoreFocusTo: canvasRef.current ?? undefined,
                                })
                              }}
                            />
                            <path
                              className={`${styles.edge} ${
                                feedback ? styles.edgeFeedback : ''
                              } ${conditional ? styles.edgeConditional : ''} ${
                                provides ? styles.edgeProvides : ''
                              } ${incomplete ? styles.edgeIncomplete : ''}`}
                              d={routed.d}
                              pointerEvents="none"
                            />
                            {!provides ? (
                              <>
                                <rect
                                  className={styles.edgeLabelBg}
                                  x={routed.mid.x - 48}
                                  y={routed.mid.y - 9}
                                  width={96}
                                  height={18}
                                  rx={4}
                                  pointerEvents="none"
                                />
                                <text
                                  className={`${styles.edgeLabel} ${
                                    incomplete ? styles.edgeLabelPending : ''
                                  }`}
                                  x={routed.mid.x}
                                  y={routed.mid.y + 4}
                                  textAnchor="middle"
                                  pointerEvents="none"
                                >
                                  {label}
                                </text>
                              </>
                            ) : (
                              <text
                                className={styles.edgeProvidesLabel}
                                x={routed.mid.x}
                                y={routed.mid.y + 3}
                                textAnchor="middle"
                                pointerEvents="none"
                              >
                                {label}
                              </text>
                            )}
                          </g>
                        )
                      })}
                      {previewRoute ? (
                        <path
                          className={`${styles.edge} ${styles.edgePreview}`}
                          d={previewRoute.d}
                          pointerEvents="none"
                        />
                      ) : null}
                    </svg>
                    {draft.nodes.map((node) => {
                      const isCursor = activeInstance?.cursorNodeId === node.id
                      const isHitl =
                        activeInstance?.status === 'awaiting_hitl' && isCursor
                      const configSatellite = isConfigNode(node)
                      const isAgentDuty =
                        !configSatellite && (node.type ?? 'agent') === 'agent'
                      const incomplete = configSatellite
                        ? !node.satelliteKind
                        : !node.prompt.trim()
                      const size = nodeBoxSize(node)
                      const expanded = Boolean(expandedNodeIds[node.id])
                      const visual = visualForIntentNode(node)
                      const NodeIcon = visual.Icon
                      const categoryClass =
                        visual.categoryClass === 'catAgent'
                          ? styles.catAgent
                          : visual.categoryClass === 'catAction'
                            ? styles.catAction
                            : visual.categoryClass === 'catLogic'
                              ? styles.catLogic
                              : visual.categoryClass === 'catHuman'
                                ? styles.catHuman
                                : visual.categoryClass === 'catConfig'
                                  ? styles.catConfig
                                  : styles.catDraft
                      const modelWired = draft.edges.some(
                        (edge) =>
                          edge.kind === 'provides' &&
                          edge.target === node.id &&
                          (edge.configPort === 'model' ||
                            expectedConfigPort(
                              draft.nodes.find((n) => n.id === edge.source) ?? node,
                            ) === 'model'),
                      )
                      return (
                        <div
                          key={node.id}
                          className={`${styles.node} ${categoryClass} ${
                            configSatellite ? styles.nodeConfig : ''
                          } ${isAgentDuty ? styles.nodeAgentWired : ''} ${
                            selectedNodeId === node.id ? styles.nodeActive : ''
                          } ${connectingFromId === node.id ? styles.nodeConnecting : ''} ${
                            incomplete ? styles.nodeIncomplete : ''
                          } ${isCursor && phase === 'run' ? styles.nodeRunning : ''} ${
                            isHitl ? styles.nodeHitl : ''
                          }`}
                          style={{
                            left: node.position.x,
                            top: node.position.y,
                            width: size.width,
                            minHeight: size.height,
                          }}
                          data-loop-node={node.id}
                          aria-label={`${visual.shortLabel}: ${node.title || ts('chat.loopGraph.untitledNode')}`}
                          onDoubleClick={(event) => {
                            event.stopPropagation()
                            if (configSatellite) {
                              const kind =
                                node.satelliteKind === 'model' ||
                                node.satelliteKind === 'skill' ||
                                node.satelliteKind === 'mcp'
                                  ? node.satelliteKind
                                  : null
                              if (kind) {
                                setSatelliteFillPicker({
                                  nodeId: node.id,
                                  kind,
                                  anchor: { x: event.clientX, y: event.clientY },
                                })
                              }
                              return
                            }
                            openDutyCard(node.id)
                          }}
                          onContextMenu={(event) => {
                            if (phase !== 'draw') return
                            event.preventDefault()
                            event.stopPropagation()
                            // Cancel any accidental drag started before contextmenu.
                            nodeDragRef.current = null
                            setSelectedNodeId(node.id)
                            setContextMenu({
                              kind: 'node',
                              x: event.clientX,
                              y: event.clientY,
                              nodeId: node.id,
                              isAgentNode: isAgentDuty,
                              restoreFocusTo: event.currentTarget,
                            })
                          }}
                          onPointerDown={(event) => {
                            // Ignore right/middle click so contextmenu is not stolen by
                            // pointer capture on the canvas (which only showed "Add node").
                            if (event.button !== 0) return
                            event.stopPropagation()
                            setSelectedNodeId(node.id)
                            const clickWorld = clientToWorld(event.clientX, event.clientY)
                            const hitPortAttr = (event.target as HTMLElement | null)
                              ?.closest?.('[data-loop-port]')
                              ?.getAttribute('data-loop-port') as IntentEdgePort | null
                            const hitConfigPort = (event.target as HTMLElement | null)
                              ?.closest?.('[data-loop-config-port]')
                              ?.getAttribute('data-loop-config-port') as
                              | LoopAgentConfigPort
                              | null
                            if (connectingFromId) {
                              if (connectingFromId !== node.id && connectingSource) {
                                const targetPort =
                                  hitPortAttr ??
                                  nearestPort(node, clickWorld, size.width, size.height)
                                const sourceSize = nodeBoxSize(connectingSource)
                                const sourcePort = nearestPort(
                                  connectingSource,
                                  portPoint(node, targetPort, size.width, size.height),
                                  sourceSize.width,
                                  sourceSize.height,
                                )
                                void beginAuthorEdge(connectingFromId, node.id, {
                                  sourcePort,
                                  targetPort,
                                  ...(hitConfigPort
                                    ? { configPort: hitConfigPort, kind: 'provides' }
                                    : {}),
                                }).then(() => setPointerWorld(null))
                              }
                              return
                            }
                            nodeDragRef.current = {
                              id: node.id,
                              ox: node.position.x,
                              oy: node.position.y,
                              px: event.clientX,
                              py: event.clientY,
                            }
                            ;(event.currentTarget.parentElement?.parentElement as HTMLElement | null)
                              ?.setPointerCapture?.(event.pointerId)
                          }}
                        >
                          {(connectingFromId || selectedNodeId === node.id) &&
                            PORTS.map((port) => {
                              const point = portPoint(node, port, size.width, size.height)
                              const active =
                                connectingFromId === node.id &&
                                previewRoute?.sourcePort === port
                              return (
                                <span
                                  key={port}
                                  className={`${styles.port} ${active ? styles.portActive : ''}`}
                                  style={{
                                    left: point.x - node.position.x,
                                    top: point.y - node.position.y,
                                  }}
                                  data-loop-port={port}
                                  aria-hidden
                                  onPointerDown={(event) => {
                                    event.stopPropagation()
                                    event.preventDefault()
                                    const seed = clientToWorld(event.clientX, event.clientY)
                                    if (
                                      connectingFromId &&
                                      connectingFromId !== node.id &&
                                      connectingSource
                                    ) {
                                      const sourceSize = nodeBoxSize(connectingSource)
                                      const sourcePort = nearestPort(
                                        connectingSource,
                                        portPoint(node, port, size.width, size.height),
                                        sourceSize.width,
                                        sourceSize.height,
                                      )
                                      void beginAuthorEdge(connectingFromId, node.id, {
                                        sourcePort,
                                        targetPort: port,
                                      }).then(() => setPointerWorld(null))
                                      return
                                    }
                                    startConnectFrom(node.id, seed, port)
                                  }}
                                />
                              )
                            })}
                          <div className={styles.nodeTop}>
                            <span
                              className={`${styles.nodeIcon} ${categoryClass}`}
                              title={visual.shortLabel}
                              aria-hidden
                            >
                              <NodeIcon size={15} strokeWidth={1.75} />
                            </span>
                            <span className={styles.nodeTitle}>
                              {node.title || visual.shortLabel}
                              {isAgentDuty ? (
                                <span className={styles.nodeAgentMeta}>
                                  {node.agentDefinitionId
                                    ? ts('workforce.assignedAgent')
                                    : ts('workforce.assignedGeneral')}
                                  {node.agentDefinitionId
                                    ? ` · ${node.agentDefinitionId.slice(0, 10)}`
                                    : ''}
                                </span>
                              ) : null}
                              {configSatellite &&
                              node.satelliteKind === 'mcp' &&
                              isCommunityMcpServer(
                                settings?.mcpServers?.find(
                                  (server) => server.id === node.configRef?.mcpServerId,
                                ),
                              ) ? (
                                <span className={styles.communityBadge}>
                                  {ts('chat.loopGraph.wiringMcpCommunity')}
                                </span>
                              ) : null}
                              {configSatellite &&
                              node.satelliteKind === 'mcp' &&
                              settings?.mcpServers?.find(
                                (server) => server.id === node.configRef?.mcpServerId,
                              )?.enabled === false ? (
                                <span className={styles.disabledBadge}>
                                  {ts('chat.loopGraph.wiringMcpDisabled')}
                                </span>
                              ) : null}
                            </span>
                            {incomplete ? (
                              <span className={styles.incompleteMark}>
                                {ts('chat.loopGraph.incomplete')}
                              </span>
                            ) : null}
                            {!configSatellite ? (
                              <button
                                type="button"
                                className={`${styles.chevronButton} ${
                                  expanded ? styles.chevronOpen : ''
                                }`}
                                title={ts('chat.loopGraph.viewDescription')}
                                aria-label={ts('chat.loopGraph.viewDescription')}
                                aria-expanded={expanded}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setExpandedNodeIds((current) => ({
                                    ...current,
                                    [node.id]: !current[node.id],
                                  }))
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <ChevronDown size={12} aria-hidden />
                              </button>
                            ) : null}
                          </div>
                          {isAgentDuty ? (
                            <div className={styles.wiringStrip} aria-hidden>
                              {AGENT_WIRING_PORTS.map((port) => {
                                const offset = wiringPortOffset(port.id, size.width)
                                const warn = port.id === 'model' && !modelWired
                                return (
                                  <button
                                    key={port.id}
                                    type="button"
                                    className={`${styles.wiringPort} ${
                                      warn ? styles.wiringPortWarn : ''
                                    }`}
                                    style={{ left: offset.x - 14 }}
                                    data-loop-config-port={port.id}
                                    title={ts(`chat.loopGraph.wiringPort_${port.id}`)}
                                    aria-label={ts(`chat.loopGraph.wiringPort_${port.id}`)}
                                    onPointerDown={(event) => {
                                      event.stopPropagation()
                                      event.preventDefault()
                                      if (
                                        connectingFromId &&
                                        connectingFromId !== node.id &&
                                        connectingSource
                                      ) {
                                        void beginAuthorEdge(connectingFromId, node.id, {
                                          sourcePort: 'n',
                                          targetPort: 's',
                                          configPort: port.id,
                                          kind: 'provides',
                                        }).then(() => setPointerWorld(null))
                                        return
                                      }
                                      if (port.id === 'model') {
                                        setWiringPicker({
                                          agentNodeId: node.id,
                                          kind: 'model',
                                          anchor: { x: event.clientX, y: event.clientY },
                                        })
                                        return
                                      }
                                      if (port.id === 'memory') {
                                        void beginAuthorConfigSatellite({
                                          satelliteKind: 'memory',
                                          title: 'Memory · Project',
                                          configRef: { memoryMode: 'project' },
                                          position: {
                                            x: node.position.x + 40,
                                            y: node.position.y + 100,
                                          },
                                          wireToAgentId: node.id,
                                        })
                                        return
                                      }
                                      setCapabilityChooser({
                                        agentNodeId: node.id,
                                        x: event.clientX,
                                        y: event.clientY,
                                      })
                                    }}
                                  >
                                    {port.label}
                                  </button>
                                )
                              })}
                            </div>
                          ) : null}
                          {expanded && !configSatellite ? (
                            <div className={styles.nodeDrawer}>
                              {node.prompt.trim()
                                ? node.prompt
                                : ts('chat.loopGraph.descriptionEmpty')}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  {(() => {
                    const dutyNode = dutyCardNodeId
                      ? draft.nodes.find((item) => item.id === dutyCardNodeId)
                      : null
                    if (!dutyNode) return null
                    const canvasEl = canvasRef.current
                    const canvasW = canvasEl?.clientWidth ?? 800
                    const canvasH = canvasEl?.clientHeight ?? 600
                    const cardW = 300
                    const cardH = 420
                    let left =
                      viewport.x + (dutyNode.position.x + NODE_W) * viewport.scale + 12
                    let top = viewport.y + dutyNode.position.y * viewport.scale
                    if (left + cardW > canvasW - 8) {
                      left =
                        viewport.x + dutyNode.position.x * viewport.scale - cardW - 12
                    }
                    left = Math.max(8, Math.min(left, canvasW - cardW - 8))
                    top = Math.max(
                      8,
                      Math.min(top, canvasH - Math.min(cardH, 280) - 8),
                    )
                    return (
                      <LoopNodeDutyCard
                        node={dutyNode}
                        specNode={
                          document?.approvedSpecs
                            .at(-1)
                            ?.nodes.find((item) => item.id === dutyNode.id) ?? null
                        }
                        activeInstance={activeInstance}
                        readOnly={phase !== 'draw'}
                        left={left}
                        top={top}
                        onClose={() => setDutyCardNodeId(null)}
                        onChange={(patch) => {
                          if (phase !== 'draw') return
                          updateNode(dutyNode.id, patch)
                        }}
                      />
                    )
                  })()}
                  </>
                )}
              </div>
            )}

            {phase === 'draw' && document ? <LoopGoalComposer /> : null}

            {phase === 'run' && activeInstance ? (
              <div className={styles.runPanel}>
                <div>
                  {ts('chat.loopGraph.instanceStatus')}: {activeInstance.status} · round{' '}
                  {activeInstance.round}
                </div>
                {activeInstance.status === 'awaiting_hitl' ? (
                  <div className={styles.hitlActions}>
                    {(activeInstance.hitlQuestionIds ?? ['continue']).map((questionId) => {
                      const isApproval = questionId.includes('approval')
                      const isReview = questionId.includes('review')
                      return (
                        <div key={questionId} className={styles.hitlGroup}>
                          <div className={styles.runEvent}>{questionId}</div>
                          {isApproval ? (
                            <>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                                onClick={() =>
                                  void resolveHitl([
                                    {
                                      questionId,
                                      answer: 'approve',
                                      editedPayload: { approved: true },
                                    },
                                  ])
                                }
                              >
                                {ts('chat.loopGraph.hitlApprove')}
                              </button>
                              <button
                                type="button"
                                className={styles.actionButton}
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'reject' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlReject')}
                              </button>
                            </>
                          ) : null}
                          {isReview ? (
                            <>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'accept' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlAccept')}
                              </button>
                              <button
                                type="button"
                                className={styles.actionButton}
                                onClick={() =>
                                  void resolveHitl([
                                    { questionId, answer: 'request_changes' },
                                  ])
                                }
                              >
                                {ts('chat.loopGraph.hitlRequestChanges')}
                              </button>
                            </>
                          ) : null}
                          {!isApproval && !isReview ? (
                            <>
                              <button
                                type="button"
                                className={styles.actionButton}
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'stop' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlStop')}
                              </button>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                                onClick={() =>
                                  void resolveHitl([{ questionId, answer: 'continue' }])
                                }
                              >
                                {ts('chat.loopGraph.hitlContinue')}
                              </button>
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
                {activeInstance.events.slice(-8).map((event) => (
                  <div key={event.id} className={styles.runEvent}>
                    {event.at.slice(11, 19)} · {event.type}
                    {event.message ? ` — ${event.message}` : ''}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {phase === 'draw' ? (
            <LoopGraphPalette
              onPlaced={(nodeId) => setSelectedNodeId(nodeId)}
              resolveClickPosition={() => {
                const rect = canvasRef.current?.getBoundingClientRect()
                if (!rect) return { x: 80, y: 80 }
                return {
                  x: (rect.width / 2 - viewport.x) / viewport.scale,
                  y: (rect.height / 2 - viewport.y) / viewport.scale,
                }
              }}
            />
          ) : null}
        </div>
      </div>

      <LoopGraphContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onCreateNode={addNodeAt}
        onCreateAgent={() => {
          beginCreateAgentComposer('loop')
          void setComposerMode('create_agent')
        }}
        onConnectFrom={(nodeId) => startConnectFrom(nodeId)}
        onOpenDuty={openDutyCard}
        onSwitchAgent={(nodeId, anchor) => {
          setSwitchAgentMenu({ nodeId, x: anchor.x, y: anchor.y })
          if (client?.listWorkforceAgents && project) {
            setAgentsLoading(true)
            void client
              .listWorkforceAgents({ projectId: project.projectId })
              .then((result) => setWorkforceAgents(result.agents))
              .catch(() => setWorkforceAgents([]))
              .finally(() => setAgentsLoading(false))
          }
        }}
        onApplyWiring={(nodeId) => {
          const bound = draft.nodes.find((node) => node.id === nodeId)?.agentDefinitionId
          if (!bound) {
            pushToast({
              type: 'info',
              message: ts('chat.loopGraph.wiringApplyNeedsAgent'),
              autoDismiss: 4200,
            })
            return
          }
          if (!window.confirm(ts('chat.loopGraph.wiringApplyConfirm'))) return
          void applyWiringToAgentDefinition(nodeId)
        }}
        onSaveWiringAsAgent={(nodeId) => {
          const node = draft.nodes.find((item) => item.id === nodeId)
          const name = window.prompt(
            ts('chat.loopGraph.wiringSaveAsPrompt'),
            node?.title || 'Specialized Agent',
          )
          if (name == null) return
          void saveWiringAsNewAgent(nodeId, {
            displayName: name.trim() || node?.title,
          })
        }}
        onDeleteNode={(nodeId) => setPendingDelete({ type: 'node', id: nodeId })}
        onDeleteEdge={(edgeId) => setPendingDelete({ type: 'edge', id: edgeId })}
      />

      {capabilityChooser
        ? createPortal(
            <div
              className={styles.capabilityChooser}
              style={{ left: capabilityChooser.x, top: capabilityChooser.y }}
              role="menu"
              data-zone-interactive
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className={styles.capabilityChooserItem}
                onClick={() => {
                  setWiringPicker({
                    agentNodeId: capabilityChooser.agentNodeId,
                    kind: 'skill',
                    anchor: { x: capabilityChooser.x, y: capabilityChooser.y },
                  })
                  setCapabilityChooser(null)
                }}
              >
                {ts('chat.loopGraph.wiringPickSkill')}
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.capabilityChooserItem}
                onClick={() => {
                  setWiringPicker({
                    agentNodeId: capabilityChooser.agentNodeId,
                    kind: 'mcp',
                    anchor: { x: capabilityChooser.x, y: capabilityChooser.y },
                  })
                  setCapabilityChooser(null)
                }}
              >
                {ts('chat.loopGraph.wiringPickMcp')}
              </button>
              <button
                type="button"
                className={styles.capabilityChooserItem}
                onClick={() => setCapabilityChooser(null)}
              >
                {ts('chat.loopGraph.wiringPickerCancel')}
              </button>
            </div>,
            globalThis.document.body,
          )
        : null}

      {wiringPicker
        ? createPortal(
            <LoopConfigAssetPicker
              kind={wiringPicker.kind}
              anchor={wiringPicker.anchor}
              onCancel={() => setWiringPicker(null)}
              onPick={(asset) => {
                const agentNodeId = wiringPicker.agentNodeId
                setWiringPicker(null)
                void placeWiredAsset(agentNodeId, asset)
              }}
            />,
            globalThis.document.body,
          )
        : null}

      {satelliteFillPicker
        ? createPortal(
            <LoopConfigAssetPicker
              kind={satelliteFillPicker.kind}
              anchor={satelliteFillPicker.anchor}
              onCancel={() => setSatelliteFillPicker(null)}
              onPick={(asset) => {
                const nodeId = satelliteFillPicker.nodeId
                setSatelliteFillPicker(null)
                if (asset.kind === 'model') {
                  updateConfigSatellite(nodeId, {
                    title: `Model · ${asset.name}`,
                    configRef: { modelProfileId: asset.id },
                  })
                  return
                }
                if (asset.kind === 'skill') {
                  updateConfigSatellite(nodeId, {
                    title: `Skill · ${asset.name}`,
                    configRef: { skillId: asset.id },
                  })
                  return
                }
                updateConfigSatellite(nodeId, {
                  title: `MCP · ${asset.name}`,
                  configRef: { mcpServerId: asset.id },
                })
              }}
            />,
            globalThis.document.body,
          )
        : null}

      {switchAgentMenu
        ? createPortal(
            <div
              className={styles.switchAgentPopover}
              style={{ left: switchAgentMenu.x, top: switchAgentMenu.y }}
              data-zone-interactive
              onMouseDown={(event) => event.stopPropagation()}
            >
              <AgentPicker
                agents={workforceAgents}
                selectedDefinitionId={
                  draft.nodes.find((node) => node.id === switchAgentMenu.nodeId)
                    ?.agentDefinitionId ?? null
                }
                loading={agentsLoading}
                onSelectGeneral={() => {
                  setNodeAgentDefinition(switchAgentMenu.nodeId, null, {
                    wiringBase: { skillIds: [], mcpServerIds: [] },
                  })
                  setSwitchAgentMenu(null)
                }}
                onSelectAgent={(definitionId) => {
                  const match = workforceAgents.find((agent) => agent.definitionId === definitionId)
                  setNodeAgentDefinition(switchAgentMenu.nodeId, definitionId, {
                    title: match?.config.displayName,
                    wiringBase: match
                      ? {
                          modelProfileId: match.config.modelProfileId ?? undefined,
                          skillIds: match.config.skillIds ?? [],
                          mcpServerIds: match.config.mcpServerIds ?? [],
                        }
                      : undefined,
                  })
                  setSwitchAgentMenu(null)
                }}
                onCreateAgent={() => {
                  setSwitchAgentMenu(null)
                  beginCreateAgentComposer('loop')
                  void setComposerMode('create_agent')
                }}
              />
            </div>,
            globalThis.document.body,
          )
        : null}

      {pendingDelete ? (
        <div className={styles.dialogBackdrop} role="presentation">
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label={pendingDeleteLabel}
          >
            <p>{pendingDeleteLabel}</p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => setPendingDelete(null)}
              >
                {ts('chat.loopGraph.deleteCancel')}
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void refineAuthoringTarget(pendingDelete)}
              >
                {ts('chat.loopGraph.deleteRefine')}
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonDanger}`}
                onClick={() => void removeAuthoringTarget(pendingDelete)}
              >
                {ts('chat.loopGraph.deleteRemove')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </GraphOverlayFrame>
  )
}
