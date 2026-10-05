import { Mic } from 'lucide-react'
import ThinkingOrb from '../ui/ThinkingOrb'
import styles from './VoiceInputControls.module.css'

interface VoiceInputDockProps {
  isRecording: boolean
  isTranscribing: boolean
  busyLabel?: string
  centered?: boolean
  inline?: boolean
  labels: {
    start: string
    stop: string
    recording: string
  }
  micDisabled?: boolean
  isSupported: boolean
  onMicToggle: () => void
}

export function VoiceInputDock({
  isRecording,
  isTranscribing,
  busyLabel,
  centered = false,
  inline = false,
  labels,
  micDisabled,
  isSupported,
  onMicToggle,
}: VoiceInputDockProps) {
  const isActive = isRecording || isTranscribing
  const statusLabel =
    isTranscribing && busyLabel ? busyLabel : isRecording ? labels.recording : labels.start

  return (
    <div
      className={`${styles.inputDock} ${centered ? styles.inputDockCentered : ''} ${inline ? styles.inputDockInline : ''}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className={`${styles.voiceButton} ${isActive ? styles.voiceButtonActive : ''} ${isTranscribing ? styles.voiceButtonBusy : ''}`}
        onClick={onMicToggle}
        disabled={micDisabled || !isSupported || isTranscribing}
        aria-pressed={isActive}
        aria-busy={isTranscribing}
        aria-label={isActive ? labels.stop : labels.start}
        title={isActive ? labels.stop : labels.start}
      >
        {isActive ? (
          <ThinkingOrb state="listening" size={20} label={statusLabel} />
        ) : (
          <Mic size={16} aria-hidden />
        )}
      </button>
      <span className={styles.srOnly}>{statusLabel}</span>
    </div>
  )
}

export interface VoiceErrorLabels {
  notSupported: string
  permissionDenied: string
  serviceUnavailable: string
  transcriptionFailed: string
  missingApiKey: string
  missingModelProfile: string
  unsupportedModel: string
  modelDownloadFailed: string
  modelLoadFailed: string
  noSpeech: string
  unknown: string
}

const ERROR_LABEL_KEYS: Record<string, keyof VoiceErrorLabels> = {
  not_supported: 'notSupported',
  permission_denied: 'permissionDenied',
  service_unavailable: 'serviceUnavailable',
  transcription_failed: 'transcriptionFailed',
  missing_api_key: 'missingApiKey',
  missing_model_profile: 'missingModelProfile',
  unsupported_model: 'unsupportedModel',
  model_download_failed: 'modelDownloadFailed',
  model_load_failed: 'modelLoadFailed',
  no_speech: 'noSpeech',
  unknown: 'unknown',
}

interface ErrorBannerProps {
  errorKey?: string
  onDismiss?: () => void
  labels: VoiceErrorLabels
}

export function VoiceInputErrorBanner({ errorKey, onDismiss, labels }: ErrorBannerProps) {
  const labelKey = errorKey ? ERROR_LABEL_KEYS[errorKey] : undefined
  const errorMessage = labelKey ? labels[labelKey] : null

  if (!errorMessage) return null

  return (
    <div className={styles.errorRow} role="alert">
      <span>{errorMessage}</span>
      {onDismiss && (
        <button type="button" className={styles.dismissError} onClick={onDismiss}>
          ×
        </button>
      )}
    </div>
  )
}
