import {
  ExecutorDelegationPlanSchema,
  ExecutorProposalSchema,
  ExecutorTaskSchema,
} from "../../contracts/executor-adapter.js";
import type {
  ExecutorCapabilities,
  ExecutorDelegationPlan,
  ExecutorEvent,
  ExecutorProposal,
  ExecutorResult,
  ExecutorTask,
} from "../../contracts/executor-adapter.js";
import type { NodeContextBundle } from "../../contracts/local-context.js";
import { cloneJson } from "../../utils/json.js";

export interface ProposalSubmissionResult {
  accepted: boolean;
  reason?: string;
}

export interface HarnessCallOptions {
  signal?: AbortSignal;
}

export interface HarnessHost {
  /** Returns only context allowed for this task; implementations apply the task's read policy. */
  inspectNode(input: { taskId: string; nodeId: string }): Promise<NodeContextBundle>;
  listChildren(input: { taskId: string; nodeId: string; cursor?: string }): Promise<{
    nodeIds: string[];
    totalCount: number;
    nextCursor?: string;
  }>;
  /** Reads one task-authorized path and returns the hash used to identify the snapshot. */
  readSource(input: { taskId: string; path: string }): Promise<{
    path: string;
    sha256: string;
    content: string;
  }>;
  consultNode(input: { taskId: string; nodeId: string; question: string }): Promise<{
    nodeId: string;
    answer: string;
    contextHash: string;
    sourcePaths: string[];
  }>;
  /** Server validates scope, dependencies, contract participants, binding, and write authorization. */
  delegate(plan: ExecutorDelegationPlan, options?: HarnessCallOptions): Promise<ExecutorTask[]>;
  /** Accepted means staged for validation; adapters never publish authoritative files directly. */
  submitProposal(proposal: ExecutorProposal, options?: HarnessCallOptions): Promise<ProposalSubmissionResult>;
  requestDecision(input: {
    taskId: string;
    question: string;
  }, options?: HarnessCallOptions): Promise<{ decisionId: string }>;
}

export interface HarnessHostOperations {
  inspectNode(task: ExecutorTask, nodeId: string): Promise<NodeContextBundle>;
  listChildren(task: ExecutorTask, nodeId: string, cursor?: string): Promise<{
    nodeIds: string[];
    totalCount: number;
    nextCursor?: string;
  }>;
  readSource(task: ExecutorTask, path: string): Promise<{ path: string; sha256: string; content: string }>;
  consultNode(task: ExecutorTask, input: { nodeId: string; question: string }): Promise<{
    nodeId: string;
    answer: string;
    contextHash: string;
    sourcePaths: string[];
  }>;
  /** Must materialize/authorize only; the harness dispatches returned children after validation. */
  delegate(task: ExecutorTask, plan: ExecutorDelegationPlan, options?: HarnessCallOptions): Promise<ExecutorTask[]>;
  submitProposal(task: ExecutorTask, proposal: ExecutorProposal, options?: HarnessCallOptions): Promise<ProposalSubmissionResult>;
  requestDecision(task: ExecutorTask, input: { question: string }, options?: HarnessCallOptions): Promise<{ decisionId: string }>;
}

