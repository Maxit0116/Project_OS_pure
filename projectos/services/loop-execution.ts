import type { AgentRunStatus } from "../contracts/agent-run.js";

export const LOOP_FILES_NOT_ATTACHED = "文件未挂接";
export const LOOP_VERIFICATION_NOT_RUN = "验证未运行";

export interface LoopFeatureNode {
  id: string;
  children?: string[];
  linkedFiles: Array<{ path: string }>;
}

export interface LoopLeafBinding {
  featureNodeId: string;
  filePath: string;
}

export interface LoopAgentRunView {
  runId: string;
  status: AgentRunStatus;
  applySucceeded: boolean;
  /** Optional unified diff from the implement apply (DI/local_tools evidence). */
  unifiedDiff?: string;
}

export interface LoopEvidenceView {
  id: string;
  runId: string;
  status: "passed" | "failed" | "not_run";
  /** Command line actually executed for this evidence (when known). */
  command?: string;
  /** Process exit code from the verification command (null = not spawned). */
  exitCode?: number | null;
}

export interface LoopAgentRunRequest {
  specNodeId: string;
  role: "implement" | "fix";
  featureNodeId: string;
  filePath: string;
  /** Task text only. It must not be parsed for write paths. */
  goal: string;
  /** Optional DevPlan task id for tracing. */
  taskId?: string;
  agentRole?: "planner" | "coder" | "reviewer" | string;
  /** Workforce agent binding from the Loop Spec node. */
  agentDefinitionId?: string | null;
}

export interface LoopGithubOperationRequest {
  operation: string;
  payload: Record<string, unknown>;
}

export interface LoopGithubOperationResult {
  ok: boolean;
  url?: string;
  number?: number;
  message?: string;
  refs?: Record<string, string>;
  simulated?: boolean;
  /** When true, runtime keeps the node open until settle completes the op. */
  deferred?: boolean;
}

export interface LoopTerminalCommandRequest {
  command: string;
  args: string[];
  timeoutMs: number;
  cwd?: string;
  /** Human already approved this Action node. */
  approved: boolean;
}

export interface LoopTerminalCommandResult {
  ok: boolean;
  exitCode: number | null;
  timedOut?: boolean;
  policyDenied?: boolean;
  blocked?: boolean;
  stdout?: string;
  stderr?: string;
  message: string;
}

/**
 * Leaf write scope comes from the functional graph.
 * A writable leaf has no children and exactly one linked file.
 * Zero or several candidates means nothing is attached.
 */
export function resolveLoopLeafWriteScope(
  nodes: LoopFeatureNode[],
  featureNodeId?: string,
): LoopLeafBinding | null {
  const leaves = nodes.filter((node) =>
    (node.children?.length ?? 0) === 0 &&
    node.linkedFiles.length === 1 &&
    node.linkedFiles[0]!.path.trim().length > 0,
  );
  const chosen = featureNodeId
    ? leaves.find((node) => node.id === featureNodeId)
    : leaves.length === 1
      ? leaves[0]
      : undefined;
  if (!chosen) return null;
  return {
    featureNodeId: chosen.id,
    filePath: chosen.linkedFiles[0]!.path,
  };
}

export interface LoopExecutionHooks {
  leaf: LoopLeafBinding | null;
  readRun: (runId: string) => LoopAgentRunView | null;
  readEvidence: (runId: string) => LoopEvidenceView | null;
  startAgentRun: (input: LoopAgentRunRequest) => LoopAgentRunView;
  /**
   * Kick configured verification/tests for an existing AgentRun (read-only).
   * Must not start a writable fix/change agent — repairs use explicit repair nodes.
   */
  requestVerification?: (runId: string) => void;
  /** Optional GitHub bridge (sync). May return `deferred: true` for async settle. */
  executeGithubOperation?: (
    input: LoopGithubOperationRequest,
  ) => LoopGithubOperationResult;
  /**
   * Optional SaaS connector bridge. When present and returning deferred,
   * runtime queues pendingConnectorOp for LocalApi settle (adapter→transport).
   */
  executeConnectorOperation?: (input: {
    vendorId: string;
    capabilityId: string;
    payload: Record<string, unknown>;
    credentialRefId?: string;
    nodeId: string;
  }) => {
    ok: boolean;
    deferred?: boolean;
    message?: string;
    credentialRefId?: string;
  };
  /** Optional Terminal bridge (sync policy + optional spawn). */
  executeTerminalCommand?: (
    input: LoopTerminalCommandRequest,
  ) => LoopTerminalCommandResult;
  /** GC-2.2: pause/cancel must reach Agent Runtime when present. */
  pauseAgentRun?: (runId: string) => void;
  cancelAgentRun?: (runId: string) => void;
  continueAgentRun?: (runId: string) => void;
  /**
   * GC-7: when true, Loop may start another AgentRun while one is in flight
   * (shared worktree; conflicts still surface as blocked/HITL).
   */
  allowConcurrentLoopRuns?: boolean;
  /**
   * Digest current workspace bytes for relative paths (approval evidence).
   * Missing digester with non-empty delivery scope → fail-closed.
   * Optional deletedPaths mark expected absences (tombstones).
   */
  digestWorkspacePaths?: (
    paths: string[],
    options?: { deletedPaths?: string[] },
  ) => {
    digests: Record<string, string>;
    missing: string[];
    unreadable: string[];
    tombstones?: string[];
    undeleted?: string[];
  };
}
