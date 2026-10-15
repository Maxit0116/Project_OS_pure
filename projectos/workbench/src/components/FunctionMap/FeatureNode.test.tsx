import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import FeatureNode, {
  isPurposeFirstArchitectureLevel,
  type FeatureNodeData,
} from './FeatureNode'

const baseData: FeatureNodeData = {
  label: 'Identity module',
  status: 'active',
  nodeType: 'capability',
  elementType: 'component',
  elementTypeLabel: 'Feature module',
  responsibility: 'Helps people sign in and keeps their sessions secure.',
  responsibilityLabel: 'Purpose',
  technologyLabel: 'Technology',
  evidenceLabel: '2 evidence files',
  suggestedLabel: 'Suggested',
  responsibilityMissing: 'Purpose has not been documented.',
  technologyMissing: 'Technology not specified',
  openGraphLabel: 'Open internal file map',
  fileCount: 2,
  isSelected: false,
}

function renderFeatureNode(data: Partial<FeatureNodeData> = {}): string {
  const props = {
    id: 'node-test',
    type: 'feature',
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    data: { ...baseData, ...data },
  } as unknown as NodeProps & { data: FeatureNodeData }

  return renderToStaticMarkup(
    <ReactFlowProvider>
      <FeatureNode {...props} />
    </ReactFlowProvider>,
  )
}

describe('FeatureNode purpose-first hierarchy', () => {
  it.each(['context', 'container', 'component'] as const)(
    'enables purpose-first presentation for %s-level cards',
    (level) => {
      expect(isPurposeFirstArchitectureLevel(level)).toBe(true)
    },
  )

  it.each(['code', undefined] as const)(
    'does not enable purpose-first presentation for %s-level cards',
    (level) => {
      expect(isPurposeFirstArchitectureLevel(level)).toBe(false)
    },
  )

  it('renders the full purpose before the name when purpose-first is enabled', () => {
    const html = renderFeatureNode({ purposeFirst: true })

    expect(html.indexOf('Helps people sign in')).toBeLessThan(
      html.indexOf('Identity module'),
    )
    expect(html).toContain('data-purpose-first="true"')
    expect(html).toContain(
      'title="Helps people sign in and keeps their sessions secure."',
    )
    expect(html).toContain(
      'aria-label="Purpose: Helps people sign in and keeps their sessions secure."',
    )
  })

  it('keeps the complete fallback purpose accessible', () => {
    const html = renderFeatureNode({
      purposeFirst: true,
      responsibility: undefined,
    })

    expect(html).toContain('Purpose has not been documented.')
    expect(html).toContain('title="Purpose has not been documented."')
  })

  it('keeps legacy cards name-first when purposeFirst is absent', () => {
    const html = renderFeatureNode()

    expect(html.indexOf('Identity module')).toBeLessThan(
      html.indexOf('Helps people sign in'),
    )
    expect(html).not.toContain('data-purpose-first')
  })

  it('uses a corner icon for drill-in and keeps the sentence in the accessible name', () => {
    const html = renderFeatureNode({
      canOpenGraph: true,
      onOpenGraph: () => undefined,
    })

    expect(html).toContain('aria-label="Open internal file map"')
    expect(html).not.toContain('→')
  })

  it('keeps code/file cards on their existing purpose-first file layout', () => {
    const html = renderFeatureNode({
      label: 'app/login/page.tsx',
      elementType: 'code_element',
      elementTypeLabel: 'Code file',
      responsibility: 'Renders and submits the login form.',
      responsibilityLabel: 'This file does',
      purposeFirst: true,
    })

    expect(html.indexOf('Renders and submits')).toBeLessThan(
      html.indexOf('app/login/page.tsx'),
    )
    expect(html).toContain('This file does')
    expect(html).not.toContain('data-purpose-first')
  })
})
