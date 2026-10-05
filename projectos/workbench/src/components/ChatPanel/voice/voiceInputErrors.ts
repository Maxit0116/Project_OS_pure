import type { ModelProfile } from '@contracts/index'
import { ProjectOSError } from '../../../../../errors.js'

export function profileSupportsWhisper(profile: ModelProfile): boolean {
  if (profile.apiFormat !== 'openai_chat') return false
  if (profile.provider === 'openai') return true
  const base = (profile.baseUrl ?? '').toLowerCase()
  return base.includes('openai.com')
}

export function mapVoiceInputError(error: unknown): string {
  if (error instanceof ProjectOSError) {
    switch (error.code) {
      case 'speech_transcription_failed': {
        const message = error.message.toLowerCase()
        if (message.includes('api key')) return 'missing_api_key'
        if (message.includes('openai-compatible')) return 'unsupported_model'
        if (message.includes('configure a model profile')) return 'missing_model_profile'
        if (message.includes('no speech detected')) return 'no_speech'
        return 'transcription_failed'
      }
      case 'project_not_loaded':
        return 'transcription_failed'
      default:
        return 'transcription_failed'
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message === 'model_download_failed') return 'model_download_failed'
    if (message === 'model_load_failed') return 'model_load_failed'
    if (message.includes('api key')) return 'missing_api_key'
    if (message.includes('openai-compatible')) return 'unsupported_model'
    if (message.includes('configure a model profile')) return 'missing_model_profile'
    if (message.includes('no speech detected')) return 'no_speech'
    if (message.includes('not-allowed') || message.includes('permission')) return 'permission_denied'
    if (message.includes('network') || message.includes('service-not-available')) {
      return 'service_unavailable'
    }
    if (message.includes('speech_not_supported') || message.includes('recorder_error')) {
      return 'not_supported'
    }
    if (
      message.includes('buffer') ||
      message.includes('transcri') ||
      message.includes('decode')
    ) {
      return 'transcription_failed'
    }
  }

  console.error('[voice] unrecognised voice input failure', error)
  return 'unknown'
}

export function mapSpeechRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission_denied'
    case 'network':
    case 'service-not-available':
      return 'service_unavailable'
    case 'speech_not_supported':
    case 'recorder_error':
      return 'not_supported'
    default:
      return mapVoiceInputError(new Error(code))
  }
}
