import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const effectHarness = vi.hoisted(() => {
  type Cleanup = () => void
  const cleanups: Cleanup[] = []
  const refs: Array<{ current: unknown }> = []
  let refCursor = 0
  return {
    useEffect(effect: () => void | Cleanup) {
      const cleanup = effect()
      if (cleanup) cleanups.push(cleanup)
    },
    unmount() {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup()
      refs.length = 0
      refCursor = 0
    },
    useRef<T>(initial: T) {
      const index = refCursor++
      const existing = refs[index]
      if (existing) return existing as { current: T }
      const value = { current: initial }
      refs[index] = value
      return value
    },
  }
})

const terminalDoubles = vi.hoisted(() => ({
  createMapSession: vi.fn(async () => undefined),
  disposeMapSession: vi.fn(async () => undefined),
  initIpcListeners: vi.fn(),
  state: {
    mapSessions: {} as Record<string, string>,
  },
}))

vi.mock('react', () => ({
  useEffect: effectHarness.useEffect,
  useRef: effectHarness.useRef,
}))
vi.mock('../../data/clientMode', () => ({ isDesktopApp: () => false }))
vi.mock('../../i18n', () => ({ useI18n: () => ({ ts: (key: string) => key }) }))
vi.mock('../../state/workbenchStore', () => ({
  useWorkbenchStore: (selector: (state: { terminalLines: string[] }) => unknown) =>
    selector({ terminalLines: [] }),
}))
vi.mock('../../state/terminalStore', () => ({
  useTerminalStore: (selector: (state: unknown) => unknown) =>
    selector({
      ...terminalDoubles.state,
      createMapSession: terminalDoubles.createMapSession,
      disposeMapSession: terminalDoubles.disposeMapSession,
      initIpcListeners: terminalDoubles.initIpcListeners,
    }),
}))
vi.mock('../Terminal/useTerminalView', () => ({
  useTerminalView: () => ({
    containerRef: { current: null },
    refit: vi.fn(),
    isNative: false,
  }),
}))

import MapTerminalHost from './MapTerminalHost'

describe('MapTerminalHost session ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    effectHarness.unmount()
    vi.runAllTimers()
    vi.useRealTimers()
    terminalDoubles.createMapSession.mockClear()
    terminalDoubles.disposeMapSession.mockClear()
    terminalDoubles.initIpcListeners.mockClear()
  })

  it('disposes its map PTY session when the host unmounts', async () => {
    MapTerminalHost({
      artifactId: 'terminal_artifact',
      cwd: '/workspace',
      width: 420,
      height: 280,
      focused: false,
    })

    expect(terminalDoubles.createMapSession).toHaveBeenCalledWith('terminal_artifact', {
      cwd: '/workspace',
    })

    effectHarness.unmount()
    vi.runAllTimers()
    await Promise.resolve()
    await Promise.resolve()
    expect(terminalDoubles.disposeMapSession).toHaveBeenCalledOnce()
    expect(terminalDoubles.disposeMapSession).toHaveBeenCalledWith('terminal_artifact')
  })

  it('waits for an in-flight PTY creation before disposing the session', async () => {
    let finishCreation: (() => void) | undefined
    terminalDoubles.createMapSession.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCreation = resolve
        }),
    )

    MapTerminalHost({
      artifactId: 'terminal_artifact',
      cwd: '/workspace',
      width: 420,
      height: 280,
      focused: false,
    })
    effectHarness.unmount()
    vi.runAllTimers()

    expect(terminalDoubles.disposeMapSession).not.toHaveBeenCalled()
    finishCreation?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(terminalDoubles.disposeMapSession).toHaveBeenCalledOnce()
    expect(terminalDoubles.disposeMapSession).toHaveBeenCalledWith('terminal_artifact')
  })
})
