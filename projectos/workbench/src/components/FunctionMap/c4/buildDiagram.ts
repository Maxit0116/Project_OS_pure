import { buildCodeDiagram } from './code/buildCodeDiagram'
import { buildComponentDiagram } from './component/buildComponentDiagram'
import { buildContainerDiagram } from './container/buildContainerDiagram'
import { buildContextDiagram } from './context/buildContextDiagram'
import type { C4Diagram, C4DiagramInput } from './types'

/**
 * Frozen entry point for Wave 2 merge into FunctionMapCanvas.
 * Level agents refine their own builders; do not change this signature.
 */
export function buildDiagram(input: C4DiagramInput): C4Diagram {
  switch (input.level) {
    case 'context':
      return buildContextDiagram(input)
    case 'container':
      return buildContainerDiagram(input)
    case 'component':
      return buildComponentDiagram(input)
    case 'code':
      return buildCodeDiagram(input)
    default:
      return buildContextDiagram(input)
  }
}
