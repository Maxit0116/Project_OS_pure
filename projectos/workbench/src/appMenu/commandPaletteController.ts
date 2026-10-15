export type CommandPaletteAction = 'toggle' | 'open-files'

type CommandPaletteListener = (action: CommandPaletteAction) => void

let listener: CommandPaletteListener | null = null

export function bindCommandPalette(next: CommandPaletteListener): () => void {
  listener = next
  return () => {
    if (listener === next) listener = null
  }
}

export function dispatchCommandPalette(action: CommandPaletteAction): void {
  listener?.(action)
}
