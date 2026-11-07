import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './locales/en'

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'locales' ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/u.test(name) && !/\.test\.(ts|tsx)$/u.test(name) ? [full] : []
  })
}

function resolves(path: string): boolean {
  let current: unknown = en
  for (const part of path.split('.')) {
    current = (current as Record<string, unknown> | undefined)?.[part]
  }
  return typeof current === 'string'
}

// `ts('group.key')` and `getStoreMessage(locale, 'group.key')` with a literal path. A key asked for
// under the wrong group is shown to the person as the raw path (seen: "chat.globalAgentEmptyHint"
// on the Agent empty state, while the text lived under `context`).
const LITERAL_PATH = /\b(?:ts|getStoreMessage)\(\s*(?:[A-Za-z_.]+,\s*)?(['"])([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)\1/gu

describe('message keys used in source', () => {
  it('every literal message path exists in the locale files', () => {
    const missing: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(LITERAL_PATH)) {
        if (!resolves(match[2]!)) missing.push(`${relative(SRC, file)}: ${match[2]}`)
      }
    }
    expect(missing).toEqual([])
  })
})
