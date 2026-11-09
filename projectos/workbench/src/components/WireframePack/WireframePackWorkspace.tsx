import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { useWireframePackStore } from '../../state/wireframePackStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import styles from './WireframePackWorkspace.module.css'

/**
 * Wireframe Screen Pack workspace hosted inside Diagram Graph (not a parallel overlay).
 */
export default function WireframePackWorkspace() {
  const project = useWorkbenchStore((s) => s.project)
  const pushToast = useWorkbenchStore((s) => s.pushToast)
  const selectedNodeId = useWorkbenchStore((s) => s.selectedNodeId)
  const { ts } = useI18n()

  const packs = useWireframePackStore((s) => s.packs)
  const currentPack = useWireframePackStore((s) => s.currentPack)
  const currentScreenId = useWireframePackStore((s) => s.currentScreenId)
  const gaps = useWireframePackStore((s) => s.gaps)
  const stageMode = useWireframePackStore((s) => s.stageMode)
  const previewHtml = useWireframePackStore((s) => s.previewHtml)
  const implementBrief = useWireframePackStore((s) => s.implementBrief)
  const busy = useWireframePackStore((s) => s.busy)
  const error = useWireframePackStore((s) => s.error)
  const setStageMode = useWireframePackStore((s) => s.setStageMode)
  const setPreviewHtml = useWireframePackStore((s) => s.setPreviewHtml)
  const loadForWorkspace = useWireframePackStore((s) => s.loadForWorkspace)
  const selectPack = useWireframePackStore((s) => s.selectPack)
  const selectScreen = useWireframePackStore((s) => s.selectScreen)
  const deleteScreen = useWireframePackStore((s) => s.deleteScreen)
  const freeze = useWireframePackStore((s) => s.freeze)
  const buildImplementBrief = useWireframePackStore((s) => s.buildImplementBrief)
  const handOffImplementToAgent = useWireframePackStore((s) => s.handOffImplementToAgent)
  const scanStructGaps = useWireframePackStore((s) => s.scanStructGaps)
  const bindSelectedFeature = useWireframePackStore((s) => s.bindSelectedFeature)
  const upsertGap = useWireframePackStore((s) => s.upsertGap)
  const acceptIntentional = useWireframePackStore((s) => s.acceptIntentional)
  const closeGap = useWireframePackStore((s) => s.closeGap)
  const markRealized = useWireframePackStore((s) => s.markRealized)
  const clear = useWireframePackStore((s) => s.clear)

  const [gapDraft, setGapDraft] = useState('')

  useEffect(() => {
    if (!project) return
    void loadForWorkspace()
  }, [project, loadForWorkspace])

  useEffect(() => {
    clear()
  }, [project?.projectId, clear])

  const currentScreen = useMemo(
    () => currentPack?.screens.find((screen) => screen.id === currentScreenId) ?? null,
    [currentPack, currentScreenId],
  )

  const openGaps = gaps.filter(
    (gap) => gap.status === 'open' || gap.status === 'fixing',
  )

  const canFreeze = Boolean(currentPack && currentPack.status === 'draft')
  const canImplement = Boolean(
    currentPack && (currentPack.status === 'frozen' || currentPack.status === 'realized'),
  )

  const onFreeze = async (mode: 'full' | 'main_path' = 'full') => {
    const frozen = await freeze(mode)
    if (frozen) {
      pushToast({
        type: 'success',
        message: ts('chat.wireframePack.freezeSuccess', {
          version: String(frozen.version),
          mode: frozen.freezeMeta?.mode ?? mode,
        }),
        autoDismiss: 2500,
      })
    }
  }

  const onImplement = async () => {
    const brief = await buildImplementBrief()
    if (!brief) return
    try {
      await navigator.clipboard.writeText(brief.promptForAgent)
      pushToast({
        type: 'success',
        message: ts('chat.wireframePack.briefCopied'),
        autoDismiss: 2500,
      })
    } catch {
      pushToast({
        type: 'info',
        message: ts('chat.wireframePack.briefReady'),
        autoDismiss: 2500,
      })
    }
  }

  const onHandOff = async () => {
    const brief = await handOffImplementToAgent()
    if (brief) {
      pushToast({
        type: 'success',
        message: ts('chat.wireframePack.handOffSuccess', {
          ref: brief.acceptanceRef,
        }),
        autoDismiss: 3500,
      })
    }
  }

  const onAddGap = () => {
    if (!currentScreen || !gapDraft.trim()) return
    void upsertGap({
      screenId: currentScreen.id,
      layer: 'layout',
      severity: 'major',
      summary: gapDraft.trim(),
    })
    setGapDraft('')
  }

  const onAccept = async () => {
    const realized = await markRealized()
    if (realized) {
      pushToast({
        type: 'success',
        message: ts('chat.wireframePack.acceptSuccess'),
        autoDismiss: 4000,
      })
      pushToast({
        type: 'info',
        message: realized.featureId
          ? ts('chat.wireframePack.featuresSyncHintBound', {
              featureId: realized.featureId,
            })
          : ts('chat.wireframePack.featuresSyncHint'),
        autoDismiss: 5000,
      })
    }
  }

  return (
    <div className={styles.root} data-wireframe-pack-workspace="">
      <div className={styles.header}>
        <span className={styles.statusChip}>
          {busy
            ? ts('chat.wireframePack.statusBusy')
            : currentPack
              ? `${currentPack.status}${currentPack.version > 0 ? ` v${currentPack.version}` : ''}`
              : ts('chat.wireframePack.statusIdle')}
        </span>
        {currentPack?.featureId ? (
          <span className={styles.statusChip} title={ts('chat.wireframePack.featureBound')}>
            {ts('chat.wireframePack.featureBadge', { id: currentPack.featureId })}
          </span>
        ) : null}
        {currentPack?.freezeMeta?.mode === 'main_path' ? (
          <span className={styles.statusChip}>
            {ts('chat.wireframePack.partialFreezeBadge')}
          </span>
        ) : null}
        <div className={styles.headerSpacer} />
        <p className={styles.hint}>{ts('chat.wireframePack.hostedInDiagram')}</p>
      </div>

      <div className={styles.body}>
        <aside className={styles.rail} aria-label={ts('chat.wireframePack.rail')}>
          <div className={styles.railHead}>{ts('chat.wireframePack.packs')}</div>
          {packs.length === 0 ? (
            <div className={styles.empty}>{ts('chat.wireframePack.packsEmpty')}</div>
          ) : (
            packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                className={`${styles.railItem} ${
                  currentPack?.id === pack.id ? styles.railItemActive : ''
                }`}
                onClick={() => void selectPack(pack.id)}
              >
                <span>{pack.title}</span>
                <span className={styles.railMeta}>
                  {pack.status}
                  {pack.version > 0 ? ` · v${pack.version}` : ''} · {pack.screenCount}{' '}
                  {ts('chat.wireframePack.screens')}
                </span>
              </button>
            ))
          )}
          {currentPack ? (
            <>
              <div className={styles.railHead}>{ts('chat.wireframePack.screens')}</div>
              {currentPack.screens.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  className={`${styles.railItem} ${
                    currentScreenId === screen.id ? styles.railItemActive : ''
                  }`}
                  onClick={() => selectScreen(screen.id)}
                >
                  <span>{screen.title}</span>
                  <span className={styles.railMeta}>{screen.role}</span>
                </button>
              ))}
            </>
          ) : null}
        </aside>

        <div className={styles.main}>
          <div className={styles.toolbar}>
            <Button
              type="button"
              size="sm"
              variant={stageMode === 'wireframe' ? 'primary' : 'secondary'}
              onClick={() => setStageMode('wireframe')}
            >
              {ts('chat.wireframePack.modeWireframe')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={stageMode === 'split' ? 'primary' : 'secondary'}
              onClick={() => setStageMode('split')}
              disabled={!currentPack}
            >
              {ts('chat.wireframePack.modeSplit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canFreeze || busy}
              onClick={() => void onFreeze('full')}
            >
              {ts('chat.wireframePack.freeze')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canFreeze || busy}
              title={ts('chat.wireframePack.freezeMainPathHint')}
              onClick={() => void onFreeze('main_path')}
            >
              {ts('chat.wireframePack.freezeMainPath')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={!canImplement || busy}
              title={
                canImplement ? undefined : ts('chat.wireframePack.implementDisabled')
              }
              onClick={() => void onImplement()}
            >
              {ts('chat.wireframePack.implement')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canImplement || busy}
              onClick={() => void onHandOff()}
            >
              {ts('chat.wireframePack.handOffAgent')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!currentPack || busy}
              onClick={() => void scanStructGaps()}
            >
              {ts('chat.wireframePack.scanStruct')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!currentPack || !selectedNodeId || busy}
              title={
                selectedNodeId
                  ? ts('chat.wireframePack.bindFeatureHint')
                  : ts('chat.wireframePack.bindFeatureDisabled')
              }
              onClick={() => void bindSelectedFeature()}
            >
              {ts('chat.wireframePack.bindFeature')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canImplement || busy}
              onClick={() => void onAccept()}
            >
              {ts('chat.wireframePack.accept')}
            </Button>
            {currentPack?.status === 'draft' && currentScreen ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy || currentPack.screens.length <= 1}
                onClick={() => void deleteScreen(currentScreen.id)}
              >
                {ts('chat.wireframePack.deleteScreen')}
              </Button>
            ) : null}
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {busy && !currentPack ? (
            <div className={styles.loading}>{ts('chat.wireframePack.generating')}</div>
          ) : !currentScreen ? (
            <div className={styles.empty}>{ts('chat.wireframePack.emptyInDiagram')}</div>
          ) : (
            <div
              className={`${styles.stage} ${stageMode === 'split' ? styles.stageSplit : ''}`}
            >
              <div className={styles.pane}>
                <div className={styles.paneLabel}>
                  {ts('chat.wireframePack.wireframePane')} · {currentScreen.title}
                </div>
                <iframe
                  className={styles.frame}
                  title={ts('chat.wireframePack.preview')}
                  sandbox=""
                  srcDoc={currentScreen.html ?? ''}
                />
              </div>
              {stageMode === 'split' ? (
                <div className={styles.pane}>
                  <div className={styles.paneLabel}>
                    {ts('chat.wireframePack.previewPane')}
                  </div>
                  {previewHtml.trim() ? (
                    <iframe
                      className={styles.frame}
                      title={ts('chat.wireframePack.previewCompare')}
                      sandbox=""
                      srcDoc={previewHtml}
                    />
                  ) : (
                    <textarea
                      className={styles.previewEditor}
                      value={previewHtml}
                      placeholder={ts('chat.wireframePack.previewPlaceholder')}
                      onChange={(event) => setPreviewHtml(event.target.value)}
                      aria-label={ts('chat.wireframePack.previewPlaceholder')}
                    />
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <aside className={styles.side} aria-label={ts('chat.wireframePack.notebook')}>
          <div className={styles.sideSection}>
            <h3>{ts('chat.wireframePack.flow')}</h3>
            {currentPack && currentPack.flow.length > 0 ? (
              <ul className={styles.flowList}>
                {currentPack.flow.map((edge) => {
                  const from =
                    currentPack.screens.find((s) => s.id === edge.fromScreenId)?.title ??
                    edge.fromScreenId
                  const to =
                    currentPack.screens.find((s) => s.id === edge.toScreenId)?.title ??
                    edge.toScreenId
                  return (
                    <li key={edge.id}>
                      {from} → {to}
                      {edge.label ? ` · ${edge.label}` : ''}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className={styles.hint}>{ts('chat.wireframePack.flowEmpty')}</p>
            )}
          </div>

          <div className={styles.sideSection}>
            <h3>{ts('chat.wireframePack.regions')}</h3>
            {currentScreen && currentScreen.regions.length > 0 ? (
              <ul className={styles.regionList}>
                {currentScreen.regions.map((region) => (
                  <li key={region.id}>
                    <strong>{region.label}</strong>
                    {region.cta ? ` · ${region.cta}` : ''}
                    {region.intentBrief ? <div>{region.intentBrief}</div> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>{ts('chat.wireframePack.regionsEmpty')}</p>
            )}
          </div>

          <div className={styles.sideSection}>
            <h3>{ts('chat.wireframePack.gaps')}</h3>
            <p className={styles.hint}>{ts('chat.wireframePack.gapsHint')}</p>
            <div className={styles.composer} style={{ padding: '8px 0', border: 0 }}>
              <TextInput
                fieldClassName={styles.composerFieldGrow}
                size="sm"
                value={gapDraft}
                onChange={(event) => setGapDraft(event.target.value)}
                placeholder={ts('chat.wireframePack.gapPlaceholder')}
                disabled={!currentScreen}
                aria-label={ts('chat.wireframePack.gapPlaceholder')}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!currentScreen || !gapDraft.trim()}
                onClick={onAddGap}
              >
                {ts('chat.wireframePack.addGap')}
              </Button>
            </div>
            {openGaps.length === 0 ? (
              <p className={styles.hint}>{ts('chat.wireframePack.gapsEmpty')}</p>
            ) : (
              <ul className={styles.gapList}>
                {openGaps.map((gap) => (
                  <li key={gap.id} className={styles.gapItem}>
                    <strong>
                      [{gap.layer}/{gap.severity}] {gap.summary}
                    </strong>
                    <div className={styles.gapActions}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void closeGap(gap.id)}
                      >
                        {ts('chat.wireframePack.closeGap')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const note = window.prompt(
                            ts('chat.wireframePack.intentionalPrompt'),
                          )
                          if (note?.trim()) {
                            void acceptIntentional(gap.id, note.trim())
                          }
                        }}
                      >
                        {ts('chat.wireframePack.acceptIntentional')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.sideSection}>
            <h3>{ts('chat.wireframePack.nonGoals')}</h3>
            {currentPack?.nonGoals?.length ? (
              <ul className={styles.flowList}>
                {currentPack.nonGoals.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>{ts('chat.wireframePack.nonGoalsEmpty')}</p>
            )}
            <p className={styles.hint}>{ts('chat.wireframePack.stencilHint')}</p>
          </div>

          {implementBrief ? (
            <div className={styles.sideSection}>
              <h3>{ts('chat.wireframePack.brief')}</h3>
              <p className={styles.hint}>{implementBrief.acceptanceRef}</p>
              <pre className={styles.briefBox}>{implementBrief.promptForAgent}</pre>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
