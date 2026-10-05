import type { DiagnosticItem, DocumentSymbolItem } from '@contracts/index'
import { isDesktopApp } from '../data/clientMode'
import { createNotification, createRequest, pathToUri } from './lspProtocol'
import { mapLspDocumentSymbols } from './lspSymbolMapping'

type MessageHandler = (message: Record<string, unknown>) => void

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const openDocuments = new Map<string, { version: number; languageId: string }>()
const pendingRequests = new Map<number, PendingRequest>()

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000

let workspaceRoot: string | null = null
let started = false
let unavailableReason: string | null = null
let messageDisposable: { dispose(): void } | null = null
const handlers = new Set<MessageHandler>()

function sendRaw(message: string): void {
  window.projectOS?.lsp?.send(message)
}

function settlePendingRequest(id: number, result: unknown, error?: { message?: string }): void {
  const pending = pendingRequests.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingRequests.delete(id)
  if (error) {
    pending.reject(new Error(error.message ?? 'LSP request failed'))
    return
  }
  pending.resolve(result)
}

function handleIncomingMessage(message: Record<string, unknown>): void {
  if (typeof message.id === 'number' && !('method' in message)) {
    const error = message.error as { message?: string } | undefined
    settlePendingRequest(message.id, message.result, error)
  }

  if (message.method === 'textDocument/publishDiagnostics') {
    const params = message.params as {
      uri: string
      diagnostics: Array<Record<string, unknown>>
    }
    if (workspaceRoot) {
      const items = parseDiagnostics(workspaceRoot, params.uri, params.diagnostics ?? [])
      for (const handler of handlers) {
        handler({ type: 'diagnostics', uri: params.uri, items })
      }
    }
  }

  for (const handler of handlers) {
    handler(message)
  }
}

function lspSeverityToDiagnostic(
  severity: number | undefined,
): DiagnosticItem['severity'] {
  if (severity === 1) return 'error'
  if (severity === 2) return 'warning'
  if (severity === 3) return 'info'
  return 'hint'
}

function parseDiagnostics(
  workspace: string,
  uri: string,
  diagnostics: Array<Record<string, unknown>>,
): DiagnosticItem[] {
  const prefix = `file://${workspace.replace(/\\/g, '/').replace(/\/$/, '')}/`
  const filePath = uri.startsWith(prefix) ? uri.slice(prefix.length) : uri
  return diagnostics.map((item, index) => {
    const range = item.range as
      | { start?: { line?: number; character?: number }; end?: { line?: number; character?: number } }
      | undefined
    return {
      id: `${filePath}:${String(item.code ?? index)}:${String(range?.start?.line ?? 0)}`,
      filePath,
      line: Number(range?.start?.line ?? 0) + 1,
      column: Number(range?.start?.character ?? 0) + 1,
      endLine: range?.end?.line != null ? Number(range.end.line) + 1 : undefined,
      endColumn: range?.end?.character != null ? Number(range.end.character) + 1 : undefined,
      severity: lspSeverityToDiagnostic(item.severity as number | undefined),
      message: String(item.message ?? 'Unknown diagnostic'),
      source: typeof item.source === 'string' ? item.source : undefined,
      code: typeof item.code === 'string' || typeof item.code === 'number' ? item.code : undefined,
    }
  })
}

export const lspClient = {
  onMessage(handler: MessageHandler): () => void {
    handlers.add(handler)
    return () => handlers.delete(handler)
  },

  async start(root: string): Promise<void> {
    if (!isDesktopApp() || !window.projectOS?.lsp) return
    if (started && workspaceRoot === root) return

    await this.stop()
    workspaceRoot = root
    messageDisposable = window.projectOS.lsp.onMessage((raw) => {
      try {
        const message = JSON.parse(raw) as Record<string, unknown>
        handleIncomingMessage(message)
      } catch (error) {
        console.error('[lspClient] failed to parse message', error)
      }
    })

    const startResult = await window.projectOS.lsp.start(root)
    if (!startResult?.ok) {
      unavailableReason = startResult?.error ?? 'Language server unavailable'
      console.warn('[lspClient]', unavailableReason)
      messageDisposable?.dispose()
      messageDisposable = null
      workspaceRoot = null
      return
    }

    unavailableReason = null
    const init = createRequest('initialize', {
      processId: null,
      rootUri: pathToUri(root, '.'),
      capabilities: {},
      workspaceFolders: [{ uri: pathToUri(root, '.'), name: 'workspace' }],
    })
    sendRaw(init.message)
    sendRaw(createNotification('initialized', {}))
    started = true
  },

  async stop(): Promise<void> {
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('LSP client stopped'))
    }
    pendingRequests.clear()

    if (isDesktopApp() && window.projectOS?.lsp) {
      await window.projectOS.lsp.stop()
    }
    messageDisposable?.dispose()
    messageDisposable = null
    openDocuments.clear()
    started = false
    workspaceRoot = null
    unavailableReason = null
  },

  isAvailable(): boolean {
    return started
  },

  getUnavailableReason(): string | null {
    return unavailableReason
  },

  async request<T>(
    method: string,
    params: unknown,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (!started) {
      throw new Error(unavailableReason ?? 'Language server unavailable')
    }

    const { id, message } = createRequest(method, params)
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id)
        reject(new Error(`LSP request timed out: ${method}`))
      }, timeoutMs)

      pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })
      sendRaw(message)
    })
  },

  async documentSymbol(filePath: string): Promise<DocumentSymbolItem[]> {
    if (!workspaceRoot || !started) return []
    const uri = pathToUri(workspaceRoot, filePath)
    const result = await this.request<unknown>('textDocument/documentSymbol', {
      textDocument: { uri },
    })
    if (!Array.isArray(result)) return []
    return mapLspDocumentSymbols(result as Parameters<typeof mapLspDocumentSymbols>[0])
  },

  openDocument(filePath: string, languageId: string, content: string): void {
    if (!workspaceRoot || !started) return
    const uri = pathToUri(workspaceRoot, filePath)
    const existing = openDocuments.get(uri)
    if (existing) {
      this.changeDocument(filePath, content)
      return
    }
    openDocuments.set(uri, { version: 1, languageId })
    sendRaw(
      createNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 1, text: content },
      }),
    )
  },

  changeDocument(filePath: string, content: string): void {
    if (!workspaceRoot || !started) return
    const uri = pathToUri(workspaceRoot, filePath)
    const current = openDocuments.get(uri)
    const version = (current?.version ?? 0) + 1
    openDocuments.set(uri, { version, languageId: current?.languageId ?? 'typescript' })
    sendRaw(
      createNotification('textDocument/didChange', {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      }),
    )
  },

  closeDocument(filePath: string): void {
    if (!workspaceRoot || !started) return
    const uri = pathToUri(workspaceRoot, filePath)
    openDocuments.delete(uri)
    sendRaw(createNotification('textDocument/didClose', { textDocument: { uri } }))
  },

  getWorkspaceRoot(): string | null {
    return workspaceRoot
  },
}
