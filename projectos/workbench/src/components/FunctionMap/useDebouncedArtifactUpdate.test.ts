import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hookHarness = vi.hoisted(() => {
  type Cleanup = () => void
  type Effect = () => void | Cleanup
  type Cell =
    | { kind: 'ref'; value: { current: unknown } }
    | { kind: 'memo'; deps: readonly unknown[]; value: unknown }
    | { kind: 'effect'; deps: readonly unknown[]; cleanup?: Cleanup }

  let cells: Cell[] = []
  let cursor = 0
  let pending: Array<{ index: number; deps: readonly unknown[]; effect: Effect }> = []
  const depsEqual = (left: readonly unknown[], right: readonly unknown[]) =>
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))

  return {
    beginRender() {
      cursor = 0
      pending = []
    },
    flushEffects() {
      for (const entry of pending) {
        const existing = cells[entry.index]
        if (existing?.kind === 'effect') existing.cleanup?.()
        const cleanup = entry.effect() || undefined
        cells[entry.index] = {
          kind: 'effect',
          deps: entry.deps,
          ...(cleanup ? { cleanup } : {}),
        }
      }
      pending = []
    },
    unmount() {
      for (const cell of cells) {
        if (cell?.kind === 'effect') cell.cleanup?.()
      }
      cells = []
      cursor = 0
      pending = []
    },
    useRef<T>(initial: T) {
      const index = cursor++
      const existing = cells[index]
      if (existing?.kind === 'ref') return existing.value as { current: T }
      const value = { current: initial }
      cells[index] = { kind: 'ref', value }
      return value
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) {
      const index = cursor++
      const existing = cells[index]
      if (existing?.kind === 'memo' && depsEqual(existing.deps, deps)) {
        return existing.value as T
      }
      cells[index] = { kind: 'memo', deps: [...deps], value: callback }
      return callback
    },
    useEffect(effect: Effect, deps: readonly unknown[]) {
      const index = cursor++
      const existing = cells[index]
      if (existing?.kind === 'effect' && depsEqual(existing.deps, deps)) return
      pending.push({ index, deps: [...deps], effect })
    },
  }
})

const updateMapArtifact = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('react', () => ({
  useCallback: hookHarness.useCallback,
  useEffect: hookHarness.useEffect,
  useRef: hookHarness.useRef,
}))

vi.mock('../../state/workbenchStore', () => ({
  useWorkbenchStore: (selector: (state: { updateMapArtifact: typeof updateMapArtifact }) => unknown) =>
    selector({ updateMapArtifact }),
}))

import { useDebouncedArtifactUpdate } from './useDebouncedArtifactUpdate'

function render(artifactId: string) {
  hookHarness.beginRender()
  const result = useDebouncedArtifactUpdate(artifactId)
  hookHarness.flushEffects()
  return result
}

describe('useDebouncedArtifactUpdate lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    updateMapArtifact.mockClear()
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    })
  })

  afterEach(() => {
    hookHarness.unmount()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('flushes the pending old-artifact patch before an artifact id change', () => {
    const first = render('artifact_a')
    const patch = { position: { x: 10, y: 20 } }
    first.schedule(patch)

    render('artifact_b')

    expect(updateMapArtifact).toHaveBeenCalledOnce()
    expect(updateMapArtifact).toHaveBeenCalledWith('artifact_a', patch)
    vi.advanceTimersByTime(300)
    expect(updateMapArtifact).toHaveBeenCalledOnce()
  })

  it('flushes a pending patch exactly once when the editor unmounts', () => {
    const current = render('artifact_a')
    const patch = { position: { x: 30, y: 40 } }
    current.schedule(patch)

    hookHarness.unmount()
    vi.advanceTimersByTime(300)

    expect(updateMapArtifact).toHaveBeenCalledOnce()
    expect(updateMapArtifact).toHaveBeenCalledWith('artifact_a', patch)
  })
})
