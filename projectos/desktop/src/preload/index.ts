import { contextBridge, ipcRenderer } from 'electron'
import type { AgentRunEvent, AgentTransientTrace } from '../../../contracts/events.js'
import type { StructureScanProgressEvent } from '../../../contracts/structure-scan-progress.js'
import type { Disposable } from '../../../contracts/api.js'
import type {
  AgentAnswerResult,
  AgentAskRequest,
} from '../../../contracts/agent-conversation.js'
import type { CurrentWorkState } from '../../../contracts/context.js'
import type { RestoreApplyResult } from '../../../contracts/diff.js'
import type { VerificationRunResult } from '../../../contracts/exec-command.js'
import type { ServicePort } from '../../../contracts/service-port.js'
import type { VerificationCommandApprovalStatus } from '../../../contracts/verification-command-approval.js'
import type { ProjectDescription } from '../../../contracts/project-description.js'
import type { AppMenuState } from '../../../contracts/app-menu.js'
type RunEventListener = (runId: string, event: AgentRunEvent) => void
type RunTransientTraceListener = (runId: string, trace: AgentTransientTrace) => void
type StructureScanEventListener = (
  projectId: string,
  event: StructureScanProgressEvent,
) => void
type TerminalDataListener = (terminalId: string, data: string) => void
type TerminalExitListener = (terminalId: string, exitCode: number) => void
type ServicesChangedListener = (ports: ServicePort[]) => void
type LspMessageListener = (message: string) => void
type FocusChangeListener = (focused: boolean) => void
type DiffReadyActivatedListener = (payload: { destination: 'ask' | 'diff'; runIds: string[] }) => void
const runEventListeners = new Set<RunEventListener>()
const runTransientTraceListeners = new Set<RunTransientTraceListener>()
const structureScanEventListeners = new Set<StructureScanEventListener>()
const terminalDataListeners = new Set<TerminalDataListener>()
const terminalExitListeners = new Set<TerminalExitListener>()
const servicesChangedListeners = new Set<ServicesChangedListener>()
const lspMessageListeners = new Set<LspMessageListener>()
const focusChangeListeners = new Set<FocusChangeListener>()
const diffReadyActivatedListeners = new Set<DiffReadyActivatedListener>()
ipcRenderer.on('projectos:runEvent', (_event, runId: string, agentEvent: AgentRunEvent) => {
  for (const listener of runEventListeners) {
    listener(runId, agentEvent)
  }
})

ipcRenderer.on('projectos:runTransientTrace', (_event, runId: string, trace: AgentTransientTrace) => {
  for (const listener of runTransientTraceListeners) {
    listener(runId, trace)
  }
})

ipcRenderer.on(
  'projectos:structureScanEvent',
  (_event, projectId: string, scanEvent: StructureScanProgressEvent) => {
    for (const listener of structureScanEventListeners) {
      listener(projectId, scanEvent)
    }
  },
)

ipcRenderer.on('terminal:data', (_event, terminalId: string, data: string) => {
  for (const listener of terminalDataListeners) {
    listener(terminalId, data)
  }
})

ipcRenderer.on('terminal:exit', (_event, terminalId: string, exitCode: number) => {
  for (const listener of terminalExitListeners) {
    listener(terminalId, exitCode)
  }
})

ipcRenderer.on('services:changed', (_event, ports: ServicePort[]) => {
  for (const listener of servicesChangedListeners) {
    listener(ports)
  }
})

ipcRenderer.on('lsp:message', (_event, message: string) => {
  for (const listener of lspMessageListeners) {
    listener(message)
  }
})

ipcRenderer.on('window:focusChange', (_event, focused: boolean) => {
  for (const listener of focusChangeListeners) {
    listener(focused)
  }
})

ipcRenderer.on('notify:diffReadyActivated', (_event, payload: { destination: 'ask' | 'diff'; runIds: string[] }) => {
  for (const listener of diffReadyActivatedListeners) {
    listener(payload)
  }
})

