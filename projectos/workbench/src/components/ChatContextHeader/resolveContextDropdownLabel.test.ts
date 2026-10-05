import { describe, expect, it } from 'vitest'

import {
  resolveContextDropdownLabel,
  truncateContextSummary,
} from './resolveContextDropdownLabel'

describe('resolveContextDropdownLabel', () => {
  it('returns global scope label when global agent is active', () => {
    expect(
      resolveContextDropdownLabel({
        globalAgentActive: true,
        selectedNodeId: 'feat_visitor',
        nodeName: 'Visitor',
        contextSummary: 'Browse public pages',
        globalScopeLabel: 'Global scope',
        emptyLabel: 'No context',
      }),
    ).toBe('Global scope')
  })

  it('combines node name and truncated summary', () => {
    const summary = '浏览公开页面并进入登录流程。'
    expect(
      resolveContextDropdownLabel({
        globalAgentActive: false,
        selectedNodeId: 'feat_visitor',
        nodeName: '访客 feature Visitor',
        contextSummary: summary,
        globalScopeLabel: 'Global scope',
        emptyLabel: 'No context',
      }),
    ).toBe(`访客 feature Visitor · ${summary}`)
  })

  it('returns node name when summary is missing', () => {
    expect(
      resolveContextDropdownLabel({
        globalAgentActive: false,
        selectedNodeId: 'feat_visitor',
        nodeName: 'Visitor',
        contextSummary: undefined,
        globalScopeLabel: 'Global scope',
        emptyLabel: 'No context',
      }),
    ).toBe('Visitor')
  })

  it('returns empty label when no scope is selected', () => {
    expect(
      resolveContextDropdownLabel({
        globalAgentActive: false,
        selectedNodeId: null,
        nodeName: null,
        contextSummary: null,
        globalScopeLabel: 'Global scope',
        emptyLabel: 'No context',
      }),
    ).toBe('No context')
  })
})

describe('truncateContextSummary', () => {
  it('truncates long summaries', () => {
    const long = 'a'.repeat(80)
    expect(truncateContextSummary(long)).toHaveLength(60)
    expect(truncateContextSummary(long).endsWith('…')).toBe(true)
  })
})
