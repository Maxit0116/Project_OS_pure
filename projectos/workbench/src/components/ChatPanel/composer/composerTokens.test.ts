import { describe, expect, it } from 'vitest'

import {
  appendAttachment,
  detectComposerTrigger,
  removeTriggerToken,
} from './composerTokens'
import { emptyComposerDraft } from '@contracts/index'

describe('composerTokens', () => {
  it('detects @ trigger before cursor', () => {
    const trigger = detectComposerTrigger('fix @aut', 8)
    expect(trigger?.kind).toBe('@')
    expect(trigger?.query).toBe('aut')
  })

  it('detects slash trigger at line start', () => {
    const trigger = detectComposerTrigger('/rev', 4)
    expect(trigger?.kind).toBe('/')
    expect(trigger?.query).toBe('rev')
  })

  it('removes trigger token from text', () => {
    const trigger = detectComposerTrigger('hello @file', 11)!
    expect(removeTriggerToken('hello @file', trigger)).toBe('hello ')
  })

  it('appends unique attachments only once', () => {
    const draft = emptyComposerDraft('hi')
    const attachment = {
      id: 'att_1',
      label: 'auth.ts',
      ref: { kind: 'file' as const, path: 'src/auth.ts' },
    }
    const once = appendAttachment(draft, attachment)
    const twice = appendAttachment(once, { ...attachment, id: 'att_2' })
    expect(once.attachments).toHaveLength(1)
    expect(twice.attachments).toHaveLength(1)
  })
})
