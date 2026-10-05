function encodeMessage(payload: unknown): string {
  const body = JSON.stringify(payload)
  const byteLength = new TextEncoder().encode(body).length
  return `Content-Length: ${byteLength}\r\n\r\n${body}`
}

let nextRequestId = 1

export function createRequest(method: string, params: unknown): { id: number; message: string } {
  const id = nextRequestId++
  return {
    id,
    message: encodeMessage({ jsonrpc: '2.0', id, method, params }),
  }
}

export function createNotification(method: string, params: unknown): string {
  return encodeMessage({ jsonrpc: '2.0', method, params })
}

export function pathToUri(workspaceRoot: string, filePath: string): string {
  const normalizedRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '')
  if (filePath === '.' || filePath === '') return `file://${normalizedRoot}`
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\//, '')
  return `file://${normalizedRoot}/${normalizedPath}`
}

export function uriToPath(uri: string, workspaceRoot: string): string | null {
  const normalizedRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '')
  const prefix = `file://${normalizedRoot}/`
  if (!uri.startsWith(prefix)) return null
  return uri.slice(prefix.length)
}
