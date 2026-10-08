import type {
  ArchitectureLevel,
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  ProjectArchitecture,
} from '@contracts/index'

/** Classic C4 visual role — mapped from elementType + technology, not a new contract enum. */
export type C4ShapeKind =
  | 'person'
  | 'system'
  | 'external_system'
  | 'web_app'
  | 'mobile_app'
  | 'server'
  | 'database'
  | 'queue'
  | 'component'
  | 'code'

export interface C4DiagramScope {
  parentId?: string
  focusNodeId?: string
}

export interface C4DiagramInput {
  level: ArchitectureLevel
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  architecture?: ProjectArchitecture
  scope?: C4DiagramScope
  fileIndex?: FileEntry[]
  fileRelations?: FileRelation[]
}

export interface C4DiagramNode {
  id: string
  shape: C4ShapeKind
  label: string
  description?: string
  technology?: string
  /** Classic C4 stereotype, e.g. `[Class]`, `[Component: Spring Bean]`. */
  stereotype?: string
  /** Code-level members (exports / methods / symbols) for class-like boxes. */
  members?: string[]
  /** Contract elementType when present. */
  elementType?: string
  level?: ArchitectureLevel
  /** Source FunctionalNode / projected code node. */
  sourceNodeId: string
  position: { x: number; y: number }
  width: number
  height: number
  selected?: boolean
  dimmed?: boolean
}

export interface C4DiagramEdge {
  id: string
  source: string
  target: string
  /** Human intent, e.g. "Gets account information from". */
  label?: string
  /** Protocol / tech in brackets, e.g. "XML/HTTPS". */
  technology?: string
  relation: string
  purpose?: string
  confidence?: number
}

export interface C4Boundary {
  id: string
  label: string
  description?: string
  position: { x: number; y: number }
  width: number
  height: number
}

export interface C4Diagram {
  level: ArchitectureLevel
  nodes: C4DiagramNode[]
  edges: C4DiagramEdge[]
  boundaries: C4Boundary[]
  bounds: { minX: number; minY: number; width: number; height: number }
}

export interface C4ShapeProps {
  label: string
  description?: string
  technology?: string
  stereotype?: string
  members?: string[]
  selected?: boolean
  dimmed?: boolean
  className?: string
}
