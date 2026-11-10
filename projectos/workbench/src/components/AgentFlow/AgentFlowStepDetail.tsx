import { useRef, useState, type KeyboardEvent } from 'react'
import type { AgentFlowStep } from '@contracts/index'
import type { FlowCorrection } from '../../state/workbenchStore'
import { useWorkbenchStore } from '../../state/workbenchStore'
import { useI18n } from '../../i18n'
import { useComposePromptVoice } from '../ChatPanel/composer/useComposePromptVoice'
import {
  VoiceInputDock,
  VoiceInputErrorBanner,
} from '../ChatPanel/VoiceInputControls'
import Chip from '../ui/Chip'
import Button from '../ui/Button'
import { agentFlowStepLabel } from './stepLabel'
import styles from './AgentFlowStepDetail.module.css'

interface Props {
  step: AgentFlowStep
  corrections: FlowCorrection[]
  onClose: () => void
}

export default function AgentFlowStepDetail({ step, corrections, onClose }: Props) {
  const selectFile = useWorkbenchStore((s) => s.selectFile)
  const injectFlowCorrection = useWorkbenchStore((s) => s.injectFlowCorrection)
  const { ts, messages, locale } = useI18n()
  const [correction, setCorrection] = useState('')
  const correctionRef = useRef(correction)
  correctionRef.current = correction
  const stepIdRef = useRef(step.id)
  stepIdRef.current = step.id

  const composeVoice = useComposePromptVoice({
    locale,
    getText: () => correctionRef.current,
    setText: setCorrection,
    onSubmit: (text) => {
      if (!text.trim()) return
      void injectFlowCorrection(stepIdRef.current, text.trim())
      setCorrection('')
    },
  })

  const handleSubmitCorrection = () => {
    if (!correction.trim()) return
    if (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing) {
      composeVoice.stopVoice()
    }
    void injectFlowCorrection(step.id, correction.trim())
    setCorrection('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Escape' &&
      (composeVoice.voice.isRecording || composeVoice.voice.isTranscribing)
    ) {
      event.preventDefault()
      composeVoice.cancelVoice()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === 'Space') {
      event.preventDefault()
      composeVoice.dockProps.onMicToggle()
    }
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <h3>{ts('agentFlow.stepDetail')}</h3>
        <button type="button" className={styles.close} onClick={onClose}>×</button>
      </div>
      <div className={styles.body}>
        <p className={styles.label}>{agentFlowStepLabel(step, messages.agentFlow.stepKind)}</p>
        <p className={styles.kind}>{step.kind.replace(/_/g, ' ')}</p>
        {step.outputSummary && <p className={styles.summary}>{step.outputSummary}</p>}
        {step.relatedFiles.length > 0 && (
          <div className={styles.files}>
            {step.relatedFiles.map((f) => (
              <Chip key={f} onClick={() => selectFile(f)}>{f}</Chip>
            ))}
          </div>
        )}
        {corrections.length > 0 && (
          <div className={styles.correctionHistory}>
            <span className={styles.correctionLabel}>{ts('agentFlow.correctionHistory')}</span>
            <ul>
              {corrections.map((c) => (
                <li key={c.id}>{c.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div className={styles.correction}>
          <label className={styles.correctionLabel}>{ts('agentFlow.correction')}</label>
          {composeVoice.voice.state.error ? (
            <VoiceInputErrorBanner
              errorKey={composeVoice.voice.state.error}
              onDismiss={composeVoice.voice.dismissError}
              labels={composeVoice.voiceLabels}
            />
          ) : null}
          <div className={styles.correctionWrap}>
            <textarea
              className={styles.correctionInput}
              value={correction}
              onChange={(e) => {
                const value = e.target.value
                setCorrection(value)
                composeVoice.syncBaseFromExternalText(value)
              }}
              onKeyDown={onKeyDown}
              placeholder={ts('agentFlow.correctionPlaceholder')}
              rows={2}
            />
            <VoiceInputDock {...composeVoice.dockProps} />
          </div>
          <Button size="sm" onClick={handleSubmitCorrection}>
            {ts('agentFlow.submitCorrection')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
