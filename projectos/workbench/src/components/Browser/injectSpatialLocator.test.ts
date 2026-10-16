import { describe, expect, it } from 'vitest'

import {
  buildSpatialLocatorInjectionSource,
  SPATIAL_LOCATOR_CONSOLE_PREFIX,
} from './injectSpatialLocator'

describe('injectSpatialLocator', () => {
  it('embeds the console prefix used by the host listener', () => {
    const source = buildSpatialLocatorInjectionSource()
    expect(source).toContain(SPATIAL_LOCATOR_CONSOLE_PREFIX)
    expect(source).toContain('__projectosSpatialLocatorInstalled')
  })
})
