import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { PromptRefinement } from '@contracts/index'
import PromptRefinementCard from './PromptRefinementCard'

const refinement: PromptRefinement = {
  id: 'refinement-test',
  understood: 'Use a friendlier login heading',
  ambiguities: ['Should the subtitle change too?'],
  suggestions: ['Keep the existing heading level'],
  affectedNodeIds: ['feat_login'],
  affectedFiles: ['lib/related-auth.ts'],
  confidence: 0.9,
  mode: 'model',
}

describe('PromptRefinementCard', () => {
  it('distinguishes the authorized target from model-identified related files', () => {
    const html = renderToStaticMarkup(
      <PromptRefinementCard
        refinement={refinement}
        targetFile="app/login/page.tsx"
        confirmed={false}
        onConfirm={vi.fn()}
        onRevise={vi.fn()}
      />,
    )

    const targetSection = html.match(
      /<section[^>]*data-refinement-section="target-file"[^>]*>[\s\S]*?<\/section>/u,
    )?.[0]
    const relatedSection = html.match(
      /<section[^>]*data-refinement-section="related-files"[^>]*>[\s\S]*?<\/section>/u,
    )?.[0]
    expect(targetSection).toContain('app/login/page.tsx')
    expect(targetSection).not.toContain('lib/related-auth.ts')
    expect(relatedSection).toContain('lib/related-auth.ts')
    expect(relatedSection).not.toContain('app/login/page.tsx')
    expect(html).toContain('文件尚未修改。')
    expect(html).toContain('确认并生成修改方案')
    expect(html).toContain('修改需求')
  })

  it('renders model suggestions as informational list items, not actions', () => {
    const html = renderToStaticMarkup(
      <PromptRefinementCard
        refinement={refinement}
        targetFile="app/login/page.tsx"
        confirmed={false}
        onConfirm={vi.fn()}
        onRevise={vi.fn()}
      />,
    )

    expect(html).toContain('<li>Keep the existing heading level</li>')
    expect(html).not.toMatch(/<button[^>]*>Keep the existing heading level<\/button>/u)
  })
})
