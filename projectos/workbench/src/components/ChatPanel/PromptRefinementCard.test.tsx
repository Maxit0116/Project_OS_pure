import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { PromptRefinement } from '@contracts/index'
import PromptRefinementCard from './PromptRefinementCard'

const refinement: PromptRefinement = {
  id: 'refinement-test',
  understood: 'Use a friendlier login heading',
  ambiguities: ['Should the subtitle change too?'],
  suggestions: ['Keep the existing heading level', 'Also refresh empty state'],
  affectedNodeIds: ['feat_login'],
  affectedFiles: ['lib/related-auth.ts'],
  confidence: 0.9,
  mode: 'model',
  alignment: {
    version: '0.1.0',
    id: 'align_refinement-test',
    items: [
      {
        id: 'stated_1',
        kind: 'stated',
        text: 'Use a friendlier login heading',
        selected: true,
      },
      {
        id: 'guess_1',
        kind: 'guess',
        text: 'Should the subtitle change too?',
        selected: false,
      },
    ],
    questions: [
      {
        id: 'q_scope',
        question: 'How wide should this change be?',
        topic: 'scope',
        blocking: true,
        options: [
          { id: 'o1', label: 'Heading only' },
          { id: 'o2', label: 'Heading and subtitle' },
        ],
      },
    ],
    status: 'awaiting_user',
  },
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
  })

  it('renders stated, guess, and design-question sections for alignment', () => {
    const html = renderToStaticMarkup(
      <PromptRefinementCard
        refinement={refinement}
        targetFile={null}
        confirmed={false}
        onConfirm={vi.fn()}
        onRevise={vi.fn()}
      />,
    )

    expect(html).toContain('data-testid="alignment-card"')
    expect(html).toContain('data-alignment-section="stated"')
    expect(html).toContain('data-alignment-section="guess"')
    expect(html).toContain('data-alignment-section="questions"')
    expect(html).toContain('Use a friendlier login heading')
    expect(html).toContain('Should the subtitle change too?')
    expect(html).toContain('How wide should this change be?')
    expect(html).toContain('Heading only')
    expect(html).toContain('开始开发')
    expect(html).toContain('disabled')
  })
})
