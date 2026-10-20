import type { AnnotationAnchor } from '@contracts/spatial-pin'
import type { IntentEdgePort } from '@contracts/index'

/** Map region / compose anchors to NESW ports (corners collapse to a side). */
export function anchorToPort(anchor: AnnotationAnchor): IntentEdgePort {
  switch (anchor) {
    case 'top':
    case 'topLeft':
    case 'topRight':
      return 'n'
    case 'right':
      return 'e'
    case 'bottom':
    case 'bottomLeft':
    case 'bottomRight':
      return 's'
    case 'left':
      return 'w'
    default:
      return 'e'
  }
}
