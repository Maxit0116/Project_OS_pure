import { useEffect, useMemo, useRef, useState } from 'react'
import { Network, X } from 'lucide-react'
import { sessionGraphShieldCssInsets } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useBottomDockStore } from '../../state/bottomDockStore'
import { useChatSessionStore } from '../../state/chatSessionStore'
import { useDiagramGraphStore } from '../../state/diagramGraphStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { GraphOverlayFrame } from '../GraphOverlay/GraphOverlayFrame'
import Button from '../ui/Button'
import WireframePackWorkspace from '../WireframePack/WireframePackWorkspace'
import DiagramGoalComposer from './DiagramGoalComposer'
import DiagramGraphRail from './DiagramGraphRail'
import DiagramNotebookRail from './DiagramNotebookRail'
import DiagramStagePager, { DiagramStyleOnboardingCard } from './DiagramStagePager'
import {
  collectDiagramIds,
  createDiagramRailFolder,
  emptyDiagramGraphRailLayout,
  findDiagramFolderEntry,
  insertDiagramFolderOnRail,
  insertDiagramOnRail,
  loadDiagramGraphRailLayout,
  moveDiagramFolderIntoFolder,
  moveDiagramIntoFolder,
  removeDiagramFromLayout,
  removeDiagramFolderFromLayout,
  renameDiagramRailFolder,
  saveDiagramGraphRailLayout,
  syncRailLayoutWithDiagrams,
  type DiagramGraphRailLayout,
} from './diagramGraphRailLayout'
import styles from './DiagramGraphOverlay.module.css'

