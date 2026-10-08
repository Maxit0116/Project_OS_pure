import { contextBridge, ipcRenderer } from 'electron'
import type { AgentRunEvent, AgentTransientTrace } from '../../../contracts/events.js'
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
type RunEventListener = (runId: string, event: AgentRunEvent) => void
type RunTransientTraceListener = (runId: string, trace: AgentTransientTrace) => void
type TerminalDataListener = (terminalId: string, data: string) => void
type TerminalExitListener = (terminalId: string, exitCode: number) => void
type ServicesChangedListener = (ports: ServicePort[]) => void
type LspMessageListener = (message: string) => void
type FocusChangeListener = (focused: boolean) => void
type DiffReadyActivatedListener = (payload: { destination: 'ask' | 'diff'; runIds: string[] }) => void
const runEventListeners = new Set<RunEventListener>()
const runTransientTraceListeners = new Set<RunTransientTraceListener>()
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
}

contextBridge.exposeInMainWorld('projectOS', api)

export type ProjectOSBridge = typeof api
