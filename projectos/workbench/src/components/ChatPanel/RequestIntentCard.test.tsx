import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RequestIntent } from '@contracts/index'
import { useWorkbenchStore } from '../../state/workbenchStore'
import RequestIntentCard from './RequestIntentCard'

const intent: RequestIntent = {
  version: '0.1.0',
  id: 'intent_test',
  projectId: 'project',
  rawRequest: 'Send a receipt after payment succeeds',
  goal: 'Send one receipt after a successful payment.',
  kind: 'change',
  entryNodeId: 'container_billing',
  touches: [{ nodeId: 'feature_billing', reason: 'Creates the payment success event', allow: { editExisting: true, addParts: false, deletePartIds: [] } }],
  structuralEffects: [{ kind: 'delete_node', nodeId: 'feature_old_receipts', descendantCount: 2, ownedFileCount: 3, source: 'server_derived' }],
  assumptions: ['Use the existing email template.'],
  outOfScope: ['Payment processing does not change.'],
  acceptance: ['A successful payment sends exactly one receipt.'],
  questions: [{ id: 'recipient', text: 'Which address should receive it?', options: [{ id: 'account', label: 'Account email' }, { id: 'custom', label: 'Another address' }] }],
  executorSelection: { kind: 'model', modelProfileId: 'model_1' },
  baseGraphHash: 'sha256:graph',
  revision: 1,
  status: 'draft',
}

describe('RequestIntentCard', () => {
  it('shows scope, impact, assumptions, acceptance, and requires answers before approval', () => {
    useWorkbenchStore.setState({ locale: 'en' })
    const html = renderToStaticMarkup(
      <RequestIntentCard intent={intent} busy={false} executorLabel="Reasoning model" onApprove={() => undefined} onRevise={() => undefined} />,
    )
    expect(html).toContain('Send one receipt after a successful payment.')
    expect(html).toContain('feature_billing')
    expect(html).toMatch(/2 sub-parts and 3 files|2 个子项和 3 个文件/u)
    expect(html).toContain('Use the existing email template.')
    expect(html).toContain('A successful payment sends exactly one receipt.')
    expect(html).toContain('Which address should receive it?')
    expect(html).toMatch(/disabled=""/u)
    expect(html).toMatch(/Edit request|修改请求/u)
  })
})
