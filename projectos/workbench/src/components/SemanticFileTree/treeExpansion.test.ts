import { describe, expect, it } from 'vitest'
import { resolveSemanticTreeExpanded } from './treeExpansion'

describe('resolveSemanticTreeExpanded', () => {
  it('starts semantic feature roots collapsed but honors an explicit expansion', () => {
    expect(resolveSemanticTreeExpanded({}, 'feature-root', 0)).toBe(false)
    expect(resolveSemanticTreeExpanded({ 'feature-root': true }, 'feature-root', 0)).toBe(true)
  })
})
