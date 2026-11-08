import { create } from 'zustand'
import type { DocumentSymbolItem } from '@contracts/index'
import { isDesktopApp } from '../data/clientMode'
import { lspClient } from '../lsp/lspClient'
import { fallbackOutline, isServedByLanguageServer } from '../lsp/fallbackOutline'

const DEMO_OUTLINE: Record<string, DocumentSymbolItem[]> = {
  'app/login/page.tsx': [
    {
      name: 'LoginPage',
      kind: 'function',
      startLine: 8,
      startColumn: 1,
      endLine: 24,
      endColumn: 2,
      children: [],
    },
  ],
}

const OUTLINE_RETRY_DELAY_MS = 150

type FetchOutlineOptions = {
  force?: boolean
}

interface OutlineStore {
  symbolsByFile: Record<string, DocumentSymbolItem[]>
  loadingFiles: Record<string, boolean>
  unavailableReason: string | null
  fetchOutline: (filePath: string, options?: FetchOutlineOptions) => Promise<void>
  scheduleFetchOutline: (filePath: string) => void
  clear: () => void
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const inFlight = new Map<string, Promise<void>>()

async function documentSymbolWithRetry(filePath: string): Promise<DocumentSymbolItem[]> {
  try {
    return await lspClient.documentSymbol(filePath)
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, OUTLINE_RETRY_DELAY_MS))
    try {
      return await lspClient.documentSymbol(filePath)
    } catch {
      throw firstError
    }
  }
}

/** What the editor currently holds for a file; read lazily because the workbench store imports this one. */
async function editorText(filePath: string): Promise<string> {
  try {
    const { useWorkbenchStore } = await import('./workbenchStore')
    return useWorkbenchStore.getState().editorBuffers[filePath] ?? ''
  } catch {
    return ''
  }
}

/** Symbols read from the text, for a language the language server does not serve. */
async function symbolsWithoutServer(filePath: string): Promise<DocumentSymbolItem[]> {
  if (isServedByLanguageServer(filePath)) return []
  return fallbackOutline(filePath, await editorText(filePath))
}

async function loadOutlineSymbols(
  filePath: string,
  showLoading: boolean,
  set: (
    partial:
      | Partial<OutlineStore>
      | ((state: OutlineStore) => Partial<OutlineStore>),
  ) => void,
): Promise<void> {
  if (!isDesktopApp() || !lspClient.isAvailable()) {
    const demo = DEMO_OUTLINE[filePath] ?? (isDesktopApp() ? await symbolsWithoutServer(filePath) : [])
    set((state) => ({
      symbolsByFile: { ...state.symbolsByFile, [filePath]: demo },
      loadingFiles: { ...state.loadingFiles, [filePath]: false },
      unavailableReason: isDesktopApp() ? lspClient.getUnavailableReason() : null,
    }))
    return
  }

  if (showLoading) {
    set((state) => ({
      loadingFiles: { ...state.loadingFiles, [filePath]: true },
      unavailableReason: null,
    }))
  }

  try {
    let symbols = await documentSymbolWithRetry(filePath)
    // The bundled server speaks TypeScript and JavaScript. For any other language it answers with
    // nothing, and the panel said "no symbols" for every Python, Java, Go or Rust file.
    if (symbols.length === 0) symbols = await symbolsWithoutServer(filePath)
    set((state) => ({
      symbolsByFile: { ...state.symbolsByFile, [filePath]: symbols },
      loadingFiles: { ...state.loadingFiles, [filePath]: false },
    }))
  } catch (error) {
    console.warn('[outlineStore] failed to fetch outline', error)
    const fromText = await symbolsWithoutServer(filePath)
    set((state) => ({
      symbolsByFile: { ...state.symbolsByFile, [filePath]: fromText },
      loadingFiles: { ...state.loadingFiles, [filePath]: false },
      unavailableReason: fromText.length > 0 ? null : error instanceof Error ? error.message : 'Outline unavailable',
    }))
  }
}

export const useOutlineStore = create<OutlineStore>((set, get) => ({
  symbolsByFile: {},
  loadingFiles: {},
  unavailableReason: null,

  fetchOutline: async (filePath, options) => {
    if (!filePath) return

    const force = options?.force ?? false
    const cached = get().symbolsByFile[filePath]

    if (cached !== undefined && !force) {
      const existing = inFlight.get(filePath)
      if (existing) {
        await existing
        return
      }
      const refresh = loadOutlineSymbols(filePath, false, set)
      inFlight.set(filePath, refresh)
      try {
        await refresh
      } finally {
        inFlight.delete(filePath)
      }
      return
    }

    const existing = inFlight.get(filePath)
    if (existing) {
      await existing
      return
    }

    const showLoading = cached === undefined
    const promise = loadOutlineSymbols(filePath, showLoading, set)
    inFlight.set(filePath, promise)
    try {
      await promise
    } finally {
      inFlight.delete(filePath)
    }
  },

  scheduleFetchOutline: (filePath) => {
    if (!filePath) return
    const existing = debounceTimers.get(filePath)
    if (existing) clearTimeout(existing)
    debounceTimers.set(
      filePath,
      setTimeout(() => {
        debounceTimers.delete(filePath)
        void get().fetchOutline(filePath)
      }, 300),
    )
  },

  clear: () => {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer)
    }
    debounceTimers.clear()
    inFlight.clear()
    set({ symbolsByFile: {}, loadingFiles: {}, unavailableReason: null })
  },
}))
