import { describe, expect, it } from 'vitest'
import {
  formatElapsed,
  historyRunStatus,
  laneElapsedMs,
  spanDurationLabel,
} from './poolTiming'

describe('poolTiming', () => {
  it('formats elapsed durations', () => {
    expect(formatElapsed(420)).toBe('420ms')
    expect(formatElapsed(4200)).toBe('4.2s')
    expect(formatElapsed(18400)).toBe('18s')
    expect(formatElapsed(125000)).toBe('2m 5s')
  })

  it('labels span durations and running state', () => {
    expect(
      spanDurationLabel({ startMs: 0, endMs: 4200 }, 5000),
    ).toBe('4.2s')
    expect(
      spanDurationLabel({ startMs: 0, endMs: undefined }, 5000, 'live'),
    ).toBe('live')
  })

  it('computes lane elapsed from growing span or origin', () => {
    expect(
      laneElapsedMs({
        originMs: 1000,
        nowMs: 6000,
        spans: [{ startMs: 1000, endMs: undefined }],
        live: true,
      }),
    ).toBe(4000)
    expect(
      laneElapsedMs({
        originMs: 1000,
        nowMs: 6000,
        spans: [{ startMs: 0, endMs: 2000 }],
        live: false,
      }),
    ).toBe(2000)
  })

  it('maps history run status from acceptance and spans', () => {
    expect(historyRunStatus({ acceptance: 'accepted' })).toBe('completed')
    expect(
      historyRunStatus({
        spans: [{ status: 'error', endMs: 1 }],
      }),
    ).toBe('failed')
    expect(
      historyRunStatus({
        spans: [{ status: 'running', endMs: undefined }],
      }),
    ).toBe('running')
    expect(
      historyRunStatus({
        spans: [{ status: 'complete', endMs: 10 }],
      }),
    ).toBe('completed')
    expect(historyRunStatus({})).toBe('pending')
  })
})