/** Applies task-bound identities and file capabilities before forwarding host calls. */
export function createScopedHarnessHost(taskInput: ExecutorTask, operations: HarnessHostOperations): HarnessHost {
  const task = ExecutorTaskSchema.parse(taskInput);
  return {
    inspectNode: async ({ taskId, nodeId }) => {
      assertTaskId(task, taskId);
      return operations.inspectNode(task, nodeId);
    },
    listChildren: async ({ taskId, nodeId, cursor }) => {
      assertTaskId(task, taskId);
      return operations.listChildren(task, nodeId, cursor);
    },
    readSource: async ({ taskId, path }) => {
      assertTaskId(task, taskId);
      if (!task.allowedReadPaths.includes(path)) {
        throw new Error(`Task '${task.taskId}' cannot read '${path}'`);
      }
      return operations.readSource(task, path);
    },
    consultNode: async ({ taskId, nodeId, question }) => {
      assertTaskId(task, taskId);
      return operations.consultNode(task, { nodeId, question });
    },
    delegate: async (plan, options) => {
      if (options?.signal?.aborted) throw new Error("Task was cancelled before delegation");
      const validatedPlan = ExecutorDelegationPlanSchema.parse(plan);
      if (validatedPlan.taskId !== task.taskId) throw new Error("Delegation plan does not belong to this task");
      const authorized = (await operations.delegate(task, cloneJson(validatedPlan), options))
        .map((child) => ExecutorTaskSchema.parse(child));
      const plannedById = new Map(validatedPlan.tasks.map((child) => [child.taskId, child]));
      if (authorized.length !== validatedPlan.tasks.length ||
        new Set(authorized.map((child) => child.taskId)).size !== authorized.length ||
        new Set(authorized.map((child) => child.runId)).size !== authorized.length) {
        throw new Error("Host did not authorize the complete delegated task set");
      }
      for (const child of authorized) {
        const proposed = plannedById.get(child.taskId);
        if (!proposed || child.parentTaskId !== task.taskId ||
          child.runId === task.runId || child.rootRunId !== task.rootRunId || child.projectId !== task.projectId ||
          child.executorBindingId !== task.executorBindingId || child.mode !== task.mode ||
          JSON.stringify(child.scope) !== JSON.stringify(proposed.scope) ||
          child.role !== proposed.role || child.objective !== proposed.objective ||
          JSON.stringify(child.dependencyTaskIds) !== JSON.stringify(proposed.dependencyTaskIds) ||
          JSON.stringify(child.acceptanceCriteria) !== JSON.stringify(proposed.acceptanceCriteria) ||
          JSON.stringify(child.interfaceContractIds) !== JSON.stringify(proposed.interfaceContractIds) ||
          JSON.stringify(child.interfaceContracts) !== JSON.stringify([
            ...task.interfaceContracts.filter((contract) => !validatedPlan.contracts.some((local) => local.contractId === contract.contractId)),
            ...validatedPlan.contracts.filter((contract) =>
              contract.producerTaskId === child.taskId || contract.consumerTaskIds.includes(child.taskId)),
          ])) {
          throw new Error(`Host changed or failed to authorize delegated task '${child.taskId}'`);
        }
      }
      return authorized;
    },
    submitProposal: async (proposalInput, options) => {
      if (options?.signal?.aborted) throw new Error("Task was cancelled before proposal staging");
      const proposal = ExecutorProposalSchema.parse(proposalInput);
      if (proposal.taskId !== task.taskId || proposal.diff.runId !== task.runId) {
        throw new Error("Proposal identity does not match the bound task run");
      }
      const unauthorizedPath = proposal.diff.files.find((file) => !task.allowedWritePaths.includes(file.path));
      if (unauthorizedPath) throw new Error(`Task '${task.taskId}' cannot propose '${unauthorizedPath.path}'`);
      return operations.submitProposal(task, proposal, options);
    },
    requestDecision: async ({ taskId, question }, options) => {
      if (options?.signal?.aborted) throw new Error("Task was cancelled before requesting a decision");
      assertTaskId(task, taskId);
      return operations.requestDecision(task, { question }, options);
    },
  };
}

function assertTaskId(task: ExecutorTask, taskId: string): void {
  if (taskId !== task.taskId) throw new Error(`Host call does not belong to task '${task.taskId}'`);
}

export interface ExecutorHandle {
  events: AsyncIterable<ExecutorEvent>;
  result: Promise<ExecutorResult>;
  cancel(reason: string): Promise<void>;
}

export interface NodeExecutorAdapter {
  readonly id: string;
  /** Name shown in the executor picker; falls back to `id`. */
  readonly label?: string;
  /** True for scripted stand-ins that must be labelled as such and never ship enabled. */
  readonly devOnly?: boolean;
  describe(): ExecutorCapabilities;
  start(task: ExecutorTask, host: HarnessHost): Promise<ExecutorHandle>;
}
