import { describe, expect, it } from 'vitest'
import {
  buildSessionStripWorkingUnits,
  sessionStripWorkingScript,
  splitSessionStripTitleUnits,
} from './sessionStripWorkingTitleModel'

describe('sessionStripWorkingScript', () => {
  it('uses latin cascade when there is no CJK', () => {
    expect(sessionStripWorkingScript('Fix the login redirect')).toBe('latin')
  })

  it('uses cjk cascade when any Han character is present', () => {
    expect(sessionStripWorkingScript('修复 login')).toBe('cjk')
    expect(sessionStripWorkingScript('ログインを直す')).toBe('cjk')
  })
})

describe('buildSessionStripWorkingUnits', () => {
  it('pairs lower/upper for latin letters only', () => {
    const units = buildSessionStripWorkingUnits('Hi!')
    expect(units).toEqual([
      { raw: 'H', lower: 'h', upper: 'H', animates: true },
      { raw: 'i', lower: 'i', upper: 'I', animates: true },
      { raw: '!', animates: false },
    ])
  })

  it('animates cjk graphemes without case pairs', () => {
    const units = buildSessionStripWorkingUnits('修好它')
    expect(sessionStripWorkingScript('修好它')).toBe('cjk')
    expect(units.every((unit) => unit.animates && !unit.lower)).toBe(true)
    expect(units.map((unit) => unit.raw).join('')).toBe('修好它')
  })

  it('splits into grapheme units', () => {
    expect(splitSessionStripTitleUnits('a👍b').length).toBeGreaterThanOrEqual(3)
  })
})
