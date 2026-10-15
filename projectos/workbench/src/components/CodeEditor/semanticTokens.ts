import type * as Monaco from 'monaco-editor'
import * as monaco from 'monaco-editor'

import { lspClient } from '../../lsp/lspClient'

const filePaths = new Map<string, string>()
const onDidChange = new monaco.Emitter<void>()
let registered = false

export function trackSemanticTokenModel(
  model: Monaco.editor.ITextModel,
  filePath: string,
): () => void {
  const key = model.uri.toString()
  filePaths.set(key, filePath)
  return () => {
    if (filePaths.get(key) === filePath) filePaths.delete(key)
  }
}

export function registerSemanticTokenProviders(): void {
  if (registered) return
  registered = true

  const provider: Monaco.languages.DocumentSemanticTokensProvider = {
    onDidChange: onDidChange.event,
    getLegend() {
      return lspClient.getSemanticTokensLegend()
    },
    async provideDocumentSemanticTokens(model) {
      const filePath = filePaths.get(model.uri.toString())
      if (!filePath || !lspClient.isAvailable()) return null
      try {
        const tokens = await lspClient.requestSemanticTokens(filePath)
        if (!tokens) return null
        return { data: Uint32Array.from(tokens.data) }
      } catch {
        return null
      }
    },
    releaseDocumentSemanticTokens() {},
  }

  monaco.languages.registerDocumentSemanticTokensProvider('typescript', provider)
  monaco.languages.registerDocumentSemanticTokensProvider('javascript', provider)
  lspClient.onLanguageServerReady(() => onDidChange.fire())
}
