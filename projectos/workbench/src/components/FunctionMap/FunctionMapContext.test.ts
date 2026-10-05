import { describe, expect, it } from 'vitest'

import {
  functionMapNodeMembershipKey,
  resolveFunctionMapPreviewPosition,
} from './FunctionMapContext'

describe('Function Map context stability helpers', () => {
  it('keeps the same membership key across referential and ordering churn', () => {
    expect(functionMapNodeMembershipKey([{ id: 'b' }, { id: 'a' }])).toBe(
      functionMapNodeMembershipKey([{ id: 'a' }, { id: 'b' }]),
    )
  })

  it('positions delayed previews from the rect measured when the timer fires', () => {
    const beforeScroll = resolveFunctionMapPreviewPosition(
      300,
      200,
      { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 },
      false,
    )
    const afterScroll = resolveFunctionMapPreviewPosition(
      300,
      200,
      { left: 100, top: 80, right: 900, bottom: 680, width: 800, height: 600 },
      false,
    )

    expect(afterScroll).not.toEqual(beforeScroll)
    expect(afterScroll).toEqual({ x: 218, y: 134 })
  })
})
