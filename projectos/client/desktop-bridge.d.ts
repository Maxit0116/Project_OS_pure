import type { AgentRunEvent, AgentTransientTrace } from "../contracts/events.js";
import type { Disposable } from "../contracts/api.js";
import type {
  AgentAnswerResult,
  AgentAskRequest,
} from "../contracts/agent-conversation.js";
import type { CurrentWorkState } from "../contracts/context.js";
import type { RestoreApplyResult } from "../contracts/diff.js";
import type { VerificationRunResult } from "../contracts/exec-command.js";
import type { ServicePort } from "../contracts/service-port.js";
import type { VerificationCommandApprovalStatus } from "../contracts/verification-command-approval.js";
import type { ProjectDescription } from "../contracts/project-description.js";
import type { AppMenuState } from "../contracts/app-menu.js";

export interface ProjectOSBridge {
  platform: string;
  invoke(method: string, ...args: unknown[]): Promise<unknown>;
  askAgent(request: AgentAskRequest): Promise<AgentAnswerResult>;
  getCurrentWork(projectId: string): Promise<CurrentWorkState>;
  getProjectDescription(projectId: string): Promise<ProjectDescription>;
  updateProjectDescription(
    projectId: string,
    conciseDescription: string,
  ): Promise<ProjectDescription>;
  runVerification(runId: string): Promise<VerificationRunResult>;
  getVerificationCommandApproval(projectId: string): Promise<VerificationCommandApprovalStatus>;
  approveVerificationCommands(
    projectId: string,
    commandSetHash: string,
  ): Promise<VerificationCommandApprovalStatus>;
  restoreApplyBackup(projectId: string, backupId: string): Promise<RestoreApplyResult>;
  undoGreenfieldInitialization(projectId: string, runId: string): Promise<RestoreApplyResult>;
  onRunEvent(listener: (runId: string, event: AgentRunEvent) => void): Disposable;
  onRunTransientTrace(
    listener: (runId: string, trace: AgentTransientTrace) => void,
  ): Disposable;
  streamSubscribe(runId: string): Promise<void>;
  streamUnsubscribe(runId: string): Promise<void>;
  consumeFallbackNotice(projectId: string): Promise<string | undefined>;
  shell: {
    pickWorkspaceFolder(): Promise<string | null>;
    cloneRepository(url: string): Promise<string | null>;
    pickImageFile(): Promise<
      | {
          dataUrl: string;
          fileName: string;
          mimeType: "image/jpeg" | "image/png";
          width: number;
          height: number;
        }
      | { error: "invalid_type" | "too_large" | "failed" }
      | null
    >;
    openExternal(url: string): Promise<void>;
  };
  window: {
    isFullScreen(): Promise<boolean>;
    isFocused(): Promise<boolean>;
    setTitle(title: string): Promise<void>;
    onFullScreenChange(listener: (isFullScreen: boolean) => void): Disposable;
    onFocusChange(listener: (focused: boolean) => void): Disposable;
  };
  notify: {
    showDiffReady(payload: {
      title: string
      body: string
      destination: 'ask' | 'diff'
      runIds: string[]
    }): Promise<void>;
    onActivated(listener: (payload: { destination: 'ask' | 'diff'; runIds: string[] }) => void): Disposable;
  };
  terminal: {
    create(cwd: string): Promise<string>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): Promise<void>;
    onData(listener: (terminalId: string, data: string) => void): Disposable;
    onExit(listener: (terminalId: string, exitCode: number) => void): Disposable;
  };
  services: {
    startWatch(): Promise<void>;
    stopWatch(): Promise<void>;
    register(input: { port: number; host?: string; label?: string }): Promise<ServicePort>;
    unregister(id: string): Promise<void>;
    onChanged(listener: (ports: ServicePort[]) => void): Disposable;
  };
  menu: {
    setState(state: AppMenuState): void;
    onCommand(listener: (command: unknown) => void): Disposable;
  };
  lsp: {
    start(workspaceRoot: string): Promise<{ ok: boolean; error?: string }>;
    stop(): Promise<void>;
    send(message: string): void;
    onMessage(listener: (message: string) => void): Disposable;
  };
}

declare global {
  interface Window {
    projectOS?: ProjectOSBridge;
  }
}

export {};
