/** Copy for Stencil Library / Compose — Overlay has no i18n store. */
export interface StencilUiStrings {
  library: string
  libraryHint: string
  edgeHint: string
  close: string
  search: string
  empty: string
  armed: string
  disarm: string
  open: string
  placeHint: string
  dragHint: string
  brief: string
  briefPlaceholder: string
  scope: string
  scopeUiOnly: string
  scopeUiApi: string
  scopeFull: string
  categoryBase: string
  categoryMotion: string
  categoryVisual: string
  categoryPreset: string
  motionModifier: string
  motionNone: string
  motionArmed: string
  licenseNote: string
}

export const STENCIL_UI_STRINGS_EN: StencilUiStrings = {
  library: 'UI Stencils',
  libraryHint: 'Drag a template onto the capture · motion in Compose.',
  edgeHint: 'Hover the right edge to open UI Stencils',
  close: 'Close stencil library',
  search: 'Search stencils',
  empty: 'No stencils match',
  armed: 'Dragging: {name}',
  disarm: 'Clear',
  open: 'Stencils',
  placeHint: 'Drag a stencil from the right-edge library onto the capture',
  dragHint: 'Drop on the capture to place',
  brief: 'Stencil brief',
  briefPlaceholder: 'Editable brief sent with your intent…',
  scope: 'Scope',
  scopeUiOnly: 'UI only',
  scopeUiApi: 'UI + API stub',
  scopeFull: 'Full stack',
  categoryBase: 'Base',
  categoryMotion: 'Motion',
  categoryVisual: 'Visual',
  categoryPreset: 'Presets',
  motionModifier: 'Motion',
  motionNone: 'None',
  motionArmed: 'Motion: {name}',
  licenseNote: 'License',
}

export function formatStencilString(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template
  let out = template
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`{${key}}`).join(String(value))
  }
  return out
}