const api = {
  platform: process.platform,
  invoke(method: string, ...args: unknown[]): Promise<unknown> {
    return ipcRenderer.invoke(`projectos:${method}`, ...args)
  },
  askAgent(request: AgentAskRequest): Promise<AgentAnswerResult> {
    return ipcRenderer.invoke('projectos:askAgent', request)
  },
  getCurrentWork(projectId: string): Promise<CurrentWorkState> {
    return ipcRenderer.invoke('projectos:getCurrentWork', projectId)
  },
  getProjectDescription(projectId: string): Promise<ProjectDescription> {
    return ipcRenderer.invoke('projectos:getProjectDescription', projectId)
  },
  updateProjectDescription(
    projectId: string,
    conciseDescription: string,
  ): Promise<ProjectDescription> {
    return ipcRenderer.invoke('projectos:updateProjectDescription', projectId, conciseDescription)
  },
  runVerification(runId: string): Promise<VerificationRunResult> {
    return ipcRenderer.invoke('projectos:runVerification', runId)
  },
  getVerificationCommandApproval(projectId: string): Promise<VerificationCommandApprovalStatus> {
    return ipcRenderer.invoke('projectos:getVerificationCommandApproval', projectId)
  },
  approveVerificationCommands(
    projectId: string,
    commandSetHash: string,
  ): Promise<VerificationCommandApprovalStatus> {
    return ipcRenderer.invoke('projectos:approveVerificationCommands', projectId, commandSetHash)
  },
  restoreApplyBackup(projectId: string, backupId: string): Promise<RestoreApplyResult> {
    return ipcRenderer.invoke('projectos:restoreApplyBackup', projectId, backupId)
  },
  undoGreenfieldInitialization(projectId: string, runId: string): Promise<RestoreApplyResult> {
    return ipcRenderer.invoke('projectos:undoGreenfieldInitialization', projectId, runId)
  },
  onRunEvent(listener: RunEventListener): Disposable {
    runEventListeners.add(listener)
    return {
      dispose() {
        runEventListeners.delete(listener)
      },
    }
  },
  onRunTransientTrace(listener: RunTransientTraceListener): Disposable {
    runTransientTraceListeners.add(listener)
    return {
      dispose() {
        runTransientTraceListeners.delete(listener)
      },
    }
  },
  streamSubscribe(runId: string): Promise<void> {
    return ipcRenderer.invoke('projectos:streamSubscribe', runId).then(() => undefined)
  },
  streamUnsubscribe(runId: string): Promise<void> {
    return ipcRenderer.invoke('projectos:streamUnsubscribe', runId).then(() => undefined)
  },
  onStructureScanEvent(listener: StructureScanEventListener): Disposable {
    structureScanEventListeners.add(listener)
    return {
      dispose() {
        structureScanEventListeners.delete(listener)
      },
    }
  },
  structureScanSubscribe(projectId: string): Promise<void> {
    return ipcRenderer
      .invoke('projectos:structureScanSubscribe', projectId)
      .then(() => undefined)
  },
  structureScanUnsubscribe(projectId: string): Promise<void> {
    return ipcRenderer
      .invoke('projectos:structureScanUnsubscribe', projectId)
      .then(() => undefined)
  },
  consumeFallbackNotice(projectId: string): Promise<string | undefined> {
    return ipcRenderer.invoke('projectos:consumeFallbackNotice', projectId)
  },
  shell: {
    pickWorkspaceFolder(): Promise<string | null> {
      return ipcRenderer.invoke('shell:pickWorkspaceFolder')
    },
    cloneRepository(url: string): Promise<string | null> {
      return ipcRenderer.invoke('shell:cloneRepository', url)
    },
    pickImageFile(): Promise<
      | {
          dataUrl: string
          fileName: string
          mimeType: 'image/jpeg' | 'image/png'
          width: number
          height: number
        }
      | { error: 'invalid_type' | 'too_large' | 'failed' }
      | null
    > {
      return ipcRenderer.invoke('shell:pickImageFile')
    },
    openExternal(url: string): Promise<void> {
      return ipcRenderer.invoke('shell:openExternal', url)
    },
  },
  window: {
    isFullScreen(): Promise<boolean> {
      return ipcRenderer.invoke('window:isFullScreen')
    },
    isFocused(): Promise<boolean> {
      return ipcRenderer.invoke('window:isFocused')
    },
    setTitle(title: string): Promise<void> {
      return ipcRenderer.invoke('window:setTitle', title).then(() => undefined)
    },
    initialWorkspace(): Promise<string | null> {
      return ipcRenderer.invoke('window:initialWorkspace')
    },
    openWorkspaceInNewWindow(path: string): Promise<void> {
      return ipcRenderer.invoke('window:openWorkspaceInNewWindow', path).then(() => undefined)
    },
    onFullScreenChange(listener: (isFullScreen: boolean) => void): Disposable {
      const handler = (_event: unknown, isFullScreen: boolean) => {
        listener(isFullScreen)
      }
      ipcRenderer.on('window:fullScreenChange', handler)
      return {
        dispose() {
          ipcRenderer.off('window:fullScreenChange', handler)
        },
      }
    },
    onFocusChange(listener: FocusChangeListener): Disposable {
      focusChangeListeners.add(listener)
      return {
        dispose() {
          focusChangeListeners.delete(listener)
        },
      }
    },
  },
  notify: {
    showDiffReady(payload: {
      title: string
      body: string
      destination: 'ask' | 'diff'
      runIds: string[]
    }): Promise<void> {
      return ipcRenderer.invoke('notify:showDiffReady', payload).then(() => undefined)
    },
    onActivated(listener: DiffReadyActivatedListener): Disposable {
      diffReadyActivatedListeners.add(listener)
      return {
        dispose() {
          diffReadyActivatedListeners.delete(listener)
        },
      }
    },
  },
  terminal: {
    create(cwd: string): Promise<string> {
      return ipcRenderer.invoke('terminal:create', cwd)
    },
    write(id: string, data: string): void {
      ipcRenderer.send('terminal:write', id, data)
    },
    resize(id: string, cols: number, rows: number): void {
      ipcRenderer.send('terminal:resize', id, cols, rows)
    },
    kill(id: string): Promise<void> {
      return ipcRenderer.invoke('terminal:kill', id)
    },
    onData(listener: TerminalDataListener): Disposable {
      terminalDataListeners.add(listener)
      return {
        dispose() {
          terminalDataListeners.delete(listener)
        },
      }
    },
    onExit(listener: TerminalExitListener): Disposable {
      terminalExitListeners.add(listener)
      return {
        dispose() {
          terminalExitListeners.delete(listener)
        },
      }
    },
  },
  services: {
    startWatch(): Promise<void> {
      return ipcRenderer.invoke('services:startWatch').then(() => undefined)
    },
    stopWatch(): Promise<void> {
      return ipcRenderer.invoke('services:stopWatch').then(() => undefined)
    },
    register(input: { port: number; host?: string; label?: string }): Promise<ServicePort> {
      return ipcRenderer.invoke('services:register', input)
    },
    unregister(id: string): Promise<void> {
      return ipcRenderer.invoke('services:unregister', id).then(() => undefined)
    },
    onChanged(listener: ServicesChangedListener): Disposable {
      servicesChangedListeners.add(listener)
      return {
        dispose() {
          servicesChangedListeners.delete(listener)
        },
      }
    },
  },
  menu: {
    setState(state: AppMenuState): void {
      ipcRenderer.send('menu:setState', state)
    },
    onCommand(listener: (command: unknown) => void): Disposable {
      const handler = (_event: unknown, command: unknown) => {
        listener(command)
      }
      ipcRenderer.on('menu:command', handler)
      return {
        dispose() {
          ipcRenderer.off('menu:command', handler)
        },
      }
    },
  },
  lsp: {
    start(workspaceRoot: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke('lsp:start', workspaceRoot)
    },
    stop(): Promise<void> {
      return ipcRenderer.invoke('lsp:stop').then(() => undefined)
    },
    send(message: string): void {
      ipcRenderer.send('lsp:send', message)
    },
    onMessage(listener: LspMessageListener): Disposable {
      lspMessageListeners.add(listener)
      return {
        dispose() {
          lspMessageListeners.delete(listener)
        },
      }
    },
  },
  spatialPin: {
    beginCapture(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('spatial-pin:beginCapture')
    },
    hideOverlay(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('spatial-pin:hideOverlay')
    },
    /** Main Escape (showInactive): solidify then hideOverlay. */
    onRequestHide(listener: () => void): Disposable {
      const handler = () => {
        listener()
      }
      ipcRenderer.on('spatial-pin:requestHide', handler)
      return {
        dispose() {
          ipcRenderer.off('spatial-pin:requestHide', handler)
        },
      }
    },
    closeOverlay(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('spatial-pin:closeOverlay')
    },
    getContext(): Promise<{
      projectId: string | null
      workspacePath: string | null
      candidates: Array<{
        projectId: string
        workspacePath: string
        displayName: string
        source: string
      }>
      location: unknown
      webEnhanceAvailable: boolean
      bridge: {
        connected: boolean
        port: number | null
        token: string | null
        bridgeFilePath: string | null
        lastUrl: string | null
        lastProjectId: string | null
      }
    }> {
      return ipcRenderer.invoke('spatial-pin:getContext')
    },
    setPreferredProject(projectId: string | null): Promise<{
      projectId: string | null
      workspacePath: string | null
      candidates: Array<{
        projectId: string
        workspacePath: string
        displayName: string
        source: string
      }>
      location: unknown
      webEnhanceAvailable: boolean
    }> {
      return ipcRenderer.invoke('spatial-pin:setPreferredProject', projectId)
    },
    getBridgeState(): Promise<{
      connected: boolean
      port: number | null
      token: string | null
      bridgeFilePath: string | null
      lastUrl: string | null
      lastProjectId: string | null
    }> {
      return ipcRenderer.invoke('spatial-pin:getBridgeState')
    },
    reportBrowserLocation(payload: unknown): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke('spatial-pin:reportBrowserLocation', payload)
    },
    captureSelection(rect: {
      x: number
      y: number
      width: number
      height: number
    }): Promise<{
      pngBase64: string | null
      host: {
        appName?: string
        bundleId?: string
        windowTitle?: string
        deviceKind?: string
        inferredPath?: string
        textHint?: string
      }
      error?: string
    }> {
      return ipcRenderer.invoke('spatial-pin:captureSelection', rect)
    },
    /** First paint / React mount — main re-emits beginCapture if it was missed. */
    notifyOverlayMounted(): void {
      ipcRenderer.send('spatial-pin:overlayMounted')
    },
    /** Signal main that beginCapture UI has been painted (opacity handshake). */
    notifyOverlayReady(): void {
      ipcRenderer.send('spatial-pin:overlayReady')
    },
    /** Overlay Esc flush finished — main broadcasts to Workbench to refresh gallery. */
    notifySessionSolidified(sessionId: string): void {
      ipcRenderer.send('spatial-pin:sessionSolidified', { sessionId })
    },
    onSessionSolidified(
      listener: (payload: { sessionId: string | null }) => void,
    ): Disposable {
      const handler = (
        _event: unknown,
        payload: { sessionId?: string | null },
      ) => {
        listener({ sessionId: payload?.sessionId ?? null })
      }
      ipcRenderer.on('spatial-pin:sessionSolidified', handler)
      return {
        dispose() {
          ipcRenderer.off('spatial-pin:sessionSolidified', handler)
        },
      }
    },
    onBeginCapture(
      listener: (payload: {
        displayBounds: { x: number; y: number; width: number; height: number }
      }) => void,
    ): Disposable {
      const handler = (
        _event: unknown,
        payload: {
          displayBounds: { x: number; y: number; width: number; height: number }
        },
      ) => {
        listener(payload)
        window.dispatchEvent(
          new CustomEvent('spatial-pin:beginCapture', { detail: payload }),
        )
      }
      ipcRenderer.on('spatial-pin:beginCapture', handler)
      return {
        dispose() {
          ipcRenderer.off('spatial-pin:beginCapture', handler)
        },
      }
    },
    onLocation(listener: (payload: unknown) => void): Disposable {
      const handler = (_event: unknown, payload: unknown) => {
        listener(payload)
        window.dispatchEvent(
          new CustomEvent('spatial-pin:location', { detail: payload }),
        )
      }
      ipcRenderer.on('spatial-pin:location', handler)
      return {
        dispose() {
          ipcRenderer.off('spatial-pin:location', handler)
        },
      }
    },
    onBridgeState(listener: (payload: unknown) => void): Disposable {
      const handler = (_event: unknown, payload: unknown) => listener(payload)
      ipcRenderer.on('spatial-pin:bridgeState', handler)
      return {
        dispose() {
          ipcRenderer.off('spatial-pin:bridgeState', handler)
        },
      }
    },
  },
}

contextBridge.exposeInMainWorld('projectOS', api)

export type ProjectOSBridge = typeof api
