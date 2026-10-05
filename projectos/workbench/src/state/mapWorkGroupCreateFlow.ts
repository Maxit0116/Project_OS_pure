export interface MapWorkGroupCreateFlow {
  source: 'toolbar' | 'contextMenu'
  /** Flow coordinates for column placement when members need rearranging. */
  origin?: { x: number; y: number }
}
