import { describe, expect, it } from 'vitest'
import { mapTextLanguage } from './mapTextLanguage'

describe('mapTextLanguage', () => {
  it('tells a Chinese map from an English one by its node names', () => {
    expect(mapTextLanguage([{ name: '登录与注册' }, { name: '订单' }, { name: 'API' }])).toBe('zh')
    expect(mapTextLanguage([{ name: 'Sign in and sign up' }, { name: 'Orders' }, { name: '订单' }])).toBe('en')
  })

  it('says nothing about a map without names', () => {
    expect(mapTextLanguage([])).toBeNull()
    expect(mapTextLanguage(null)).toBeNull()
    expect(mapTextLanguage([{ name: ' ' }, {}])).toBeNull()
  })
})
