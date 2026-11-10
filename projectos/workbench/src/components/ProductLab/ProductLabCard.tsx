import { useMemo } from 'react'
import {
  Bug,
  CheckCircle2,
  FlaskConical,
  Map as MapIcon,
  XCircle,
} from 'lucide-react'
import { useI18n } from '../../i18n'
import { getActiveLabSession } from '../../../../services/product-lab/index'
import { useProductLabStore } from '../../state/productLabStore'
import Button from '../ui/Button'
import TextInput from '../ui/TextInput'
import refinementStyles from '../ChatPanel/PromptRefinementCard.module.css'
import styles from './ProductLabCard.module.css'

export default function ProductLabCard() {
  const document = useProductLabStore((s) => s.document)
  const launchProfile = useProductLabStore((s) => s.launchProfile)
  const noteDraft = useProductLabStore((s) => s.noteDraft)
  const journeyBusy = useProductLabStore((s) => s.journeyBusy)
  const draftDebugListIds = useProductLabStore((s) => s.draftDebugListIds)
  const setNoteDraft = useProductLabStore((s) => s.setNoteDraft)
  const recordManualFinding = useProductLabStore((s) => s.recordManualFinding)
  const beginReview = useProductLabStore((s) => s.beginReview)
  const toggleDebugListItem = useProductLabStore((s) => s.toggleDebugListItem)
  const confirmDebugList = useProductLabStore((s) => s.confirmDebugList)
  const continueAfterBootstrap = useProductLabStore((s) => s.continueAfterBootstrap)
  const openMarketplace = useProductLabStore((s) => s.openMarketplaceFromLab)
  const runAgentJourney = useProductLabStore((s) => s.runAgentJourney)
  const endLab = useProductLabStore((s) => s.endLab)
  const dismissFinding = useProductLabStore((s) => s.dismissFinding)
  const handoffFinding = useProductLabStore((s) => s.handoffFinding)
  const markVerified = useProductLabStore((s) => s.markVerified)
  const showFindingOnMap = useProductLabStore((s) => s.showFindingOnMap)
  const { ts } = useI18n()

  const session = useMemo(() => getActiveLabSession(document), [document])
  const findings = useMemo(() => {
    if (!session) return []
    return document.findings.filter((finding) => finding.sessionId === session.id)
  }, [document, session])

  if (!session || session.status === 'ended') return null

  const phase = session.cardPhase
  const hasWebPreview = launchProfile?.hasWebPreview ?? Boolean(session.previewUrl)
  const proposals = session.capabilityProposals
  const pendingProposals = proposals.filter(
    (p) => p.status === 'proposed' || p.status === 'installing' || p.status === 'failed',
  )

  return (
    <aside
      className={`${refinementStyles.card} ${styles.labCard} fade-slide-up`}
      data-testid="product-lab-card"
      aria-label={ts('productLab.title')}
    >
      <div className={refinementStyles.header}>
        <div className={styles.titleRow}>
          <FlaskConical size={16} strokeWidth={1.75} aria-hidden />
          <span className={refinementStyles.title}>{ts('productLab.title')}</span>
        </div>
        <span className={refinementStyles.badge}>
          {ts(`productLab.cardPhase.${phase}` as 'productLab.cardPhase.experiencing')}
        </span>
      </div>

      <p className={refinementStyles.explanation}>
        {phase === 'bootstrapping'
          ? ts('productLab.card.bootstrapHint')
          : phase === 'experiencing'
            ? ts('productLab.card.experienceHint')
            : phase === 'reviewing'
              ? ts('productLab.card.reviewHint')
              : ts('productLab.card.fixHint')}
      </p>

      {phase === 'bootstrapping' ? (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>{ts('productLab.card.capabilities')}</h4>
          {session.capabilityNeeds.length > 0 ? (
            <ul className={styles.needList}>
              {session.capabilityNeeds.map((need) => (
                <li key={need}>{need}</li>
              ))}
            </ul>
          ) : null}
          <p className={styles.muted}>
            {ts('productLab.card.bootstrapInMarketplace', {
              pending: pendingProposals.length,
            })}
          </p>
          <div className={styles.rowActions}>
            <Button size="sm" variant="secondary" onClick={() => openMarketplace()}>
              {ts('productLab.card.openCapabilityPrep')}
            </Button>
            <Button size="sm" onClick={() => void continueAfterBootstrap()}>
              {ts('productLab.card.continueExperience')}
            </Button>
          </div>
        </div>
      ) : null}

      {(phase === 'experiencing' || phase === 'reviewing' || phase === 'fixing') && (
        <div className={styles.section}>
          <form
            className={styles.noteRow}
            onSubmit={(event) => {
              event.preventDefault()
              void recordManualFinding()
            }}
          >
            <TextInput
              fieldClassName={styles.noteFieldGrow}
              size="sm"
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={ts('productLab.notePlaceholder')}
              aria-label={ts('productLab.notePlaceholder')}
            />
            <Button type="submit" size="sm" disabled={!noteDraft.trim()}>
              {ts('productLab.record')}
            </Button>
          </form>

          <h4 className={styles.sectionTitle}>
            <Bug size={12} aria-hidden /> {ts('productLab.card.findings')}
            {` (${findings.filter((f) => f.status === 'open' || f.status === 'verified_still_broken').length})`}
          </h4>

          {findings.length === 0 ? (
            <p className={styles.muted}>{ts('productLab.emptyFindings')}</p>
          ) : (
            <ul className={styles.findingList}>
              {findings.map((finding) => {
                const inDraft =
                  phase === 'reviewing'
                    ? draftDebugListIds.includes(finding.id)
                    : session.debugListFindingIds?.includes(finding.id) ?? true
                const showHandoff =
                  phase === 'fixing' &&
                  (session.debugListFindingIds?.includes(finding.id) ?? false) &&
                  (finding.status === 'open' || finding.status === 'verified_still_broken')
                return (
                  <li key={finding.id} className={styles.finding} data-status={finding.status}>
                    {phase === 'reviewing' ? (
                      <label className={styles.check}>
                        <input
                          type="checkbox"
                          checked={inDraft}
                          onChange={() => toggleDebugListItem(finding.id)}
                        />
                      </label>
                    ) : null}
                    <div className={styles.findingMain}>
                      <strong>{finding.title}</strong>
                      <span className={styles.meta}>
                        {ts(`productLab.kind.${finding.kind}` as 'productLab.kind.manual')}
                        {' · '}
                        {ts(
                          `productLab.findingStatus.${finding.status}` as 'productLab.findingStatus.open',
                        )}
                      </span>
                      {finding.detail ? <p className={styles.detail}>{finding.detail}</p> : null}
                    </div>
                    <div className={styles.rowActions}>
                      {finding.nodeIds.length > 0 ? (
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => showFindingOnMap(finding.id)}
                          title={ts('productLab.showOnMap')}
                        >
                          <MapIcon size={14} />
                        </button>
                      ) : null}
                      {showHandoff ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handoffFinding(finding.id)}
                          >
                            {ts('productLab.fix')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void dismissFinding(finding.id)}
                          >
                            {ts('productLab.dismiss')}
                          </Button>
                        </>
                      ) : null}
                      {finding.status === 'fix_proposed' ||
                      finding.status === 'handed_off' ||
                      finding.status === 'fix_applied' ? (
                        <>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => void markVerified(finding.id, true)}
                            title={ts('productLab.verifiedFixed')}
                          >
                            <CheckCircle2 size={14} />
                          </button>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => void markVerified(finding.id, false)}
                            title={ts('productLab.stillBroken')}
                          >
                            <XCircle size={14} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div className={styles.footer}>
        {phase === 'experiencing' ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={journeyBusy || !hasWebPreview}
              onClick={() => void runAgentJourney()}
              title={
                hasWebPreview
                  ? ts('productLab.agentJourneyHint')
                  : ts('productLab.agentJourneyUnavailable')
              }
            >
              {journeyBusy ? ts('productLab.agentJourneyRunning') : ts('productLab.agentJourney')}
            </Button>
            <Button size="sm" onClick={() => void beginReview()}>
              {ts('productLab.card.endExperience')}
            </Button>
          </>
        ) : null}
        {phase === 'reviewing' ? (
          <Button size="sm" onClick={() => void confirmDebugList()}>
            {ts('productLab.card.confirmDebugList', { count: draftDebugListIds.length })}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => void endLab()}>
          {ts('productLab.end')}
        </Button>
      </div>
    </aside>
  )
}
