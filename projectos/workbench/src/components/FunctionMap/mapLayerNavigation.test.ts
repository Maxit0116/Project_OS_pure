import { describe, expect, it } from 'vitest'

import {
  resolveMapBlankDoubleClickAction,
  resolveMapNodeDoubleClickAction,
} from './mapLayerNavigation'

describe('resolveMapBlankDoubleClickAction', () => {
  it('clears one-hop focus before drilling out', () => {
    expect(
      resolveMapBlankDoubleClickAction({
        isLayerFocusActive: true,
        hasArchitectureScope: true,
      }),
    ).toBe('clear-layer-focus')
  })

  it('drills out when scoped and not neighborhood-focused', () => {
    expect(
      resolveMapBlankDoubleClickAction({
        isLayerFocusActive: false,
        hasArchitectureScope: true,
      }),
    ).toBe('drill-out')
  })

  it('is a no-op at the top-level graph', () => {
    expect(
      resolveMapBlankDoubleClickAction({
        isLayerFocusActive: false,
        hasArchitectureScope: false,
      }),
    ).toBe('none')
  })
})

describe('resolveMapNodeDoubleClickAction', () => {
  it('opens code files in the editor instead of drilling', () => {
    expect(
      resolveMapNodeDoubleClickAction({
        isCodeFileNode: true,
        canDrill: false,
      }),
    ).toBe('open-code-file')
  })

  it('drills into nodes that have a lower layer', () => {
    expect(
      resolveMapNodeDoubleClickAction({
        isCodeFileNode: false,
        canDrill: true,
      }),
    ).toBe('drill-in')
  })

  it('opens node agent when there is no child layer', () => {
    expect(
      resolveMapNodeDoubleClickAction({
        isCodeFileNode: false,
        canDrill: false,
      }),
    ).toBe('open-node-agent')
  })
})
