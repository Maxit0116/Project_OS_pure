export { default as PersonShape } from './PersonShape'
export { default as SystemShape } from './SystemShape'
export { default as ExternalSystemShape } from './ExternalSystemShape'
export { default as WebAppShape } from './WebAppShape'
export { default as MobileAppShape } from './MobileAppShape'
export { default as ServerShape } from './ServerShape'
export { default as DatabaseShape } from './DatabaseShape'
export { default as QueueShape } from './QueueShape'
export { default as ComponentShape } from './ComponentShape'
export { default as CodeShape } from './CodeShape'
export { default as BoundaryShape } from './BoundaryShape'
export type { BoundaryShapeProps } from './BoundaryShape'

import type { ComponentType } from 'react'
import type { C4ShapeKind, C4ShapeProps } from '../types'
import PersonShape from './PersonShape'
import SystemShape from './SystemShape'
import ExternalSystemShape from './ExternalSystemShape'
import WebAppShape from './WebAppShape'
import MobileAppShape from './MobileAppShape'
import ServerShape from './ServerShape'
import DatabaseShape from './DatabaseShape'
import QueueShape from './QueueShape'
import ComponentShape from './ComponentShape'
import CodeShape from './CodeShape'

export const C4_SHAPE_COMPONENTS: Record<
  C4ShapeKind,
  ComponentType<C4ShapeProps>
> = {
  person: PersonShape,
  system: SystemShape,
  external_system: ExternalSystemShape,
  web_app: WebAppShape,
  mobile_app: MobileAppShape,
  server: ServerShape,
  database: DatabaseShape,
  queue: QueueShape,
  component: ComponentShape,
  code: CodeShape,
}

export const C4_DEFAULT_NODE_SIZE: Record<
  C4ShapeKind,
  { width: number; height: number }
> = {
  person: { width: 140, height: 136 },
  system: { width: 220, height: 120 },
  external_system: { width: 200, height: 110 },
  web_app: { width: 200, height: 118 },
  mobile_app: { width: 148, height: 148 },
  server: { width: 200, height: 110 },
  database: { width: 150, height: 130 },
  queue: { width: 210, height: 84 },
  component: { width: 200, height: 100 },
  code: { width: 220, height: 110 },
}
