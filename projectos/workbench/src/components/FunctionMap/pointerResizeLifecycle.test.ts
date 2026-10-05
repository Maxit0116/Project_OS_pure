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

const flowDoubles = vi.hoisted(() => ({
  triggerNodeChanges: vi.fn(),
  nodeLookup: new Map<string, unknown>(),
}))

vi.mock('react', () => ({
  useCallback: hookHarness.useCallback,
  useEffect: hookHarness.useEffect,
  useRef: hookHarness.useRef,
}))

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({ getZoom: () => 1 }),
  useStoreApi: () => ({
    getState: () => ({
      nodeLookup: flowDoubles.nodeLookup,
      triggerNodeChanges: flowDoubles.triggerNodeChanges,
    }),
  }),
}))

import { usePointerResize } from '../../hooks/usePointerResize'
import { useMapArtifactPointerResize } from './useMapArtifactPointerResize'

function pointerTarget(releaseThrows = false) {
  const listeners = new Map<string, (event?: { clientX: number; clientY: number }) => void>()
  return {
    listeners,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(() => {
      if (releaseThrows) throw new Error('capture already gone')
    }),
    addEventListener: vi.fn((
      type: string,
      listener: (event?: { clientX: number; clientY: number }) => void,
    ) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  }
}

function pointerEvent(target: ReturnType<typeof pointerTarget>) {
  return {
    button: 0,
    pointerId: 7,
    clientX: 100,
    clientY: 80,
    currentTarget: target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

describe('FunctionMap pointer resize cleanup', () => {
  beforeEach(() => {
    flowDoubles.triggerNodeChanges.mockReset()
    flowDoubles.nodeLookup = new Map([
      [
        'artifact-node',
        {
          position: { x: 10, y: 20 },
          measured: { width: 280, height: 160 },
        },
      ],
    ])
    vi.stubGlobal('document', {
      body: { style: { cursor: 'crosshair', userSelect: 'text' } },
    })
  })

  afterEach(() => {
    hookHarness.unmount()
    vi.unstubAllGlobals()
  })

  it('tears down a cancelled panel resize even when pointer release throws', () => {
    const onResizeEnd = vi.fn()
    hookHarness.beginRender()
    const resize = usePointerResize({ edge: 'east', onDelta: vi.fn(), onResizeEnd })
    hookHarness.flushEffects()
    const target = pointerTarget(true)

    resize.onPointerDown(pointerEvent(target) as never)
    expect(document.body.style).toMatchObject({ cursor: 'col-resize', userSelect: 'none' })

    expect(() => target.listeners.get('pointercancel')?.()).not.toThrow()
    expect(document.body.style).toMatchObject({ cursor: 'crosshair', userSelect: 'text' })
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(onResizeEnd).toHaveBeenCalledOnce()
    expect(target.listeners.size).toBe(0)
  })

  it('rebases at a clamp so reversing moves the handle immediately', () => {
    const deltas: number[] = []
    let value = 470
    const onDelta = vi.fn((delta: number) => {
      const previous = value
      value = Math.min(480, Math.max(200, value + delta))
      const applied = value - previous
      deltas.push(applied)
      return applied
    })
    hookHarness.beginRender()
    const resize = usePointerResize({
      edge: 'east',
      value,
      min: 200,
      max: 480,
      onDelta,
    })
    hookHarness.flushEffects()
    const target = pointerTarget()

    resize.onPointerDown(pointerEvent(target) as never)
    target.listeners.get('pointermove')?.({ clientX: 130, clientY: 80 })
    target.listeners.get('pointermove')?.({ clientX: 125, clientY: 80 })

    expect(deltas).toEqual([10, -5])
    expect(value).toBe(475)
  })

  it('tears down an artifact resize when its handle unmounts mid-gesture', () => {
    const onResizeEnd = vi.fn()
    hookHarness.beginRender()
    const resize = useMapArtifactPointerResize({
      nodeId: 'artifact-node',
      edge: 'south',
      minWidth: 100,
      minHeight: 100,
      maxWidth: 800,
      maxHeight: 800,
      onResizeEnd,
    })
    hookHarness.flushEffects()
    const target = pointerTarget()

    resize.onPointerDown(pointerEvent(target) as never)
    expect(document.body.style).toMatchObject({ cursor: 'ns-resize', userSelect: 'none' })

    hookHarness.unmount()

    expect(document.body.style).toMatchObject({ cursor: 'crosshair', userSelect: 'text' })
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(onResizeEnd).toHaveBeenCalledWith({ x: 10, y: 20, width: 280, height: 160 })
    expect(flowDoubles.triggerNodeChanges).toHaveBeenLastCalledWith([
      {
        id: 'artifact-node',
        type: 'dimensions',
        resizing: false,
        dimensions: { width: 280, height: 160 },
      },
    ])
  })
})
