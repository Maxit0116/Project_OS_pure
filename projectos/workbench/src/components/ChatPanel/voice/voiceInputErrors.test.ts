import { describe, expect, it } from 'vitest'
import type { ModelProfile } from '@contracts/index'
import { ProjectOSError } from '../../../../../errors.js'
import { mapVoiceInputError, profileSupportsWhisper } from './voiceInputErrors'

describe('profileSupportsWhisper', () => {
  it('allows OpenAI provider profiles', () => {
    const profile = {
      id: 'openai',
      provider: 'openai',
      apiFormat: 'openai_chat',
      model: 'gpt-4o',
    } as ModelProfile
    expect(profileSupportsWhisper(profile)).toBe(true)
  })

  it('rejects DeepSeek-style custom profiles', () => {
    const profile = {
      id: 'deepseek',
      provider: 'custom',
      apiFormat: 'openai_chat',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    } as ModelProfile
    expect(profileSupportsWhisper(profile)).toBe(false)
  })
})

describe('mapVoiceInputError', () => {
  it('maps missing model profile errors', () => {
    expect(
      mapVoiceInputError(
        new ProjectOSError('speech_transcription_failed', 'Configure a model profile in Settings to use voice input'),
      ),
    ).toBe('missing_model_profile')
  })

  it('maps missing API key errors', () => {
    expect(
      mapVoiceInputError(
        new ProjectOSError('speech_transcription_failed', 'Model profile is missing an API key for speech transcription'),
      ),
    ).toBe('missing_api_key')
  })

  it('distinguishes an unreachable model host from a broken runtime', () => {
    expect(mapVoiceInputError(new Error('model_download_failed'))).toBe('model_download_failed')
    expect(mapVoiceInputError(new Error('model_load_failed'))).toBe('model_load_failed')
  })

  it('maps audio decoding failures to a transcription failure', () => {
    expect(mapVoiceInputError(new Error('Unable to decode audio data'))).toBe(
      'transcription_failed',
    )
  })
})
