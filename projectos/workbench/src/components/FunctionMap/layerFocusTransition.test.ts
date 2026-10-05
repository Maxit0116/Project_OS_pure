import { describe, expect, it } from 'vitest'
import {
  easeInOutQuint,
  easeOutCubic,
  interpolatePosition,
  interpolateViewport,
  LAYER_FOCUS_TRANSITION_MS,
  sampleLayerFocusTransition,
  smootherStep,
  type LayerFocusTransition,
} from './layerFocusTransition'

function makeTransition(
  overrides: Partial<LayerFocusTransition> = {},
): LayerFocusTransition {
  return {
    direction: 'enter',
    focusNodeId: 'focus',
    linkedIds: new Set(['focus', 'neighbor']),
    linkedLayerIds: new Set(['application']),
    allNodeIds: new Set(['focus', 'neighbor', 'other']),
    layoutFrom: {
      positionsById: {
        focus: { x: 0, y: 0 },
        neighbor: { x: 100, y: 0 },
        other: { x: 200, y: 0 },
      },
      layerBands: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    layoutTo: {
      positionsById: {
        focus: { x: 50, y: 50 },
        neighbor: { x: 150, y: 50 },
      },
      layerBands: [],
      viewport: { x: 10, y: 10, zoom: 1.2 },
    },
    edges: [
      { id: 'e1', source: 'focus', target: 'neighbor' },
      { id: 'e2', source: 'other', target: 'focus' },
    ],
    startedAt: 0,
    durationMs: LAYER_FOCUS_TRANSITION_MS,
    ...overrides,
  }
}

describe('layerFocusTransition', () => {
  it('easeOutCubic returns 0 and 1 at boundaries', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('smootherStep has zero velocity at boundaries', () => {
    expect(smootherStep(0)).toBe(0)
    expect(smootherStep(1)).toBe(1)
    const dt = 0.001
    const v0 = (smootherStep(dt) - smootherStep(0)) / dt
    const v1 = (smootherStep(1) - smootherStep(1 - dt)) / dt
    expect(v0).toBeLessThan(0.05)
    expect(v1).toBeLessThan(0.05)
  })

  it('easeInOutQuint returns 0 and 1 at boundaries', () => {
    expect(easeInOutQuint(0)).toBe(0)
    expect(easeInOutQuint(1)).toBe(1)
  })

  it('interpolatePosition at endpoints', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 200 }
    expect(interpolatePosition(from, to, 0)).toEqual(from)
    expect(interpolatePosition(from, to, 1)).toEqual(to)
    expect(interpolatePosition(from, to, 0.5)).toEqual({ x: 50, y: 100 })
  })

  it('interpolateViewport at endpoints', () => {
    const from = { x: 0, y: 0, zoom: 1 }
    const to = { x: 20, y: 30, zoom: 2 }
    expect(interpolateViewport(from, to, 0)).toEqual(from)
    expect(interpolateViewport(from, to, 1)).toEqual(to)
  })

  it('sampleTransition at t=0 keeps full layout and full opacity for enter', () => {
    const sample = sampleLayerFocusTransition(makeTransition(), 0)
    expect(sample.progress).toBe(0)
    expect(sample.fadeProgress).toBe(0)
    expect(sample.positionsById.focus).toEqual({ x: 0, y: 0 })
    expect(sample.positionsById.other).toEqual({ x: 200, y: 0 })
    expect(sample.nodeOpacityById.focus).toBe(1)
    expect(sample.nodeOpacityById.other).toBe(1)
    expect(sample.edgeOpacityById.e1).toBe(1)
    expect(sample.edgeOpacityById.e2).toBe(1)
    expect(sample.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('sampleTransition at t=1 reaches focus layout for enter', () => {
    const transition = makeTransition()
    const sample = sampleLayerFocusTransition(
      transition,
      transition.durationMs,
    )
    expect(sample.progress).toBe(1)
    expect(sample.fadeProgress).toBe(1)
    expect(sample.positionsById.focus).toEqual({ x: 50, y: 50 })
    expect(sample.positionsById.neighbor).toEqual({ x: 150, y: 50 })
    expect(sample.nodeOpacityById.other).toBe(0)
    expect(sample.edgeOpacityById.e1).toBe(1)
    expect(sample.edgeOpacityById.e2).toBe(0)
    expect(sample.viewport).toEqual({ x: 10, y: 10, zoom: 1.2 })
  })

  it('sampleTransition exit direction fades unlinked nodes in', () => {
    const transition = makeTransition({ direction: 'exit', startedAt: 0 })
    const sample = sampleLayerFocusTransition(transition, transition.durationMs)
    expect(sample.nodeOpacityById.other).toBe(1)
    expect(sample.edgeOpacityById.e2).toBe(1)
  })

  it('exit direction moves unlinked nodes while fading in', () => {
    const transition = makeTransition({
      direction: 'exit',
      startedAt: 0,
      layoutFrom: {
        positionsById: {
          focus: { x: 50, y: 50 },
          neighbor: { x: 150, y: 50 },
          other: { x: 200, y: 0 },
        },
        layerBands: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      layoutTo: {
        positionsById: {
          focus: { x: 0, y: 0 },
          neighbor: { x: 100, y: 0 },
          other: { x: 300, y: 0 },
        },
        layerBands: [],
        viewport: { x: 10, y: 10, zoom: 1.2 },
      },
    })
    const mid = sampleLayerFocusTransition(transition, transition.durationMs / 2)
    expect(mid.nodeOpacityById.other).toBeGreaterThan(0)
    expect(mid.nodeOpacityById.other).toBeLessThan(1)
    expect(mid.positionsById.other.x).toBeGreaterThan(200)
    expect(mid.positionsById.other.x).toBeLessThan(300)
  })

  it('linked nodes stay at opacity 1 during enter midpoint', () => {
    const transition = makeTransition()
    const sample = sampleLayerFocusTransition(
      transition,
      transition.durationMs / 2,
    )
    expect(sample.nodeOpacityById.focus).toBe(1)
    expect(sample.nodeOpacityById.neighbor).toBe(1)
    expect(sample.nodeOpacityById.other).toBeLessThan(1)
    expect(sample.nodeOpacityById.other).toBeGreaterThan(0)
  })

  it('unlinked layer bands fade out during enter and linked bands stay visible', () => {
    const bands = [
      {
        id: 'application',
        label: 'Application',
        description: '',
        position: { x: 0, y: 0 },
        width: 200,
        height: 100,
      },
      {
        id: 'infrastructure',
        label: 'Infrastructure',
        description: '',
        position: { x: 0, y: 120 },
        width: 200,
        height: 100,
      },
    ]
    const transition = makeTransition({
      linkedLayerIds: new Set(['application']),
      layoutFrom: {
        positionsById: makeTransition().layoutFrom.positionsById,
        layerBands: bands,
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      layoutTo: {
        positionsById: makeTransition().layoutTo.positionsById,
        layerBands: [bands[0]],
        viewport: { x: 10, y: 10, zoom: 1.2 },
      },
    })
    const start = sampleLayerFocusTransition(transition, 0)
    expect(start.layerBands.find((b) => b.id === 'application')?.opacity).toBe(1)
    expect(start.layerBands.find((b) => b.id === 'infrastructure')?.opacity).toBe(1)

    const mid = sampleLayerFocusTransition(transition, transition.durationMs / 2)
    expect(mid.layerBands.find((b) => b.id === 'application')?.opacity).toBe(1)
    expect(mid.layerBands.find((b) => b.id === 'infrastructure')?.opacity).toBeLessThan(1)
    expect(mid.layerBands.find((b) => b.id === 'infrastructure')?.opacity).toBeGreaterThan(0)

    const end = sampleLayerFocusTransition(transition, transition.durationMs)
    expect(end.layerBands.find((b) => b.id === 'application')?.opacity).toBe(1)
    expect(end.layerBands.find((b) => b.id === 'infrastructure')?.opacity).toBe(0)
  })
})
