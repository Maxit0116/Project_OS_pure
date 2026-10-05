/** Matches React Flow `<Background gap={20} size={1} />` on the flat map. */
export const MAP_CANVAS_DOT_GAP_PX = 20

export function readMapCanvasBgColor(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-map').trim()
  return raw || '#ebebf0'
}

export const MAP_CANVAS_GL_PROPS = {
  antialias: true,
  alpha: true,
  premultipliedAlpha: false,
  powerPreference: 'high-performance' as const,
}

export function configureMapCanvasGl(gl: { setClearColor: (color: number, alpha: number) => void; domElement: HTMLCanvasElement }) {
  gl.setClearColor(0x000000, 0)
  gl.domElement.style.background = 'transparent'
}
