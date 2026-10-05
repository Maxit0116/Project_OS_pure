import { afterEach, describe, expect, it, vi } from 'vitest'

const hookHarness = vi.hoisted(() => {
  type Cleanup = () => void
  type Effect = () => void | Cleanup
  type Cell =
    | { kind: 'state'; value: unknown }
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
    reset() {
      for (const cell of cells) {
        if (cell?.kind === 'effect') cell.cleanup?.()
      }
      cells = []
      cursor = 0
      pending = []
    },
    useState<T>(initial: T | (() => T)) {
      const index = cursor++
      let cell = cells[index]
      if (cell?.kind !== 'state') {
        cell = {
          kind: 'state',
          value: typeof initial === 'function' ? (initial as () => T)() : initial,
        }
        cells[index] = cell
      }
      const setState = (next: T | ((previous: T) => T)) => {
        const current = cells[index]
        if (current?.kind !== 'state') throw new Error('state cell missing')
        current.value =
          typeof next === 'function'
            ? (next as (previous: T) => T)(current.value as T)
            : next
      }
      return [cell.value as T, setState] as const
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

vi.mock('react', () => ({
  useCallback: hookHarness.useCallback,
  useEffect: hookHarness.useEffect,
  useRef: hookHarness.useRef,
  useState: hookHarness.useState,
}))

import { useReconciledArtifactItems } from './useReconciledArtifactItems'

interface Item {
  id: string
  text: string
  done: boolean
}

function render(revision: string, incoming: Item[], artifactId = 'plan_1') {
  hookHarness.beginRender()
  const result = useReconciledArtifactItems(artifactId, revision, incoming)
  hookHarness.flushEffects()
  return result
}

describe('useReconciledArtifactItems', () => {
  afterEach(() => hookHarness.reset())

  it('adopts an external update before the next local edit', () => {
    const initial = [{ id: 'step_1', text: 'Old', done: false }]
    render('r1', initial)

    const external = [{ id: 'step_1', text: 'Agent update', done: false }]
    render('r2', external)
    let [items, setItems] = render('r2', external)
    expect(items).toEqual(external)

    setItems((current) => current.map((item) => ({ ...item, done: true })))
    ;[items] = render('r2', external)
    expect(items).toEqual([{ id: 'step_1', text: 'Agent update', done: true }])
  })

  it('does not replace an in-flight draft for referential churn or its persistence echo', () => {
    const initial = [{ id: 'step_1', text: 'Start', done: false }]
    let [, setItems] = render('r1', initial)
    const draft = [{ id: 'step_1', text: 'Still typing', done: false }]
    setItems(draft)

    let [items] = render('r1', [{ ...initial[0]! }])
    expect(items).toBe(draft)

    render('r2', [{ ...draft[0]! }])
    ;[items] = render('r2', [{ ...draft[0]! }])
    expect(items).toBe(draft)
    expect(items[0]?.text).toBe('Still typing')
  })
})
