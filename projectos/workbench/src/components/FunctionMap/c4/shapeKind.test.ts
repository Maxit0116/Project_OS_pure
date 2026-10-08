import { describe, expect, it } from 'vitest'
import { resolveC4ShapeKind } from './shapeKind'

describe('resolveC4ShapeKind', () => {
  it('maps person and systems', () => {
    expect(resolveC4ShapeKind({ elementType: 'person' })).toBe('person')
    expect(resolveC4ShapeKind({ elementType: 'software_system' })).toBe('system')
    expect(resolveC4ShapeKind({ elementType: 'external_system' })).toBe(
      'external_system',
    )
    expect(resolveC4ShapeKind({ elementType: 'data_store' })).toBe('database')
    expect(resolveC4ShapeKind({ elementType: 'component' })).toBe('component')
    expect(resolveC4ShapeKind({ elementType: 'code_element' })).toBe('code')
  })

  it('picks container variants from technology', () => {
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        technology: 'PostgreSQL',
      }),
    ).toBe('database')
    expect(
      resolveC4ShapeKind({ elementType: 'container', technology: 'Next.js' }),
    ).toBe('web_app')
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        technology: 'React Native',
      }),
    ).toBe('mobile_app')
    expect(
      resolveC4ShapeKind({ elementType: 'container', technology: 'Kafka' }),
    ).toBe('queue')
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        technology: 'Node.js / Express',
      }),
    ).toBe('server')
  })
})
