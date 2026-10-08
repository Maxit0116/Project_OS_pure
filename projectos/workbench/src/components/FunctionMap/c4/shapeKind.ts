import type { FunctionalNode } from '@contracts/index'
import type { C4ShapeKind } from './types'

/**
 * Map contract elementType + technology → C4 visual shape.
 * Do not invent new ArchitectureElementType values; use technology strings.
 */
export function resolveC4ShapeKind(node: {
  elementType?: string | null
  technology?: string | null
  level?: string | null
}): C4ShapeKind {
  const elementType = node.elementType ?? ''
  const tech = (node.technology ?? '').toLowerCase()

  if (elementType === 'person') return 'person'
  if (elementType === 'external_system') return 'external_system'
  if (elementType === 'software_system') return 'system'
  if (elementType === 'data_store') return 'database'
  if (elementType === 'code_element' || node.level === 'code') return 'code'
  if (elementType === 'component' || node.level === 'component') return 'component'

  if (elementType === 'container' || node.level === 'container') {
    if (
      /postgres|mysql|mongo|sqlite|redis|dynamodb|cassandra|database|db\b/.test(
        tech,
      )
    ) {
      return 'database'
    }
    if (/kafka|rabbit|sqs|pubsub|queue|nats|event.?bridge/.test(tech)) {
      return 'queue'
    }
    if (/react.?native|flutter|ios|android|mobile|swiftui/.test(tech)) {
      return 'mobile_app'
    }
    if (
      /next\.?js|react|vue|angular|svelte|spa|browser|webpack|vite/.test(tech)
    ) {
      return 'web_app'
    }
    return 'server'
  }

  return 'system'
}

export function resolveC4ShapeKindFromNode(node: FunctionalNode): C4ShapeKind {
  return resolveC4ShapeKind(node)
}
