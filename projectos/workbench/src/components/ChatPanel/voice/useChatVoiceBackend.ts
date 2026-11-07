import { useEffect, useMemo, useState } from 'react'
import type { ModelProfile, ProjectOSSettings } from '@contracts/index'
import { isDesktopApp } from '../../../data/clientMode'
import { loadVoiceSubmitKeywords, voiceLanguageFromLocale } from '../../../preferences/voiceInput'
import { useWorkbenchStore } from '../../../state/workbenchStore'
import type { Locale } from '../../../i18n/types'
import type { VoiceInputEngine } from './types'
import { profileSupportsWhisper } from './voiceInputErrors'
import { isLocalWhisperAvailable, transcribeBlobLocally } from './localWhisperTranscribe'

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!)
    return btoa(binary)
  })
}

export interface ChatVoiceBackendOptions {
  /**
   * Overlay / capture surfaces that are not hydrated via Zustand can pass a
   * project id + optional profiles so cloud transcription still works.
   */
  projectId?: string | null
  modelProfiles?: ModelProfile[]
  selectedModelProfileId?: string | null
  /** Prefer IPC `transcribeAudio` when no API client is available (Overlay). */
  preferInvoke?: boolean
}

export function useChatVoiceBackend(
  locale: Locale,
  options: ChatVoiceBackendOptions = {},
) {
  const client = useWorkbenchStore((s) => s.client)
  const project = useWorkbenchStore((s) => s.project)
  const settings = useWorkbenchStore((s) => s.settings)
  const storeSelectedModelProfileId = useWorkbenchStore((s) => s.selectedModelProfileId)

  const projectId = options.projectId ?? project?.projectId ?? null
  const selectedModelProfileId =
    options.selectedModelProfileId !== undefined
      ? options.selectedModelProfileId
      : storeSelectedModelProfileId

  const [invokedProfiles, setInvokedProfiles] = useState<ModelProfile[]>([])

  useEffect(() => {
    if (!options.preferInvoke || !projectId || !window.projectOS?.invoke) return
    if (options.modelProfiles && options.modelProfiles.length > 0) return
    let cancelled = false
    void window.projectOS
      .invoke('getSettings', projectId)
      .then((raw) => {
        if (cancelled) return
        const next = raw as ProjectOSSettings | null
        setInvokedProfiles(next?.modelProfiles ?? [])
      })
      .catch(() => {
        if (!cancelled) setInvokedProfiles([])
      })
    return () => {
      cancelled = true
    }
  }, [options.preferInvoke, options.modelProfiles, projectId])

  const modelProfiles =
    options.modelProfiles ??
    (options.preferInvoke ? invokedProfiles : settings?.modelProfiles) ??
    []

  const whisperProfiles = useMemo(
    () => modelProfiles.filter(profileSupportsWhisper),
    [modelProfiles],
  )

  const language = voiceLanguageFromLocale(locale)

  // The on-device model needs no project or backend, so it alone is enough to keep
  // us off the Web Speech API.
  const canBatchTranscribe =
    isLocalWhisperAvailable() ||
    (Boolean(projectId) && isDesktopApp())

  const engine: VoiceInputEngine = canBatchTranscribe ? 'batch' : 'webSpeech'

  const cloudTranscriptionProfileId = useMemo(() => {
    if (whisperProfiles.length === 0) return undefined
    if (
      selectedModelProfileId &&
      whisperProfiles.some((profile) => profile.id === selectedModelProfileId)
    ) {
      return selectedModelProfileId
    }
    return whisperProfiles.find((profile) => profile.isDefault)?.id ?? whisperProfiles[0]?.id
  }, [selectedModelProfileId, whisperProfiles])

  const transcribeBlob = useMemo(() => {
    if (!canBatchTranscribe) return undefined

    return async (blob: Blob) => {
      if (blob.size === 0) {
        throw new Error('No speech detected')
      }

      if (projectId && cloudTranscriptionProfileId) {
        try {
          const audioBase64 = await blobToBase64(blob)
          if (options.preferInvoke && window.projectOS?.invoke) {
            const result = (await window.projectOS.invoke('transcribeAudio', {
              projectId,
              audioBase64,
              mimeType: blob.type || 'audio/webm',
              modelProfileId: cloudTranscriptionProfileId,
            })) as { text?: string }
            const text = result.text?.trim() ?? ''
            if (text) return text
          } else if (client?.transcribeAudio) {
            const result = await client.transcribeAudio({
              projectId,
              audioBase64,
              mimeType: blob.type || 'audio/webm',
              modelProfileId: cloudTranscriptionProfileId,
            })
            const text = result.text.trim()
            if (text) return text
          }
        } catch (error) {
          console.warn('[voice] hosted transcription failed, falling back to on-device model', error)
          // Rethrowing preserves the specific backend reason (missing key, etc.)
          // when there is no local model to fall back to.
          if (!isLocalWhisperAvailable()) throw error
        }
      }

      if (isLocalWhisperAvailable()) {
        return transcribeBlobLocally(blob)
      }

      throw new Error('speech_not_supported')
    }
  }, [
    canBatchTranscribe,
    client,
    cloudTranscriptionProfileId,
    options.preferInvoke,
    projectId,
  ])

  const submitKeywords = useMemo(() => loadVoiceSubmitKeywords(), [])

  return {
    engine,
    transcribeBlob,
    submitKeywords,
    language,
  }
}
