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

  it('draws client devices from the name, not the toolkit keyword', () => {
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        name: 'Android 打卡客户端',
        technology: 'Jetpack Compose',
      }),
    ).toBe('mobile_app')
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        name: 'macOS 打卡客户端',
        technology: 'SwiftUI',
      }),
    ).toBe('desktop_app')
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        name: 'Web 打卡',
        technology: 'Next.js',
      }),
    ).toBe('web_app')
  })

  it('keeps SwiftUI on a phone unless the name or path is a desktop client', () => {
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        name: 'iOS 打卡客户端',
        technology: 'SwiftUI',
      }),
    ).toBe('mobile_app')
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        name: '打卡客户端',
        technology: 'SwiftUI',
        linkedFiles: [{ path: 'macos/App/CheckIn.swift' }],
      }),
    ).toBe('desktop_app')
    expect(
      resolveC4ShapeKind({
        elementType: 'container',
        technology: 'Electron',
      }),
    ).toBe('desktop_app')
  })
})
