import { useCallback, useMemo, useRef } from 'react'
import type { Locale } from '../../../i18n/types'
import { useI18n } from '../../../i18n'
import { mergeBaseWithSpoken } from '../voice/mergeTranscript'
import {
  useChatVoiceBackend,
  type ChatVoiceBackendOptions,
} from '../voice/useChatVoiceBackend'
import { useLocalWhisperStatus } from '../voice/useLocalWhisperStatus'
import { useVoiceInput } from '../voice/useVoiceInput'
import type { VoiceErrorLabels } from '../VoiceInputControls'

export interface ComposePromptVoiceOptions {
  locale: Locale
  disabled?: boolean
  /** Current prompt text for the active compose card. */
  getText: () => string
  /** Apply spoken / merged text into the active compose prompt. */
  setText: (text: string) => void
  /** Optional: fire submit after a voice submit keyword. */
  onSubmit?: (text: string) => void
  voiceBackendOptions?: ChatVoiceBackendOptions
}

/** Shared mic → transcript wiring for Chat / Overlay / Spatial Captures composers. */
export function useComposePromptVoice(options: ComposePromptVoiceOptions) {
  const {
    locale,
    disabled = false,
    getText,
    setText,
    onSubmit,
    voiceBackendOptions,
  } = options
  const { ts } = useI18n()
  const baseInputRef = useRef('')
  const voiceUpdatingRef = useRef(false)
  const voiceBackend = useChatVoiceBackend(locale, voiceBackendOptions)
  const whisperStatus = useLocalWhisperStatus()

  const applyVoiceText = useCallback(
    (spoken: string, commit = false) => {
      const merged = mergeBaseWithSpoken(baseInputRef.current, spoken)
      if (commit) baseInputRef.current = merged
      voiceUpdatingRef.current = true
      setText(merged)
      requestAnimationFrame(() => {
        voiceUpdatingRef.current = false
      })
      return merged
    },
    [setText],
  )

  const voice = useVoiceInput({
    language: voiceBackend.language,
    submitKeywords: voiceBackend.submitKeywords,
    engine: voiceBackend.engine,
    transcribeBlob: voiceBackend.transcribeBlob,
    disabled,
    onPartial: applyVoiceText,
    onFinal: (spoken) => {
      applyVoiceText(spoken, true)
    },
    onSubmitKeyword: (spoken) => {
      const merged = applyVoiceText(spoken, true)
      if (merged.trim()) onSubmit?.(merged)
    },
  })

  const beginRecordingFromCurrentText = useCallback(() => {
    if (!voice.isRecording && !voice.isTranscribing) {
      baseInputRef.current = getText()
    }
    voice.toggle()
  }, [getText, voice])

  const voiceLabels = useMemo(
    () => ({
      start: ts('chat.voice.start'),
      stop: ts('chat.voice.stop'),
      recording: ts('chat.voice.recording'),
      notSupported: ts('chat.voice.notSupported'),
      permissionDenied: ts('chat.voice.permissionDenied'),
      serviceUnavailable: ts('chat.voice.serviceUnavailable'),
      transcriptionFailed: ts('chat.voice.transcriptionFailed'),
      missingApiKey: ts('chat.voice.missingApiKey'),
      missingModelProfile: ts('chat.voice.missingModelProfile'),
      unsupportedModel: ts('chat.voice.unsupportedModel'),
      modelDownloadFailed: ts('chat.voice.modelDownloadFailed'),
      modelLoadFailed: ts('chat.voice.modelLoadFailed'),
      noSpeech: ts('chat.voice.noSpeech'),
      unknown: ts('chat.voice.unknown'),
    }),
    [ts],
  )

  const voiceBusyLabel =
    whisperStatus.phase === 'loading'
      ? `${ts('chat.voice.loadingModel')} ${Math.round(whisperStatus.progress * 100)}%`
      : ts('chat.voice.transcribing')

  const dockProps = {
    isRecording: voice.isRecording,
    isTranscribing: voice.isTranscribing,
    busyLabel: voiceBusyLabel,
    labels: {
      start: voiceLabels.start,
      stop: voiceLabels.stop,
      recording: voiceLabels.recording,
    },
    micDisabled: disabled,
    isSupported: voice.isSupported,
    onMicToggle: beginRecordingFromCurrentText,
  }

  return {
    voice,
    voiceLabels: voiceLabels as VoiceErrorLabels & typeof voiceLabels,
    voiceBusyLabel,
    dockProps,
    voiceUpdatingRef,
    syncBaseFromExternalText: (text: string) => {
      if (!voiceUpdatingRef.current) baseInputRef.current = text
    },
    cancelVoice: voice.cancel,
    stopVoice: voice.stop,
  }
}
