const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function assertAllowedExternalUrl(input: unknown): string {
  if (typeof input !== 'string') {
    throw new Error('External URL must be a string')
  }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('External URL is invalid')
  }
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
    throw new Error('External URL protocol is not allowed')
  }
  return url.toString()
}

export function openAllowedExternalUrlInBackground(
  input: unknown,
  openExternal: (url: string) => Promise<unknown>,
): boolean {
  let url: string
  try {
    url = assertAllowedExternalUrl(input)
  } catch {
    return false
  }
  void openExternal(url).catch(() => {
    // Window-open requests have no response channel; contain OS failures here.
  })
  return true
}
