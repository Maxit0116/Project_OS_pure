import { describe, expect, it } from 'vitest'
import { isMarkdownPath } from './markdownPath'

describe('isMarkdownPath', () => {
  it('recognizes .md and .markdown extensions', () => {
    expect(isMarkdownPath('docs/README.md')).toBe(true)
    expect(isMarkdownPath('docs/guide.markdown')).toBe(true)
    expect(isMarkdownPath('docs/README.MD')).toBe(true)
  })

  it('rejects non-markdown paths', () => {
    expect(isMarkdownPath('src/index.ts')).toBe(false)
    expect(isMarkdownPath('README.mdown')).toBe(false)
    expect(isMarkdownPath('file.mdx')).toBe(false)
  })
})
