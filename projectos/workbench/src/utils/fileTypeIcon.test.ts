import { describe, expect, it } from 'vitest'
import { Braces, File, FileCode, FileText } from 'lucide-react'
import { resolveFileTypeIcon } from './fileTypeIcon'

describe('resolveFileTypeIcon', () => {
  it('maps TypeScript files to FileCode', () => {
    expect(resolveFileTypeIcon('app/route.ts')).toBe(FileCode)
    expect(resolveFileTypeIcon('components/Button.tsx')).toBe(FileCode)
  })

  it('maps JSON and markdown files', () => {
    expect(resolveFileTypeIcon('package.json')).toBe(Braces)
    expect(resolveFileTypeIcon('docs/readme.md')).toBe(FileText)
  })

  it('falls back to File for unknown extensions', () => {
    expect(resolveFileTypeIcon('Makefile')).toBe(File)
    expect(resolveFileTypeIcon('no-extension')).toBe(File)
  })
})
