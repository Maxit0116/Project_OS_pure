export const COMMAND_PALETTE_FILE_GROUP = 'Files'

export type CommandPaletteMode = 'all' | 'files'

export function filterCommandPaletteEntries<T extends { label: string; group: string }>(
  commands: readonly T[],
  query: string,
  mode: CommandPaletteMode,
): T[] {
  const needle = query.trim().toLowerCase()
  return commands.filter((command) => {
    if (mode === 'files' && command.group !== COMMAND_PALETTE_FILE_GROUP) return false
    if (!needle) return true
    return command.label.toLowerCase().includes(needle)
  })
}
