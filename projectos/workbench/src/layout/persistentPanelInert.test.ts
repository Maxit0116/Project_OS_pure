import { describe, expect, it } from 'vitest'

import { setPersistentPanelVisibility } from './persistentPanelInert'

describe('persistent panel inert state', () => {
  it('removes a hidden panel and its focusable descendants from interaction', () => {
    const focusableControl = { tabIndex: 0 }
    const element = { inert: false, focusableControl }

    setPersistentPanelVisibility(element, false)
    expect(element.inert).toBe(true)
    expect(element.focusableControl.tabIndex).toBe(0)

    setPersistentPanelVisibility(element, true)
    expect(element.inert).toBe(false)
  })
})
