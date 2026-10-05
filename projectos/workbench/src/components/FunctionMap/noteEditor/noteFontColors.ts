export type NoteFontColorPresetId =
  | 'accent'
  | 'success'
  | 'warning'
  | 'error'
  | 'violet'
  | 'muted'

export interface NoteFontColorPreset {
  id: NoteFontColorPresetId
  token: string
  labelKey:
    | 'mapArtifacts.noteFontColorAccent'
    | 'mapArtifacts.noteFontColorSuccess'
    | 'mapArtifacts.noteFontColorWarning'
    | 'mapArtifacts.noteFontColorError'
    | 'mapArtifacts.noteFontColorViolet'
    | 'mapArtifacts.noteFontColorMuted'
}

export const NOTE_FONT_COLOR_PRESETS: NoteFontColorPreset[] = [
  { id: 'accent', token: '--color-accent', labelKey: 'mapArtifacts.noteFontColorAccent' },
  { id: 'success', token: '--color-success', labelKey: 'mapArtifacts.noteFontColorSuccess' },
  { id: 'warning', token: '--color-warning', labelKey: 'mapArtifacts.noteFontColorWarning' },
  { id: 'error', token: '--color-error', labelKey: 'mapArtifacts.noteFontColorError' },
  { id: 'violet', token: '--color-violet', labelKey: 'mapArtifacts.noteFontColorViolet' },
  { id: 'muted', token: '--color-text-secondary', labelKey: 'mapArtifacts.noteFontColorMuted' },
]

export function resolveCssTokenColor(token: string, root: HTMLElement = document.documentElement): string {
  const value = getComputedStyle(root).getPropertyValue(token).trim()
  return value.length > 0 ? value : '#ffffff'
}
