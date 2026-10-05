import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hookHarness = vi.hoisted(() => {
  type Cleanup = () => void
  type Effect = () => void | Cleanup
  type Cell =
    | { kind: 'ref'; value: { current: unknown } }
    | { kind: 'memo'; deps: readonly unknown[]; value: unknown }
    | { kind: 'effect'; deps: readonly unknown[]; cleanup?: Cleanup }
  type PendingEffect = { index: number; deps: readonly unknown[]; effect: Effect }

  let cells: Cell[] = []
  let cursor = 0
  let pendingEffects: PendingEffect[] = []

  function dependenciesMatch(
    previous: readonly unknown[],
    next: readonly unknown[],
  ): boolean {
    return (
      previous.length === next.length &&
      previous.every((value, index) => Object.is(value, next[index]))
    )
  }

  function useRef<T>(initialValue: T): { current: T } {
    const index = cursor++
    const existing = cells[index]
    if (existing?.kind === 'ref') {
      return existing.value as { current: T }
    }
    const value = { current: initialValue }
    cells[index] = { kind: 'ref', value }
    return value
  }

  function useCallback<T extends (...args: never[]) => unknown>(
    callback: T,
    deps: readonly unknown[],
  ): T {
    const index = cursor++
    const existing = cells[index]
    if (existing?.kind === 'memo' && dependenciesMatch(existing.deps, deps)) {
      return existing.value as T
    }
    cells[index] = { kind: 'memo', deps: [...deps], value: callback }
    return callback
  }

  function useEffect(effect: Effect, deps: readonly unknown[]): void {
    const index = cursor++
    const existing = cells[index]
    if (existing?.kind === 'effect' && dependenciesMatch(existing.deps, deps)) {
      return
    }
    pendingEffects.push({ index, deps: [...deps], effect })
  }

  return {
    beginRender() {
      cursor = 0
      pendingEffects = []
    },
    flushEffects() {
      for (const pending of pendingEffects) {
        const existing = cells[pending.index]
        if (existing?.kind === 'effect') existing.cleanup?.()
        const cleanup = pending.effect() || undefined
        cells[pending.index] = {
          kind: 'effect',
          deps: pending.deps,
          ...(cleanup ? { cleanup } : {}),
        }
      }
      pendingEffects = []
    },
    reset() {
      for (const cell of cells) {
        if (cell?.kind === 'effect') cell.cleanup?.()
      }
      cells = []
      cursor = 0
      pendingEffects = []
    },
    unmount() {
      for (const cell of cells) {
        if (cell?.kind === 'effect') cell.cleanup?.()
      }
      cells = []
      cursor = 0
      pendingEffects = []
    },
    useRef,
    useCallback,
    useEffect,
  }
})

const terminalDoubles = vi.hoisted(() => {
  class MockTerminal {
    options: Record<string, unknown>
    disposeCalls = 0
    focusCalls = 0
    writes: string[] = []
    inputDisposeCalls = 0

    constructor(options: Record<string, unknown>) {
      this.options = { ...options }
      terminalDoubles.instances.push(this)
    }

    loadAddon(): void {}
    open(): void {}
    write(value: string): void {
      this.writes.push(value)
    }
    writeln(value: string): void {
      this.writes.push(`${value}\n`)
    }
    focus(): void {
      this.focusCalls += 1
    }
    dispose(): void {
      this.disposeCalls += 1
    }
    onData(): { dispose: () => void } {
      return {
        dispose: () => {
          this.inputDisposeCalls += 1
        },
      }
    }
  }

  class MockFitAddon {
    fitCalls = 0
    fit(): void {
      this.fitCalls += 1
    }
    proposeDimensions(): { cols: number; rows: number } {
      return { cols: 80, rows: 24 }
    }
  }

  return {
    MockTerminal,
    MockFitAddon,
    instances: [] as MockTerminal[],
    storeState: {
      tabs: {
        terminal_tab: {
          ptyId: 'pty_1',
          cwd: '/workspace',
        },
      },
    },
  }
})

vi.mock('react', () => ({
  useEffect: hookHarness.useEffect,
  useRef: hookHarness.useRef,
  useCallback: hookHarness.useCallback,
}))

vi.mock('@xterm/xterm', () => ({ Terminal: terminalDoubles.MockTerminal }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: terminalDoubles.MockFitAddon }))
vi.mock('../../data/clientMode', () => ({ isDesktopApp: () => true }))
vi.mock('../../i18n', () => ({
  useI18n: () => ({ ts: (path: string) => path }),
}))
vi.mock('../../state/terminalStore', () => ({
  getTabOutputBuffer: () => 'prior scrollback',
  useTerminalStore: (selector: (state: typeof terminalDoubles.storeState) => unknown) =>
    selector(terminalDoubles.storeState),
}))

import { useTerminalView } from './useTerminalView'

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  disconnectCalls = 0

  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnectCalls += 1
  }
}

function renderTerminal(mounted = true) {
  hookHarness.beginRender()
  const view = useTerminalView({
    tabId: 'terminal_tab',
    mounted,
    focused: true,
  })
  if (!view.containerRef.current) {
    ;(view.containerRef as { current: HTMLDivElement | null }).current = {
      clientWidth: 800,
      clientHeight: 600,
    } as HTMLDivElement
  }
  hookHarness.flushEffects()
  return view
}

describe('useTerminalView lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    terminalDoubles.instances.length = 0
    MockResizeObserver.instances.length = 0
    hookHarness.reset()

    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.stubGlobal('window', {
      projectOS: {
        terminal: {
          resize: vi.fn(),
          write: vi.fn(),
          onData: vi.fn(() => ({ dispose: vi.fn() })),
        },
      },
    })
  })

  afterEach(() => {
    hookHarness.reset()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('preserves the xterm instance and scrollback across rerenders and resize', () => {
    const firstView = renderTerminal()
    const terminal = terminalDoubles.instances[0]
    const resizeObserver = MockResizeObserver.instances[0]
    if (!terminal || !resizeObserver) throw new Error('Terminal was not mounted')

    expect(terminal.writes).toContain('prior scrollback')

    const container = firstView.containerRef.current
    if (!container) throw new Error('Terminal container was not mounted')
    Object.defineProperty(container, 'clientWidth', { value: 900, configurable: true })
    resizeObserver.callback([], resizeObserver as unknown as ResizeObserver)
    vi.advanceTimersByTime(80)

    const secondView = renderTerminal()

    expect(secondView.containerRef).toBe(firstView.containerRef)
    expect(terminalDoubles.instances).toHaveLength(1)
    expect(terminalDoubles.instances[0]).toBe(terminal)
    expect(terminal.disposeCalls).toBe(0)
    expect(resizeObserver.disconnectCalls).toBe(0)

    hookHarness.unmount()
    expect(terminal.disposeCalls).toBe(1)
    expect(resizeObserver.disconnectCalls).toBe(1)
  })

  it('disposes the xterm instance when its tab is actually closed', () => {
    renderTerminal()
    const terminal = terminalDoubles.instances[0]
    if (!terminal) throw new Error('Terminal was not mounted')

    renderTerminal(false)

    expect(terminalDoubles.instances).toHaveLength(1)
    expect(terminal.disposeCalls).toBe(1)
  })
})
