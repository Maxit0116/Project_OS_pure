import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  app: {
    isPackaged: false,
  },
  lastWindow: undefined as FakeBrowserWindow | undefined,
}))

const trafficLights = vi.hoisted(() => ({
  applyMacTrafficLightPosition: vi.fn(),
  macTrafficLightPosition: vi.fn(() => ({ x: 16, y: 16 })),
}))

vi.mock('electron', () => ({
  app: electron.app,
  BrowserWindow: vi.fn((options: Electron.BrowserWindowConstructorOptions) => {
    const win = new FakeBrowserWindow(options)
    electron.lastWindow = win
    return win
  }),
  shell: {
    openExternal: vi.fn(),
  },
}))

vi.mock('./registerProjectOsIpc.js', () => ({
  disposeStreamSubscriptionsForWebContents: vi.fn(),
}))
vi.mock('./terminal/registerTerminalIpc.js', () => ({
  disposeTerminalForWebContents: vi.fn(),
}))
vi.mock('./macTitleBarChrome.js', () => trafficLights)
vi.mock('./browser/browserWebviewPolicy.js', () => ({
  installBrowserWebviewPolicy: vi.fn(),
}))
vi.mock('./externalUrlPolicy.js', () => ({
  openAllowedExternalUrlInBackground: vi.fn(),
}))
vi.mock('./mainWindowSecurity.js', () => ({
  installMainWindowNavigationGuard: vi.fn(),
  installMainWindowSessionSecurity: vi.fn(),
}))
vi.mock('./rendererResourceLifecycle.js', () => ({
  installRendererResourceCleanup: vi.fn(),
}))
vi.mock('./ipcSenderTrust.js', () => ({
  installTrustedHostRendererAuthority: vi.fn(() => vi.fn()),
}))

import { createMainWindow } from './createWindow.js'

describe('createMainWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    electron.app.isPackaged = false
    electron.lastWindow = undefined
    process.env['ELECTRON_RENDERER_URL'] = 'http://127.0.0.1:5173/'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reveals the dev window after load if ready-to-show never fires', () => {
    const win = createMainWindow() as unknown as FakeBrowserWindow

    expect(win.show).not.toHaveBeenCalled()

    win.webContents.emit('did-finish-load')
    win.emit('ready-to-show')

    expect(trafficLights.applyMacTrafficLightPosition).toHaveBeenCalledOnce()
    expect(win.show).toHaveBeenCalledOnce()
  })

  it('reveals the dev window after a bounded startup fallback if load events never fire', () => {
    const win = createMainWindow() as unknown as FakeBrowserWindow

    vi.advanceTimersByTime(1_999)
    expect(win.show).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    win.emit('ready-to-show')

    expect(trafficLights.applyMacTrafficLightPosition).toHaveBeenCalledOnce()
    expect(win.show).toHaveBeenCalledOnce()
  })
})

class FakeBrowserWindow extends EventEmitter {
  readonly webContents: EventEmitter & {
    id: number;
    session: object;
    send: ReturnType<typeof vi.fn>;
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
  }
  readonly loadURL = vi.fn()
  readonly loadFile = vi.fn()
  readonly show = vi.fn(() => {
    this.visible = true
  })
  private visible = false
  private destroyed = false

  constructor(readonly options: Electron.BrowserWindowConstructorOptions) {
    super()
    this.webContents = Object.assign(new EventEmitter(), {
      id: 1,
      session: {},
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    })
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  isFullScreen(): boolean {
    return false
  }

  isVisible(): boolean {
    return this.visible
  }
}
