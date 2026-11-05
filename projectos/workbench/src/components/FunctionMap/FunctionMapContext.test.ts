import { describe, expect, it } from 'vitest'

import {
  functionMapNodeMembershipKey,
  reconcileArchitectureScope,
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

describe('reconcileArchitectureScope', () => {
  const generated = [{ id: 'container_api_server' }, { id: 'component_auth' }]

  it('moves a scope that names a node the new graph does not have to the level default', () => {
    // The placeholder map a new folder starts with is replaced by the generated one: its container is gone.
    expect(reconcileArchitectureScope(generated, 'container_src', 'container_api_server')).toBe('container_api_server')
  })

  it('moves to no scope at all when the level has no default', () => {
    expect(reconcileArchitectureScope(generated, 'container_src', null)).toBeNull()
  })

  it('leaves a scope that still exists, and the top level, alone', () => {
    expect(reconcileArchitectureScope(generated, 'container_api_server', 'component_auth')).toBeUndefined()
    expect(reconcileArchitectureScope(generated, null, 'container_api_server')).toBeUndefined()
  })
})
