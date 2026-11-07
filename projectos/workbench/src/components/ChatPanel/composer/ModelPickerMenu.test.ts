import { describe, expect, it } from 'vitest'

import type { ModelProfile } from '@contracts/index'
import { filterModelProfiles } from './ModelPickerMenu'

const profiles: ModelProfile[] = [
  {
    id: 'reasoning',
    name: 'Reasoning model',
    provider: 'custom',
    displayName: 'Deep Thinker',
    apiFormat: 'openai_chat',
    model: 'reasoner-v2',
    baseUrl: 'https://example.invalid',
    apiKeyRef: '',
  },
  {
    id: 'local-fast',
    name: 'Fast local model',
    provider: 'ollama',
    model: 'qwen-fast',
    apiKeyRef: '',
  },
]

describe('filterModelProfiles', () => {
  it('matches labels, providers, and model identifiers case-insensitively', () => {
    expect(filterModelProfiles(profiles, 'deep')).toEqual([profiles[0]])
    expect(filterModelProfiles(profiles, 'OLLAMA qwen')).toEqual([profiles[1]])
    expect(filterModelProfiles(profiles, 'reasoner-v2')).toEqual([profiles[0]])
  })

  it('returns all profiles for blank search and none for an unknown value', () => {
    expect(filterModelProfiles(profiles, '   ')).toEqual(profiles)
    expect(filterModelProfiles(profiles, 'missing')).toEqual([])
  })
})
