import { describe, expect, it } from 'vitest'
import {
  LAB_CAPTURE_CONSOLE_PREFIX,
  buildLabCaptureInjectionSource,
  parseLabCaptureConsoleMessage,
} from './injectLabCapture'

describe('injectLabCapture', () => {
  it('builds an injectable guest script', () => {
    const source = buildLabCaptureInjectionSource()
    expect(source).toContain('__projectosLabCaptureInstalled')
    expect(source).toContain('unhandledrejection')
    expect(source).toContain('fetch')
  })

  it('parses prefixed console payloads', () => {
    const payload = {
      kind: 'network_failure',
      title: 'HTTP 500 GET /api',
      detail: 'GET /api → 500',
      url: 'http://localhost:5173/api',
      status: 500,
      method: 'GET',
    }
    const parsed = parseLabCaptureConsoleMessage(
      `${LAB_CAPTURE_CONSOLE_PREFIX}${JSON.stringify(payload)}`,
    )
    expect(parsed).toEqual(payload)
  })

  it('ignores unrelated console lines', () => {
    expect(parseLabCaptureConsoleMessage('hello')).toBeNull()
    expect(
      parseLabCaptureConsoleMessage(`${LAB_CAPTURE_CONSOLE_PREFIX}{not-json`),
    ).toBeNull()
  })
})
