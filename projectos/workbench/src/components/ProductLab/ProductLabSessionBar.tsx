import { useMemo } from 'react'
import {
  Bug,
  Bot,
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
import styles from './ProductLabSessionBar.module.css'

export default function ProductLabSessionBar() {
  const document = useProductLabStore((s) => s.document)
  const findingsOpen = useProductLabStore((s) => s.findingsOpen)
  const noteDraft = useProductLabStore((s) => s.noteDraft)
  const journeyBusy = useProductLabStore((s) => s.journeyBusy)
  const openFindingCount = useProductLabStore((s) => s.openFindingCount)
  const hasWebPreview = useProductLabStore((s) => {
    if (s.launchProfile) return s.launchProfile.hasWebPreview
    const id = s.document.activeSessionId
    const session = id
      ? s.document.sessions.find((entry) => entry.id === id)
      : null
    return Boolean(session?.previewUrl)
  })
  const setFindingsOpen = useProductLabStore((s) => s.setFindingsOpen)
  const setNoteDraft = useProductLabStore((s) => s.setNoteDraft)
  const recordManualFinding = useProductLabStore((s) => s.recordManualFinding)
  const runAgentJourney = useProductLabStore((s) => s.runAgentJourney)
  const importExternalFinding = useProductLabStore((s) => s.importExternalFinding)
  const endLab = useProductLabStore((s) => s.endLab)
  const dismissFinding = useProductLabStore((s) => s.dismissFinding)
  const handoffFinding = useProductLabStore((s) => s.handoffFinding)
  const markVerified = useProductLabStore((s) => s.markVerified)
  const showFindingOnMap = useProductLabStore((s) => s.showFindingOnMap)
  const { ts } = useI18n()

  const session = useMemo(() => getActiveLabSession(document), [document])
  const allFindings = useMemo(() => {
    if (!session) return []
    return document.findings.filter((finding) => finding.sessionId === session.id)
  }, [document, session])

  if (!session || session.status === 'ended') return null

  return (
    <div className={styles.root} data-testid="product-lab-session-bar">
      <div className={styles.bar}>
        <span className={styles.brand} aria-hidden>
          <FlaskConical size={14} strokeWidth={1.75} />
        </span>
        <div className={styles.meta}>
          <strong>{ts('productLab.title')}</strong>
          <span className={styles.status}>
            {ts(`productLab.status.${session.status}` as 'productLab.status.experiencing')}
            {session.scopeNodeIds.length > 0
              ? ` · ${ts('productLab.scoped')}`
              : ` · ${ts('productLab.wholeProject')}`}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFindingsOpen(!findingsOpen)}
          aria-expanded={findingsOpen}
          aria-label={ts('productLab.findingsToggle', { count: openFindingCount })}
        >
          <Bug size={14} strokeWidth={1.75} aria-hidden />
          {ts('productLab.findingsCount', { count: openFindingCount })}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={journeyBusy || !hasWebPreview}
          onClick={() => void runAgentJourney()}
          title={
            hasWebPreview
              ? ts('productLab.agentJourneyHint')
              : ts('productLab.agentJourneyUnavailable')
          }
        >
          <Bot size={14} strokeWidth={1.75} aria-hidden />
          {journeyBusy ? ts('productLab.agentJourneyRunning') : ts('productLab.agentJourney')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void endLab()}>
          {ts('productLab.end')}
        </Button>
      </div>

      {findingsOpen ? (
        <div className={styles.panel}>
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!noteDraft.trim()}
              title={ts('productLab.importExternalHint')}
              onClick={() =>
                void importExternalFinding({
                  title: noteDraft.trim().slice(0, 120),
                  detail: noteDraft.trim(),
                  evidenceBody: noteDraft.trim(),
                }).then(() => setNoteDraft(''))
              }
            >
              {ts('productLab.importExternal')}
            </Button>
          </form>
          <p className={styles.captureHint}>{ts('productLab.autoCaptureHint')}</p>

          {allFindings.length === 0 ? (
            <p className={styles.empty}>{ts('productLab.emptyFindings')}</p>
          ) : (
            <ul className={styles.list}>
              {allFindings.map((finding) => (
                <li key={finding.id} className={styles.item} data-status={finding.status}>
                  <div className={styles.itemMain}>
                    <strong>{finding.title}</strong>
                    <span className={styles.itemMeta}>
                      {ts(`productLab.kind.${finding.kind}` as 'productLab.kind.manual')}
                      {' · '}
                      {ts(
                        `productLab.findingStatus.${finding.status}` as 'productLab.findingStatus.open',
                      )}
                    </span>
                    {finding.detail ? (
                      <p className={styles.detail}>{finding.detail}</p>
                    ) : null}
                  </div>
                  <div className={styles.itemActions}>
                    {finding.nodeIds.length > 0 ? (
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => showFindingOnMap(finding.id)}
                        title={ts('productLab.showOnMap')}
                        aria-label={ts('productLab.showOnMap')}
                      >
                        <MapIcon size={14} strokeWidth={1.75} />
                      </button>
                    ) : null}
                    {finding.status === 'open' ||
                    finding.status === 'verified_still_broken' ? (
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
                          aria-label={ts('productLab.verifiedFixed')}
                        >
                          <CheckCircle2 size={14} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => void markVerified(finding.id, false)}
                          title={ts('productLab.stillBroken')}
                          aria-label={ts('productLab.stillBroken')}
                        >
                          <XCircle size={14} strokeWidth={1.75} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
