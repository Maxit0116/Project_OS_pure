export function splitFilePath(path: string): { basename: string; dirname: string } {
  const normalized = path.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash === -1) {
    return { basename: normalized, dirname: '' }
  }
  return {
    basename: normalized.slice(lastSlash + 1),
    dirname: normalized.slice(0, lastSlash),
  }
}
