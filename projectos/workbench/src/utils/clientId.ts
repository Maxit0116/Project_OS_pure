let fallbackSequence = 0

export function createClientId(prefix = ''): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (uuid) return `${prefix}${uuid}`
  } catch {
    // Some embedded/non-secure contexts expose crypto but reject randomUUID().
  }

  fallbackSequence += 1
  return `${prefix}${Date.now().toString(36)}_${fallbackSequence.toString(36)}`
}
