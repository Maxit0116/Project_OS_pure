import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Use the locally bundled monaco-editor to avoid CDN fetches blocked by CSP.
loader.config({ monaco })

import { languageForPath } from '../../data/sampleFileContents'

export type DiffSyntaxTheme = 'vs' | 'vs-dark'

const colorizeCache = new Map<string, Promise<string>>()

let monacoReady: ReturnType<typeof loader.init> | null = null

function ensureMonaco() {
  if (!monacoReady) {
    monacoReady = loader.init()
  }
  return monacoReady
}

function cacheKey(text: string, language: string, theme: DiffSyntaxTheme): string {
  return `${theme}\0${language}\0${text}`
}

export function escapeDiffLineHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function colorizeDiffLine(
  text: string,
  language: string,
  theme: DiffSyntaxTheme,
): Promise<string> {
  const key = cacheKey(text, language, theme)
  const cached = colorizeCache.get(key)
  if (cached) return cached

  const promise = ensureMonaco().then((monaco) =>
    monaco.editor.colorize(text, language, { tabSize: 2, theme }),
  )
  colorizeCache.set(key, promise)
  return promise
}

export async function colorizeDiffLines(
  lines: Array<{ id: string; text: string }>,
  filePath: string,
  theme: DiffSyntaxTheme,
): Promise<Map<string, string>> {
  const language = languageForPath(filePath)
  const uniqueLines = new Map<string, string>()
  for (const line of lines) {
    uniqueLines.set(line.id, line.text)
  }

  const results = new Map<string, string>()
  await Promise.all(
    [...uniqueLines.entries()].map(async ([id, text]) => {
      const html = await colorizeDiffLine(text, language, theme)
      results.set(id, html)
    }),
  )
  return results
}

export function clearDiffSyntaxHighlightCache(): void {
  colorizeCache.clear()
}
