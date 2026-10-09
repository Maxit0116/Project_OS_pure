import { describe, expect, it } from 'vitest'
import {
  formatC4EdgeLabel,
  resolveEdgeDisplayLabel,
} from './edgePresentation'

describe('formatC4EdgeLabel', () => {
  it('combines intent label with technology in brackets', () => {
    expect(
      formatC4EdgeLabel('Gets account information from', 'JSON/HTTPS'),
    ).toBe('Gets account information from [JSON/HTTPS]')
  })

  it('shows label alone when technology is missing', () => {
    expect(formatC4EdgeLabel('Uses authentication service')).toBe(
      'Uses authentication service',
    )
  })

  it('shows technology alone in brackets when label is missing', () => {
    expect(formatC4EdgeLabel(undefined, 'gRPC')).toBe('[gRPC]')
  })

  it('falls back to relation i18n when label is absent', () => {
    expect(
      formatC4EdgeLabel(undefined, 'HTTPS', 'depends_on', 'Depends on'),
    ).toBe('Depends on [HTTPS]')
  })

  it('falls back to humanized relation when label and i18n are absent', () => {
    expect(formatC4EdgeLabel(undefined, undefined, 'data_flows_to')).toBe(
      'data flows to',
    )
  })

  it('treats purpose-style text passed as label as the intent', () => {
    expect(
      formatC4EdgeLabel('Reads user profile for session restore', 'SQL'),
    ).toBe('Reads user profile for session restore [SQL]')
  })

  it('ignores blank / whitespace-only fields', () => {
    expect(formatC4EdgeLabel('  ', '  ', 'calls', '  ')).toBe('calls')
    expect(formatC4EdgeLabel('Sends events', '   ')).toBe('Sends events')
    expect(formatC4EdgeLabel(undefined, undefined)).toBe('')
  })

  it('does not repeat a bracket that the intent already contains', () => {
    expect(
      formatC4EdgeLabel('事件入库与本地查询 [SQL]', 'SQL'),
    ).toBe('事件入库与本地查询 [SQL]')
    expect(
      formatC4EdgeLabel('后台定时同步事件 [HTTPS] [HTTPS]', 'HTTPS'),
    ).toBe('后台定时同步事件 [HTTPS]')
  })

  it('supports dense tech-only labels', () => {
    expect(
      formatC4EdgeLabel('Gets account information from', 'JSON/HTTPS', undefined, undefined, 'tech'),
    ).toBe('[JSON/HTTPS]')
    expect(
      formatC4EdgeLabel('Uses auth', undefined, 'uses', undefined, 'tech'),
    ).toBe('Uses auth')
  })
})

describe('resolveEdgeDisplayLabel', () => {
  it('still resolves label / relation without technology', () => {
    expect(
      resolveEdgeDisplayLabel('Custom', 'depends_on', 'Depends on'),
    ).toBe('Custom')
    expect(
      resolveEdgeDisplayLabel(undefined, 'depends_on', 'Depends on'),
    ).toBe('Depends on')
    expect(resolveEdgeDisplayLabel(undefined, 'shares_data', undefined)).toBe(
      'shares data',
    )
  })
})
