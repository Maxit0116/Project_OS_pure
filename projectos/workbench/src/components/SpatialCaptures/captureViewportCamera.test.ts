import { describe, expect, it } from 'vitest'
import {
  clampCapturePan,
  clampZoom,
  panForZoomAtPoint,
} from './captureViewportCamera'

const host = { width: 800, height: 600 }
const viewport = { width: 1600, height: 1200 }
const fitScale = 0.5

describe('captureViewportCamera', () => {
  it('clamps zoom to the fit-to-max range', () => {
    expect(clampZoom(0.2)).toBe(1)
    expect(clampZoom(2)).toBe(2)
    expect(clampZoom(20)).toBe(8)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  it('locks pan while the screenshot still fits the host', () => {
    expect(
      clampCapturePan({ x: 40, y: -20 }, host, { width: 800, height: 600 }),
    ).toEqual({ x: 0, y: 0 })
  })

  it('keeps the point under the cursor fixed when zooming', () => {
    const centered = panForZoomAtPoint({
      pan: { x: 0, y: 0 },
      zoom: 1,
      nextZoom: 2,
      hostX: 400,
      hostY: 300,
      host,
      viewport,
      fitScale,
    })
    expect(centered.x).toBeCloseTo(0)
    expect(centered.y).toBeCloseTo(0)

    const leftEdge = panForZoomAtPoint({
      pan: { x: 0, y: 0 },
      zoom: 1,
      nextZoom: 2,
      hostX: 0,
      hostY: 0,
      host,
      viewport,
      fitScale,
    })
    expect(leftEdge.x).toBeCloseTo(400)
    expect(leftEdge.y).toBeCloseTo(300)
  })
})
