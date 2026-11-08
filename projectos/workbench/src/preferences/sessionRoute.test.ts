import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SESSION_ROUTE_PREFERENCES,
  normalizeSessionRoutePreferences,
} from './sessionRoute'

describe('sessionRoute preferences', () => {
  it('defaults to enabled so the Route chip stays on', () => {
    expect(DEFAULT_SESSION_ROUTE_PREFERENCES.enabled).toBe(true)
    expect(normalizeSessionRoutePreferences(undefined).enabled).toBe(true)
    expect(normalizeSessionRoutePreferences({}).enabled).toBe(true)
  })

  it('respects an explicit off switch', () => {
    expect(normalizeSessionRoutePreferences({ enabled: false }).enabled).toBe(false)
  })
})
