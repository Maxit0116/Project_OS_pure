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
}

export interface LoopEvidenceView {
  id: string;
  runId: string;
  status: "passed" | "failed" | "not_run";
}

export interface LoopAgentRunRequest {
  specNodeId: string;
  role: "implement" | "fix";
  featureNodeId: string;
  filePath: string;
  /** Task text only. It must not be parsed for write paths. */
  goal: string;
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
}
