import { describe, expect, it } from 'vitest'
import type { MapArtifact } from '@contracts/index'
import { architectureFileNodeId } from './architectureView'
import { buildMapSearchHits } from './mapSearch'

function note(id: string, title: string, stackId?: string): MapArtifact {
  return {
    id,
    type: 'note',
    scope: 'map',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    note: { title, body: '' },
    ...(stackId ? { stackId, stackOrder: 0, stackActive: true } : {}),
  } as MapArtifact
}

describe('buildMapSearchHits', () => {
  const nodes = [
    {
      id: 'billing',
      name: 'Billing',
      nameEn: 'Invoices',
      level: 'component' as const,
      parentId: 'api',
      linkedFiles: [{ path: 'src/billing/InvoiceService.ts' }],
    },
    {
      id: 'auth',
      name: 'Auth',
      level: 'container' as const,
      parentId: 'system',
    },
  ]

  it('returns nothing for a blank query', () => {
    expect(
      buildMapSearchHits({
        nodes,
        query: '   ',
      }),
    ).toEqual([])
  })

  it('matches feature titles and english names, preferring a title prefix', () => {
    const hits = buildMapSearchHits({
      nodes,
      query: 'in',
    })

    expect(hits.map((hit) => hit.title)).toEqual(['Billing', 'InvoiceService.ts'])
    expect(hits[0]).toMatchObject({
      id: 'billing',
      canvasNodeId: 'billing',
      kind: 'feature',
      level: 'component',
      parentId: 'api',
    })
  })

  it('jumps code files to the owning component scope', () => {
    const [hit] = buildMapSearchHits({
      nodes,
      query: 'InvoiceService',
    })

    expect(hit).toMatchObject({
      id: architectureFileNodeId('billing', 'src/billing/InvoiceService.ts'),
      canvasNodeId: architectureFileNodeId('billing', 'src/billing/InvoiceService.ts'),
      kind: 'feature',
      title: 'InvoiceService.ts',
      level: 'code',
      parentId: 'billing',
    })
  })

  it('lists matching cards and workgroups by title', () => {
    const hits = buildMapSearchHits({
      nodes,
      artifacts: [note('card_1', 'Billing notes', 'stack_1')],
      workGroups: [{ id: 'wg_1', title: 'Billing lane' }],
      query: 'billing',
    })

    expect(hits.map((hit) => [hit.kind, hit.title, hit.canvasNodeId])).toEqual([
      ['feature', 'Billing', 'billing'],
      ['card', 'Billing notes', 'stack_1'],
      ['workgroup', 'Billing lane', 'wg_1'],
      [
        'feature',
        'InvoiceService.ts',
        architectureFileNodeId('billing', 'src/billing/InvoiceService.ts'),
      ],
    ])
    expect(hits[1]?.artifactId).toBe('card_1')
    expect(hits[2]?.workGroupId).toBe('wg_1')
  })
})
