import { describe, expect, it } from 'vitest'

import {
  measureAutoFitContentHeight,
  type AutoFitElementLike,
} from './mapArtifactAutoFit'

function element(
  offsetHeight: number,
  classNames: string[] = [],
  children: AutoFitElementLike[] = [],
): AutoFitElementLike {
  return {
    offsetHeight,
    classList: { contains: (token: string) => classNames.includes(token) },
    children,
  }
}

describe('map artifact auto-fit measurement', () => {
  it('recognizes the exact hashed criteria-list class token', () => {
    const hashedCriteriaClass = '_x8s13_criteria'
    const criteriaList = element(999, [hashedCriteriaClass], [element(20), element(30)])

    expect(
      measureAutoFitContentHeight([criteriaList, element(10)], hashedCriteriaClass),
    ).toBe(20 + 30 + 6 + 10 + 8)
  })
})
