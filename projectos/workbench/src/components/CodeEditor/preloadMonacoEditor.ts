import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

import { registerProjectOsThemes } from './editorTheme'
import { registerSemanticTokenProviders } from './semanticTokens'

// Use the locally bundled monaco-editor instead of the CDN default.
// Without this, @monaco-editor/loader tries to fetch scripts from cdn.jsdelivr.net
// which is blocked by the Electron CSP script-src policy.
loader.config({ monaco })
registerProjectOsThemes(monaco)
registerSemanticTokenProviders()
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
})
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
})

if (typeof window !== 'undefined') {
  void import('./monacoWorkers').then(({ installMonacoWorkers }) => installMonacoWorkers())
}

let preloaded = false
let preloadPromise: ReturnType<typeof loader.init> | null = null

export function isMonacoPreloaded(): boolean {
  return preloaded
}

export function preloadMonacoEditor(): void {
  if (preloaded || preloadPromise) return
  preloadPromise = loader.init()
    .then(() => {
      preloaded = true
    })
    .catch((error) => {
      preloadPromise = null
      console.warn('[preloadMonacoEditor] failed to preload Monaco editor', error)
    })
}
