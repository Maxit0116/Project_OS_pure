import { describe, expect, it } from 'vitest'
import {
  buildCaptureSessionFromOverlay,
  captureRegionToOverlay,
  overlayRegionToCapture,
} from './captureSessionSerialize'
import type { OverlayRegion } from './overlayRegions'

describe('captureSessionSerialize', () => {
  const region: OverlayRegion = {
    id: 'region_1',
    captureRect: { x: 12, y: 34, width: 200, height: 120 },
    mode: 'ask',
    regionPrompt: 'note',
    arrows: [
      {
        id: 'arrow_1',
        index: 1,
        color: '#abc',
        anchor: 'left',
        head: { x: 0, y: 0.5 },
        tail: { x: -0.2, y: 0.5 },
        composeAttach: 'right',
        prompt: 'Hello',
        pinId: 'pin_1',
        status: 'draft',
      },
    ],
    drawStrokes: [],
    flowComplete: true,
    showAnchors: false,
    tool: 'arrow',
    snapshotAssetPath: '.projectos/spatial-pins/assets/pin_x.png',
  }

  it('round-trips overlay region ↔ capture region', () => {
    const captured = overlayRegionToCapture(region)
    const back = captureRegionToOverlay(captured)
    expect(back).toEqual(region)
  })

  it('builds a session document from overlay regions', () => {
    const session = buildCaptureSessionFromOverlay({
      id: 'cap_abc',
      projectId: 'proj',
      location: { surface: 'screen', url: 'spatial://screen' },
      viewport: { width: 1000, height: 800 },
      regions: [region],
      backdropAssetPath: '.projectos/spatial-captures/assets/cap_abc-backdrop.png',
    })
    expect(session.id).toBe('cap_abc')
    expect(session.regions).toHaveLength(1)
    expect(session.regions[0]?.arrows[0]?.prompt).toBe('Hello')
    expect(session.title).toBe('Hello')
    expect(session.status).toBe('archived')
  })
})
