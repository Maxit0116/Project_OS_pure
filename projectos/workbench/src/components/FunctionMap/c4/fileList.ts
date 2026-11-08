/** How many file names a feature box lists before "+N more files". */
export const MAX_FILES_SHOWN = 4
const FILE_LINE_HEIGHT = 16
const FILE_BLOCK_PADDING = 10

/** Extra height a feature box needs to list its file names. */
export function filesBlockHeight(fileCount: number): number {
  if (fileCount <= 0) return 0
  const lines = Math.min(fileCount, MAX_FILES_SHOWN) + (fileCount > MAX_FILES_SHOWN ? 1 : 0)
  return FILE_BLOCK_PADDING + lines * FILE_LINE_HEIGHT
}
