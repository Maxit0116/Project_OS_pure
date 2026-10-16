/** Priority for blank-pane double-click on the Function Map. */
export type MapBlankDoubleClickAction =
  | 'clear-layer-focus'
  | 'drill-out'
  | 'none'

/** Priority for architecture-node double-click on the Function Map. */
export type MapNodeDoubleClickAction =
  | 'open-code-file'
  | 'drill-in'
  | 'open-node-agent'

/**
 * Blank double-click:
 * 1) exit one-hop neighborhood focus within the current graph
 * 2) otherwise step up one architecture scope (same as the level back button)
 */
export function resolveMapBlankDoubleClickAction(input: {
  isLayerFocusActive: boolean
  hasArchitectureScope: boolean
}): MapBlankDoubleClickAction {
  if (input.isLayerFocusActive) return 'clear-layer-focus'
  if (input.hasArchitectureScope) return 'drill-out'
  return 'none'
}

/**
 * Node double-click:
 * code files open the editor; nodes with a child layer drill in; else node agent.
 */
export function resolveMapNodeDoubleClickAction(input: {
  isCodeFileNode: boolean
  canDrill: boolean
}): MapNodeDoubleClickAction {
  if (input.isCodeFileNode) return 'open-code-file'
  if (input.canDrill) return 'drill-in'
  return 'open-node-agent'
}
