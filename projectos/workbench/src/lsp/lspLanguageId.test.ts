import { describe, expect, it } from 'vitest'
import { lspLanguageId } from './lspProtocol'

describe('the language id sent to the language server', () => {
  it('tells it a .tsx or .jsx file has JSX, though the editor calls it typescript or javascript', () => {
    expect(lspLanguageId('packages/excalidraw/components/App.tsx', 'typescript')).toBe('typescriptreact')
    expect(lspLanguageId('src/Button.JSX', 'javascript')).toBe('javascriptreact')
  })

  it('keeps plain TypeScript and JavaScript, and any other language as the editor names it', () => {
    expect(lspLanguageId('src/util.ts', 'typescript')).toBe('typescript')
    expect(lspLanguageId('vite.config.mts', 'plaintext')).toBe('typescript')
    expect(lspLanguageId('scripts/build.cjs', 'javascript')).toBe('javascript')
    expect(lspLanguageId('app/main.py', 'python')).toBe('python')
    expect(lspLanguageId('Makefile', 'makefile')).toBe('makefile')
  })
})
