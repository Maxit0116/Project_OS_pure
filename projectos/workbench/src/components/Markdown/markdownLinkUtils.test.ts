import { describe, expect, it } from 'vitest'
import {
  findHeadingLine,
  resolveRelativeDocumentPath,
  restrictMarkdownUrl,
  slugifyHeading,
} from './markdownLinkUtils'

describe('markdownLinkUtils', () => {
  it('slugifies headings for anchor links', () => {
    expect(slugifyHeading('Quick Start')).toBe('quick-start')
    expect(slugifyHeading('What’s in this project?')).toBe('whats-in-this-project')
  })

  it('resolves relative document paths from the current file directory', () => {
    expect(resolveRelativeDocumentPath('docs/README.md', '../app/page.tsx')).toBe('app/page.tsx')
    expect(resolveRelativeDocumentPath('docs/guide/intro.md', './setup.md')).toBe(
      'docs/guide/setup.md',
    )
  })

  it('finds heading lines in markdown content', () => {
    const content = ['# Title', '', '## Quick Start', 'Body'].join('\n')
    expect(findHeadingLine(content, 'quick-start')).toBe(3)
  })

  it('allows workspace-relative urls through restrictMarkdownUrl', () => {
    expect(restrictMarkdownUrl('./other.md')).toBe('./other.md')
    expect(restrictMarkdownUrl('#section')).toBe('#section')
    expect(restrictMarkdownUrl('javascript:alert(1)')).toBeUndefined()
    expect(restrictMarkdownUrl('https://example.com')).toBe('https://example.com')
  })
})
