import { describe, expect, it } from 'vitest'
import { mergeBaseWithSpoken } from './mergeTranscript'
import { matchSubmitKeyword } from './submitKeyword'

describe('mergeBaseWithSpoken', () => {
  it('returns spoken text when base is empty', () => {
    expect(mergeBaseWithSpoken('', 'hello world')).toBe('hello world')
  })

  it('inserts a space between base and spoken text', () => {
    expect(mergeBaseWithSpoken('fix auth', 'and add tests')).toBe('fix auth and add tests')
  })

  it('preserves existing spacing', () => {
    expect(mergeBaseWithSpoken('fix auth ', 'and add tests')).toBe('fix auth and add tests')
  })
})

describe('matchSubmitKeyword', () => {
  it('detects configured submit keyword', () => {
    expect(matchSubmitKeyword('refactor login submit', ['submit'])).toEqual({
      isTrigger: true,
      spokenText: 'refactor login',
    })
  })

  it('ignores when keyword is not configured', () => {
    expect(matchSubmitKeyword('refactor login submit', [])).toEqual({
      isTrigger: false,
      spokenText: 'refactor login submit',
    })
  })
})
