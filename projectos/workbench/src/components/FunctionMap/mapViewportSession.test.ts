import { afterEach, describe, expect, it } from 'vitest'
import {
  clearMapViewportSession,
  getUserMapViewport,
  peekMapViewportSession,
  rememberUserMapViewport,
  syncAutoMapViewport,
} from './mapViewportSession'

afterEach(() => {
  clearMapViewportSession()
})

describe('mapViewportSession', () => {
  it('does not restore auto-fit cameras as user viewports', () => {
    syncAutoMapViewport('g1', { x: 10, y: 20, zoom: 1 })
    expect(getUserMapViewport('g1')).toBeNull()
    expect(peekMapViewportSession()).toEqual({ x: 10, y: 20, zoom: 1 })
  })

  it('restores a user-controlled viewport for the same graph key', () => {
    rememberUserMapViewport('g1', { x: 40, y: -12, zoom: 1.4 })
    expect(getUserMapViewport('g1')).toEqual({ x: 40, y: -12, zoom: 1.4 })
  })

  it('ignores user viewport when the graph topology key changes', () => {
    rememberUserMapViewport('g1', { x: 40, y: -12, zoom: 1.4 })
    expect(getUserMapViewport('g2')).toBeNull()
  })

  it('does not let auto-fit overwrite a user-controlled session for the same key', () => {
    rememberUserMapViewport('g1', { x: 40, y: -12, zoom: 1.4 })
    syncAutoMapViewport('g1', { x: 0, y: 0, zoom: 1 })
    expect(getUserMapViewport('g1')).toEqual({ x: 40, y: -12, zoom: 1.4 })
  })

  it('allows auto-fit to replace the session after the graph key changes', () => {
    rememberUserMapViewport('g1', { x: 40, y: -12, zoom: 1.4 })
    syncAutoMapViewport('g2', { x: 1, y: 2, zoom: 0.8 })
    expect(getUserMapViewport('g1')).toBeNull()
    expect(getUserMapViewport('g2')).toBeNull()
    expect(peekMapViewportSession()).toEqual({ x: 1, y: 2, zoom: 0.8 })
  })
})
