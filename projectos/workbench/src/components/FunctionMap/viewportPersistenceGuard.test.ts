import { describe, expect, it, vi } from 'vitest'

import {
  createViewportPersistenceGuard,
  fitSingleMatchingNode,
} from './viewportPersistenceGuard'

describe('viewport persistence guard', () => {
  it('lets only the latest programmatic camera token clear suppression', () => {
    const callbacks: Array<() => void> = []
    const tokens: Array<ReturnType<typeof setTimeout>> = []
    const guard = createViewportPersistenceGuard(
      (callback) => {
        callbacks.push(callback)
        const token = setTimeout(() => {}, 60_000)
        tokens.push(token)
        return token
      },
      (token) => clearTimeout(token),
    )

    guard.suppressFor(100)
    guard.suppressFor(200)

    callbacks[0]?.()
    expect(guard.isSuppressed()).toBe(true)

    callbacks[1]?.()
    expect(guard.isSuppressed()).toBe(false)
    for (const token of tokens) clearTimeout(token)
  })

  it('suppresses persistence while fitting a single search result', () => {
    const callbacks: Array<() => void> = []
    const tokens: Array<ReturnType<typeof setTimeout>> = []
    const guard = createViewportPersistenceGuard(
      (callback) => {
        callbacks.push(callback)
        const token = setTimeout(() => {}, 60_000)
        tokens.push(token)
        return token
      },
      (token) => clearTimeout(token),
    )
    const fitView = vi.fn()

    expect(fitSingleMatchingNode(new Set(['match']), fitView, guard, 2.2)).toBe(true)
    expect(fitView).toHaveBeenCalledWith({
      nodes: [{ id: 'match' }],
      padding: 0.4,
      duration: 300,
      maxZoom: 2.2,
    })
    expect(guard.isSuppressed()).toBe(true)
    for (const token of tokens) clearTimeout(token)
    callbacks[0]()
    expect(guard.isSuppressed()).toBe(false)
  })
})
