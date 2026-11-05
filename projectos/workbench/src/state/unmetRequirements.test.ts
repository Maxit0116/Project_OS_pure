import { describe, expect, it } from 'vitest'
import { parseUnmetRequirements, unmetRequirementsFromMessage } from './unmetRequirements'

describe('parseUnmetRequirements', () => {
  it('keeps well-formed entries', () => {
    expect(parseUnmetRequirements([{ path: 'a.ts', problems: ['x', 'y'] }])).toEqual([
      { path: 'a.ts', problems: ['x', 'y'] },
    ])
  })

  it('drops anything that is not the expected shape', () => {
    expect(parseUnmetRequirements(undefined)).toEqual([])
    expect(parseUnmetRequirements('nope')).toEqual([])
    expect(parseUnmetRequirements([null, 3, { path: 1, problems: ['x'] }, { path: 'a.ts' }, { path: 'b.ts', problems: [] }, { path: 'c.ts', problems: ['', 4] }]))
      .toEqual([])
  })

  it('bounds the number of files, problems and text length', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ path: `f${index}.ts`, problems: ['a', 'b', 'c', 'd', 'e', 'f'] }))
    const parsed = parseUnmetRequirements(many)
    expect(parsed).toHaveLength(8)
    expect(parsed[0]?.problems).toHaveLength(4)
    expect(parseUnmetRequirements([{ path: 'a.ts', problems: ['z'.repeat(900)] }])[0]?.problems[0]).toHaveLength(500)
  })
})

describe('unmetRequirementsFromMessage', () => {
  it('recovers the file and requirement from the refusal message', () => {
    expect(unmetRequirementsFromMessage('The independent review says this change does not meet: lib/a.ts: must reject empty input'))
      .toEqual([{ path: 'lib/a.ts', problems: ['must reject empty input'] }])
  })

  it('returns nothing for any other message', () => {
    expect(unmetRequirementsFromMessage('Generated diff is stale')).toEqual([])
  })
})
