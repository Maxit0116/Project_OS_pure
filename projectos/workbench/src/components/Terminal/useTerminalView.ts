import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { isDesktopApp } from '../../data/clientMode'
import { AUTH_ERROR_RAW } from '../../data/demoInputs'
import { useI18n } from '../../i18n'
import { getTabOutputBuffer, useTerminalStore } from '../../state/terminalStore'

const AUTH_ERROR_PATTERN = /invalid_client|OAuth provider callback rejected/i
const RESIZE_DEBOUNCE_MS = 80

type TerminalDimensions = { cols: number; rows: number }

function validDimensions(dims: TerminalDimensions | undefined): dims is TerminalDimensions {
  return !!dims && dims.cols > 0 && dims.rows > 0
}

function dimensionsChanged(
  prev: TerminalDimensions | null,
  next: TerminalDimensions,
): boolean {
  return !prev || prev.cols !== next.cols || prev.rows !== next.rows
}

interface UseTerminalViewOptions {
  tabId: string
  mounted: boolean
  focused: boolean
  onAuthError?: (raw: string) => void
}

export function useTerminalView({ tabId, mounted, focused, onAuthError }: UseTerminalViewOptions) {
  const { ts } = useI18n()
  const ptyId = useTerminalStore((s) => s.tabs[tabId]?.ptyId ?? null)
  const cwd = useTerminalStore((s) => s.tabs[tabId]?.cwd ?? '')
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastDimsRef = useRef<TerminalDimensions | null>(null)
  const lastContainerSizeRef = useRef<{ width: number; height: number } | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outputBufferRef = useRef('')
  const authTriggeredRef = useRef(false)
  const onAuthErrorRef = useRef(onAuthError)
  const focusedRef = useRef(focused)
  const ptyIdRef = useRef(ptyId)
  const tsRef = useRef(ts)

  useEffect(() => {
    tsRef.current = ts
  }, [ts])

  useEffect(() => {
    ptyIdRef.current = ptyId
  }, [ptyId])

  useEffect(() => {
    onAuthErrorRef.current = onAuthError
  }, [onAuthError])

  useEffect(() => {
    focusedRef.current = focused
    if (focused && terminalRef.current) {
      terminalRef.current.focus()
    }
  }, [focused])

  const checkAuthError = useCallback((chunk: string) => {
    const handler = onAuthErrorRef.current
    if (!handler || authTriggeredRef.current) return
    outputBufferRef.current = (outputBufferRef.current + chunk).slice(-4000)
    if (AUTH_ERROR_PATTERN.test(outputBufferRef.current) || outputBufferRef.current.includes(AUTH_ERROR_RAW)) {
      authTriggeredRef.current = true
      handler(outputBufferRef.current)
    }
  }, [])

  const resizePty = useCallback((fitAddon: FitAddon, targetPtyId: string | null) => {
    const bridge = window.projectOS
    if (!targetPtyId || !bridge?.terminal) return

    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight
    if (width <= 0 || height <= 0) return

    const lastContainer = lastContainerSizeRef.current
    if (lastContainer && lastContainer.width === width && lastContainer.height === height) {
      return
    }
    lastContainerSizeRef.current = { width, height }

    fitAddon.fit()
    const dims = fitAddon.proposeDimensions()
    if (!validDimensions(dims) || !dimensionsChanged(lastDimsRef.current, dims)) {
      return
    }

    lastDimsRef.current = dims
    bridge.terminal.resize(targetPtyId, dims.cols, dims.rows)
  }, [])

  useEffect(() => {
    if (!mounted || !isDesktopApp() || !containerRef.current || !tabId) {
      return
    }

    const bridge = window.projectOS
    if (!bridge?.terminal) return

    authTriggeredRef.current = false
    outputBufferRef.current = ''
    lastDimsRef.current = null
    lastContainerSizeRef.current = null

    const terminal = new Terminal({
      cursorBlink: true,
      disableStdin: !focused,
      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
      fontSize: 12,
      theme: {
        background: '#0d111700',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    if (!cwd) {
      terminal.writeln(tsRef.current('terminal.noWorkspace'))
      return () => {
        if (resizeTimerRef.current) {
          clearTimeout(resizeTimerRef.current)
          resizeTimerRef.current = null
        }
        terminal.dispose()
        terminalRef.current = null
        fitAddonRef.current = null
        lastDimsRef.current = null
        lastContainerSizeRef.current = null
      }
    }

    const outputBuffer = getTabOutputBuffer(tabId)
    if (outputBuffer) {
      terminal.write(outputBuffer)
    }

    let dataDisposable: { dispose(): void } | null = null
    let inputDisposable: { dispose(): void } | null = null

    if (ptyId) {
      dataDisposable = bridge.terminal.onData((incomingPtyId, data) => {
        if (incomingPtyId !== ptyIdRef.current) return
        terminal.write(data)
        checkAuthError(data)
      })

      inputDisposable = terminal.onData((data) => {
        const activePtyId = ptyIdRef.current
        if (!focusedRef.current || !activePtyId) return
        bridge.terminal.write(activePtyId, data)
      })

      resizePty(fitAddon, ptyId)
    }

    if (focused) {
      terminal.focus()
    }

    const scheduleResize = () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = setTimeout(() => {
        resizeTimerRef.current = null
        resizePty(fitAddon, ptyIdRef.current)
      }, RESIZE_DEBOUNCE_MS)
    }

    const resizeObserver = new ResizeObserver(scheduleResize)
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
      dataDisposable?.dispose()
      inputDisposable?.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      lastDimsRef.current = null
      lastContainerSizeRef.current = null
    }
  }, [mounted, tabId, ptyId, cwd, checkAuthError, resizePty])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.options.disableStdin = !focused
    if (focused) {
      terminal.focus()
    }
  }, [focused])

  const refit = useCallback(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon || !mounted) return
    resizePty(fitAddon, ptyIdRef.current)
  }, [mounted, resizePty])

  return { containerRef, refit, isNative: isDesktopApp() }
}