export default function DiagramGraphOverlay() {
  const open = useChatSessionStore((s) => s.diagramGraphOpen)
  const setDiagramGraphOpen = useChatSessionStore((s) => s.setDiagramGraphOpen)
  const leftPanelOpen = useWorkbenchStore((s) => s.leftPanelOpen)
  const rightPanelOpen = useWorkbenchStore((s) => s.rightPanelOpen)
  const panelResizing = useWorkbenchStore((s) => s.panelResizing)
  const project = useWorkbenchStore((s) => s.project)
  const terminalOpen = useBottomDockStore((s) => s.open)
  const { ts } = useI18n()

  const artifacts = useDiagramGraphStore((s) => s.artifacts)
  const currentArtifactId = useDiagramGraphStore((s) => s.currentArtifactId)
  const busy = useDiagramGraphStore((s) => s.busy)
  const ensuring = useDiagramGraphStore((s) => s.ensuring)
  const skillStatus = useDiagramGraphStore((s) => s.skillStatus)
  const onboardingOpen = useDiagramGraphStore((s) => s.onboardingOpen)
  const loadForWorkspace = useDiagramGraphStore((s) => s.loadForWorkspace)
  const ensureSkill = useDiagramGraphStore((s) => s.ensureSkill)
  const chooseStyle = useDiagramGraphStore((s) => s.chooseStyle)
  const selectArtifact = useDiagramGraphStore((s) => s.selectArtifact)
  const beginNewDiagram = useDiagramGraphStore((s) => s.beginNewDiagram)
  const deleteArtifact = useDiagramGraphStore((s) => s.deleteArtifact)
  const clear = useDiagramGraphStore((s) => s.clear)
  const regenerateConfirm = useDiagramGraphStore((s) => s.regenerateConfirm)
  const cancelRegenerateConfirm = useDiagramGraphStore((s) => s.cancelRegenerateConfirm)
  const confirmRegenerate = useDiagramGraphStore((s) => s.confirmRegenerate)
  const surfaceMode = useDiagramGraphStore((s) => s.surfaceMode)
  const setSurfaceMode = useDiagramGraphStore((s) => s.setSurfaceMode)
  const setTypeHint = useDiagramGraphStore((s) => s.setTypeHint)
  const typeHint = useDiagramGraphStore((s) => s.typeHint)

  const [railLayout, setRailLayout] = useState<DiagramGraphRailLayout>(() =>
    emptyDiagramGraphRailLayout(),
  )
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const railLayoutRef = useRef(railLayout)
  railLayoutRef.current = railLayout

  const mergedRail = useMemo(
    () => syncRailLayoutWithDiagrams(railLayout, artifacts),
    [railLayout, artifacts],
  )
  const orderedDiagramIds = useMemo(
    () => collectDiagramIds(mergedRail.entries),
    [mergedRail.entries],
  )

  const persistRail = (next: DiagramGraphRailLayout) => {
    setRailLayout(next)
    if (project?.projectId) saveDiagramGraphRailLayout(project.projectId, next)
  }

  useEffect(() => {
    if (!open || !project) return
    void (async () => {
      await ensureSkill()
      await loadForWorkspace()
    })()
  }, [open, project, ensureSkill, loadForWorkspace])

  useEffect(() => {
    if (!project?.projectId) {
      setRailLayout(emptyDiagramGraphRailLayout())
      return
    }
    setRailLayout(loadDiagramGraphRailLayout(project.projectId))
  }, [project?.projectId])

  useEffect(() => {
    clear()
  }, [project?.projectId, clear])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (renamingFolderId) {
          setRenamingFolderId(null)
          return
        }
        setDiagramGraphOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, renamingFolderId, setDiagramGraphOpen])

  if (!open) return null

  const shield = sessionGraphShieldCssInsets({
    leftOpen: leftPanelOpen,
    rightOpen: rightPanelOpen,
    terminalOpen,
  })

  const statusLabel = ensuring
    ? ts('chat.diagramGraph.statusInstalling')
    : !skillStatus?.installed
      ? ts('chat.diagramGraph.statusMissing')
      : onboardingOpen
        ? ts('chat.diagramGraph.statusStylePending')
        : ts('chat.diagramGraph.statusReady')

  return (
    <GraphOverlayFrame
      shield={shield}
      resizing={panelResizing}
      label={ts('chat.diagramGraph.title')}
    >
      <div className={styles.root} data-diagram-graph-overlay="">
        <div className={styles.header}>
          <Network size={16} aria-hidden />
          <h2 className={styles.title}>{ts('chat.diagramGraph.title')}</h2>
          <span className={styles.statusChip}>{statusLabel}</span>
          <span className={styles.statusChip}>
            {surfaceMode === 'wireframe'
              ? ts('chat.diagramGraph.surfaceWireframe')
              : ts('chat.diagramGraph.surfaceDiagram')}
          </span>
          <div className={styles.headerSpacer} />
          <Button
            type="button"
            size="sm"
            variant={surfaceMode === 'diagram' ? 'primary' : 'ghost'}
            onClick={() => {
              setSurfaceMode('diagram')
              if (typeHint === 'ui-wireframe') setTypeHint('auto')
            }}
          >
            {ts('chat.diagramGraph.surfaceDiagram')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={surfaceMode === 'wireframe' ? 'primary' : 'ghost'}
            onClick={() => {
              setSurfaceMode('wireframe')
              setTypeHint('ui-wireframe')
            }}
          >
            {ts('chat.diagramGraph.surfaceWireframe')}
          </Button>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={ts('chat.diagramGraph.close')}
            title={ts('chat.diagramGraph.close')}
            onClick={() => setDiagramGraphOpen(false)}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className={styles.body}>
          {surfaceMode === 'wireframe' ? (
            <div className={styles.main}>
              <WireframePackWorkspace />
              <DiagramGoalComposer />
            </div>
          ) : (
            <>
              <DiagramGraphRail
                layout={mergedRail}
                items={artifacts}
                activeDiagramId={currentArtifactId}
                renamingFolderId={renamingFolderId}
                onOpen={(id) => void selectArtifact(id)}
                onCreate={beginNewDiagram}
                onCreateFolder={() => {
                  const created = createDiagramRailFolder(
                    railLayoutRef.current,
                    ts('chat.diagramGraph.folderUntitled'),
                  )
                  persistRail(created.layout)
                  setRenamingFolderId(created.folderId)
                }}
                onRenameFolder={(folderId, title) => {
                  persistRail(renameDiagramRailFolder(railLayoutRef.current, folderId, title))
                  setRenamingFolderId(null)
                }}
                onCancelRenameFolder={() => {
                  if (!renamingFolderId) return
                  const folder = findDiagramFolderEntry(
                    railLayoutRef.current.entries,
                    renamingFolderId,
                  )
                  if (
                    folder &&
                    folder.children.length === 0 &&
                    (!folder.title.trim() ||
                      folder.title.trim() === ts('chat.diagramGraph.folderUntitled'))
                  ) {
                    persistRail(
                      removeDiagramFolderFromLayout(railLayoutRef.current, renamingFolderId),
                    )
                  }
                  setRenamingFolderId(null)
                }}
                onRemoveDiagram={(diagramId) => {
                  void deleteArtifact(diagramId).then((ok) => {
                    if (ok) {
                      persistRail(removeDiagramFromLayout(railLayoutRef.current, diagramId))
                    }
                  })
                }}
                onRemoveFolder={(folderId) => {
                  if (renamingFolderId === folderId) setRenamingFolderId(null)
                  persistRail(removeDiagramFolderFromLayout(railLayoutRef.current, folderId))
                }}
                onMoveIntoFolder={(diagramId, folderId) =>
                  persistRail(moveDiagramIntoFolder(railLayoutRef.current, diagramId, folderId))
                }
                onMoveFolderIntoFolder={(folderId, targetFolderId) =>
                  persistRail(
                    moveDiagramFolderIntoFolder(
                      railLayoutRef.current,
                      folderId,
                      targetFolderId,
                    ),
                  )
                }
                onMoveToRail={(diagramId) =>
                  persistRail(insertDiagramOnRail(railLayoutRef.current, diagramId))
                }
                onMoveFolderToRail={(folderId) =>
                  persistRail(insertDiagramFolderOnRail(railLayoutRef.current, folderId))
                }
              />

              <div className={styles.main}>
                <div className={styles.stageRow}>
                  <DiagramStagePager
                    orderedDiagramIds={orderedDiagramIds}
                    onboarding={
                      <DiagramStyleOnboardingCard
                        busy={busy}
                        onChooseProjectOs={() => void chooseStyle('project-os-tech')}
                        onChooseDefault={() => void chooseStyle('default')}
                      />
                    }
                  />
                  <DiagramNotebookRail />
                </div>
                <DiagramGoalComposer />
              </div>
            </>
          )}
        </div>

        {regenerateConfirm ? (
          <div className={styles.modalShield} role="presentation">
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="diagram-regen-title"
              data-diagram-regen-confirm=""
            >
              <h3 id="diagram-regen-title" className={styles.modalTitle}>
                {ts('chat.diagramGraph.notebook.regenTitle')}
              </h3>
              <p className={styles.modalBody}>
                {ts('chat.diagramGraph.notebook.regenBody')}
              </p>
              <div className={styles.modalActions}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={cancelRegenerateConfirm}
                >
                  {ts('chat.diagramGraph.notebook.regenCancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void confirmRegenerate(false)}
                >
                  {ts('chat.diagramGraph.notebook.regenDiscard')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => void confirmRegenerate(true)}
                >
                  {ts('chat.diagramGraph.notebook.regenKeep')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </GraphOverlayFrame>
  )
}
