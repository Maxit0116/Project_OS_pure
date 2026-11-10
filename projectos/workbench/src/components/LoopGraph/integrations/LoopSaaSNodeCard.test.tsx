import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoopSaaSNodeCard } from './LoopSaaSNodeCard'

describe('LoopSaaSNodeCard', () => {
  it('renders GitHub/Slack/Lark brand cards with secondary operation labels', () => {
    for (const id of ['github', 'slack', 'feishu', 'lark', 'sentry'] as const) {
      const html = renderToStaticMarkup(
        <LoopSaaSNodeCard integrationId={id} operationLabel="Create PR" state="selected" />,
      )
      expect(html).toContain(`data-integration="${id}"`)
      expect(html).toContain('Create PR')
      expect(html).toContain('loopSaaSNodeCard--selected')
    }
  })

  it('shows blocked badge when unconfigured and keeps next-step title', () => {
    const html = renderToStaticMarkup(
      <LoopSaaSNodeCard
        integrationId="slack"
        operationLabel="Post message"
        runtimeStatus="unconfigured"
      />,
    )
    expect(html).toContain('data-blocked="true"')
    expect(html).toContain('saas-blocked-badge')
    expect(html).toContain('Configure Slack')
  })

  it('uses neutral fallback letter when icon is missing', () => {
    const html = renderToStaticMarkup(
      <LoopSaaSNodeCard integrationId="http" operationLabel="Request" />,
    )
    expect(html).toContain('loopSaaSNodeCard__fallback')
    expect(html).toContain('>H<')
  })
})
