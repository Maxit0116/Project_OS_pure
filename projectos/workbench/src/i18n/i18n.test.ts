import { describe, expect, it } from 'vitest'
import en from './locales/en'
import zh from './locales/zh'
import { getStoreMessage } from './storeMessages'

function stringLeaves(tree: object, prefix = ''): Map<string, string> {
  const leaves = new Map<string, string>()

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      leaves.set(path, value)
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [childPath, childValue] of stringLeaves(value, path)) {
        leaves.set(childPath, childValue)
      }
    }
  }

  return leaves
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .sort()
}

describe('i18n messages', () => {
  it('keeps English and Chinese string paths in exact parity', () => {
    const englishPaths = [...stringLeaves(en).keys()].sort()
    const chinesePaths = [...stringLeaves(zh).keys()].sort()

    expect(chinesePaths).toEqual(englishPaths)
  })

  it('keeps interpolation placeholders aligned across locales', () => {
    const english = stringLeaves(en)
    const chinese = stringLeaves(zh)

    for (const [path, englishMessage] of english) {
      expect(placeholders(chinese.get(path) ?? ''), path).toEqual(
        placeholders(englishMessage),
      )
    }
  })

  it('resolves nested messages and interpolates every supplied value', () => {
    expect(
      getStoreMessage('en', 'diff.stats', {
        added: 12,
        removed: 3,
      }),
    ).toBe('+12 −3')
    expect(
      getStoreMessage('zh', 'diffReadyNotify.batch', {
        taskCount: 2,
        fileCount: 5,
      }),
    ).toBe('2 项任务已完成 · 共 5 个文件')
  })

  it('returns the requested path when a message is missing', () => {
    expect(getStoreMessage('en', 'missing.message')).toBe('missing.message')
    expect(getStoreMessage('zh', 'missing.message')).toBe('missing.message')
  })

  it('interpolates every repeated placeholder in store messages', () => {
    expect(getStoreMessage('en', '{count} of {count}', { count: 3 }))
      .toBe('3 of 3')
  })
})
