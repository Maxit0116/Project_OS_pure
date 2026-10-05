import { afterEach, describe, expect, it, vi } from 'vitest'

const colorize = vi.fn(async (text: string) => `<span class="mtk1">${text}</span>`)
const init = vi.fn(async () => ({
  editor: { colorize },
}))

vi.mock('@monaco-editor/react', () => ({
  default: {},
  loader: { init },
}))

describe('diffSyntaxHighlight', () => {
  afterEach(async () => {
    vi.clearAllMocks()
    const { clearDiffSyntaxHighlightCache } = await import('./diffSyntaxHighlight')
    clearDiffSyntaxHighlightCache()
  })

  it('escapes fallback html', async () => {
    const { escapeDiffLineHtml } = await import('./diffSyntaxHighlight')
    expect(escapeDiffLineHtml('<tag> & "quote"')).toBe('&lt;tag&gt; &amp; &quot;quote&quot;')
  })

  it('colorizes lines with monaco and caches repeated text', async () => {
    const { colorizeDiffLine, colorizeDiffLines } = await import('./diffSyntaxHighlight')

    const html = await colorizeDiffLine('const x = 1', 'typescript', 'vs-dark')
    expect(html).toContain('mtk1')
    expect(colorize).toHaveBeenCalledWith('const x = 1', 'typescript', { tabSize: 2, theme: 'vs-dark' })

    await colorizeDiffLine('const x = 1', 'typescript', 'vs-dark')
    expect(colorize).toHaveBeenCalledTimes(1)

    const map = await colorizeDiffLines(
      [
        { id: 'a', text: 'const a = 1' },
        { id: 'b', text: 'const b = 2' },
      ],
      'app/login/page.tsx',
      'vs',
    )
    expect(map.get('a')).toContain('mtk1')
    expect(map.get('b')).toContain('mtk1')
    expect(colorize).toHaveBeenCalledWith('const a = 1', 'typescript', { tabSize: 2, theme: 'vs' })
  })
})
