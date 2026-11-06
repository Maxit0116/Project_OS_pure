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

/**
 * The language id the TypeScript language server needs. The editor's id is Monaco's, which calls a
 * .tsx file "typescript"; opened under that id the server parses JSX as TypeScript and its outline of
 * excalidraw's App.tsx was 459 entries named "<unknown>" instead of App, AppContext, ….
 */
export function lspLanguageId(filePath: string, editorLanguage: string): string {
  const extension = /\.([^./\\]+)$/u.exec(filePath)?.[1]?.toLowerCase()
  switch (extension) {
    case 'tsx':
      return 'typescriptreact'
    case 'jsx':
      return 'javascriptreact'
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    default:
      return editorLanguage
  }
}
