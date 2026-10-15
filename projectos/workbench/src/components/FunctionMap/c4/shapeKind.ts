import type { FunctionalNode } from '@contracts/index'
import type { C4ShapeKind } from './types'

/**
 * Map a container onto a device silhouette.
 * Name and path win over a toolkit keyword, so a macOS client written as
 * SwiftUI stays a laptop and an Android client written as Jetpack Compose
 * stays a phone.
 */
const DESKTOP_RE =
  /macos|mac\s*os|\bos\s*x\b|macintosh|\bmac\b|appkit|electron|tauri|\bwpf\b|winui|windows\s+(app|client|desktop)|linux\s+(app|client|desktop)|桌面客户端|桌面应用|(^|[/\\])(macos|osx|desktop)([/\\]|$)/
const PHONE_RE =
  /android|安卓|iphone|jetpack|react[\s.-]?native|\bflutter\b|\bios\b|移动端|(^|[/\\])(android|ios)([/\\]|$)/

export interface C4ShapeInput {
  elementType?: string | null
  technology?: string | null
  level?: string | null
  name?: string | null
  nameEn?: string | null
  notes?: string | null
  linkedFiles?: Array<{ path?: string | null }> | null
}

function textOf(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .toLowerCase()
}

function mentions(pattern: RegExp, text: string): boolean {
  pattern.lastIndex = 0
  return pattern.test(text)
}

function deviceShape(node: C4ShapeInput): 'desktop_app' | 'mobile_app' | null {
  const name = textOf([node.name, node.nameEn])
  const paths = textOf([
    node.notes,
    ...(node.linkedFiles ?? []).map((file) => file.path),
  ])
  const technology = textOf([node.technology])

  const nameDesktop = mentions(DESKTOP_RE, name)
  const namePhone = mentions(PHONE_RE, name)
  if (nameDesktop && !namePhone) return 'desktop_app'
  if (namePhone && !nameDesktop) return 'mobile_app'

  const pathDesktop = mentions(DESKTOP_RE, paths)
  const pathPhone = mentions(PHONE_RE, paths)
  if (pathDesktop && !pathPhone) return 'desktop_app'
  if (pathPhone && !pathDesktop) return 'mobile_app'

  const techDesktop = mentions(DESKTOP_RE, technology)
  const techPhone =
    mentions(PHONE_RE, technology) ||
    (/swiftui/.test(technology) && !techDesktop && !nameDesktop && !pathDesktop)
  if (techDesktop && !techPhone) return 'desktop_app'
  if (techPhone && !techDesktop) return 'mobile_app'
  return null
}

/**
 * Map contract elementType + name/path/technology → C4 visual shape.
 * Do not invent new ArchitectureElementType values.
 */
export function resolveC4ShapeKind(node: C4ShapeInput): C4ShapeKind {
  const elementType = node.elementType ?? ''
  const tech = (node.technology ?? '').toLowerCase()

  if (elementType === 'person') return 'person'
  if (elementType === 'external_system') return 'external_system'
  if (elementType === 'software_system') return 'system'
  if (elementType === 'data_store') return 'database'
  if (elementType === 'code_element' || node.level === 'code') return 'code'
  if (elementType === 'component' || node.level === 'component') return 'component'

  if (elementType === 'container' || node.level === 'container') {
    const device = deviceShape(node)
    if (device) return device
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
  return resolveC4ShapeKind({
    elementType: node.elementType,
    technology: node.technology,
    level: node.level,
    name: node.name,
    nameEn: node.nameEn,
    notes: node.notes,
    linkedFiles: node.linkedFiles,
  })
}
