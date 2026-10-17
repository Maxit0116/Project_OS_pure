import { describe, expect, it } from 'vitest'
import {
  filterDiffReadyCompletionsForNotification,
  mergeDiffReadyCompletions,
  resolveNotificationChannel,
  resolveNotificationChannelForCompletions,
  shouldSuppressDiffReadyNotification,
  truncateDiffReadySummary,
  type DiffReadyCompletion,
} from './diffReadyNotification'

const baseContext = {
  centerTab: 'function-map' as const,
  codeSubTab: 'editor' as const,
  windowFocused: true,
  rightPanelTab: 'chat' as const,
  agentFlowOpen: false,
}

function completion(
  overrides: Partial<DiffReadyCompletion> & Pick<DiffReadyCompletion, 'kind'>,
): DiffReadyCompletion {
  return {
    summary: 'Example task',
    completedAt: 1,
    context: baseContext,
    ...overrides,
  }
}

describe('diffReadyNotification', () => {
  it('suppresses when disabled or already on diff view while focused', () => {
    expect(
      shouldSuppressDiffReadyNotification({
        enabled: false,
        kind: 'diff',
        context: baseContext,
      }),
    ).toBe(true)

    expect(
      shouldSuppressDiffReadyNotification({
        enabled: true,
        kind: 'diff',
        context: {
          ...baseContext,
          centerTab: 'code',
          codeSubTab: 'diff',
        },
      }),
    ).toBe(true)

    expect(
      shouldSuppressDiffReadyNotification({
        enabled: true,
        kind: 'diff',
        context: {
          ...baseContext,
          centerTab: 'code',
          codeSubTab: 'diff',
          windowFocused: false,
        },
      }),
    ).toBe(false)

    expect(
      shouldSuppressDiffReadyNotification({
        enabled: true,
        kind: 'diff',
        context: {
          ...baseContext,
          agentFlowOpen: true,
        },
      }),
    ).toBe(false)
  })

  it('suppresses ask notifications when focused on chat or agent flow', () => {
    expect(
      shouldSuppressDiffReadyNotification({
        enabled: true,
        kind: 'ask',
        context: {
          ...baseContext,
          rightPanelTab: 'harness',
          agentFlowOpen: true,
        },
      }),
    ).toBe(true)

    expect(
      shouldSuppressDiffReadyNotification({
        enabled: true,
        kind: 'ask',
        context: baseContext,
      }),
    ).toBe(true)

    expect(
      shouldSuppressDiffReadyNotification({
        enabled: true,
        kind: 'ask',
        context: {
          ...baseContext,
          windowFocused: false,
        },
      }),
    ).toBe(false)
  })

  it('filters batch items using completion-time context instead of current UI', () => {
    const items = [
      completion({
        kind: 'diff',
        context: {
          ...baseContext,
          centerTab: 'function-map',
        },
      }),
      completion({
        kind: 'diff',
        context: {
          ...baseContext,
          centerTab: 'code',
          codeSubTab: 'diff',
        },
      }),
      completion({
        kind: 'diff',
        context: {
          ...baseContext,
          centerTab: 'code',
          codeSubTab: 'diff',
          windowFocused: false,
        },
      }),
    ]

    const pending = filterDiffReadyCompletionsForNotification(items, true)
    expect(pending).toHaveLength(2)
    expect(pending.map((item) => item.context.centerTab)).toEqual(['function-map', 'code'])
    expect(pending[1]?.context.windowFocused).toBe(false)
  })

  it('resolves notification channel from focus and center tab', () => {
    expect(
      resolveNotificationChannel({ windowFocused: false, centerTab: 'function-map' }),
    ).toBe('system')

    expect(
      resolveNotificationChannel({ windowFocused: true, centerTab: 'function-map' }),
    ).toBe('map_banner')

    expect(
      resolveNotificationChannel({ windowFocused: true, centerTab: 'code' }),
    ).toBe('center_banner')
  })

  it('keeps system channel when completion happened while unfocused even if live focus returned', () => {
    const items = [
      completion({
        kind: 'diff',
        context: {
          ...baseContext,
          windowFocused: false,
          agentFlowOpen: true,
        },
      }),
    ]

    expect(
      resolveNotificationChannelForCompletions(items, {
        windowFocused: true,
        centerTab: 'function-map',
      }),
    ).toBe('system')
  })

  it('merges single and batch completion messages', () => {
    const single = mergeDiffReadyCompletions(
      [
        completion({
          kind: 'diff',
          runId: 'run_1',
          fileCount: 3,
          summary: 'Add Google login',
        }),
      ],
      'en',
    )
    expect(single.runIds).toEqual(['run_1'])
    expect(single.destination).toBe('diff')
    expect(single.body).toContain('Add Google login')
    expect(single.body).toContain('3')

    const ask = mergeDiffReadyCompletions(
      [
        completion({
          kind: 'ask',
          summary: 'How does auth work?',
        }),
      ],
      'en',
    )
    expect(ask.destination).toBe('ask')
    expect(ask.body).toContain('How does auth work?')

    const batch = mergeDiffReadyCompletions(
      [
        completion({
          kind: 'diff',
          runId: 'run_1',
          fileCount: 2,
          summary: 'Task A',
        }),
        completion({
          kind: 'diff',
          runId: 'run_2',
          fileCount: 3,
          summary: 'Task B',
        }),
      ],
      'en',
    )
    expect(batch.runIds).toEqual(['run_1', 'run_2'])
    expect(batch.body).toContain('2 tasks')
    expect(batch.body).toContain('5 file')
  })

  it('truncates long summaries', () => {
    const long = 'x'.repeat(100)
    expect(truncateDiffReadySummary(long)).toHaveLength(72)
    expect(truncateDiffReadySummary(long).endsWith('…')).toBe(true)
  })
})
