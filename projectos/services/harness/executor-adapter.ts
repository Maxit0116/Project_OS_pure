import type {
  ExecutorCapabilities,
  ExecutorEvent,
  ExecutorProposal,
  ExecutorResult,
  ExecutorTask,
} from "../../contracts/executor-adapter.js";

export interface ProposalSubmissionResult {
  accepted: boolean;
  reason?: string;
}

export interface HarnessHost {
  submitProposal(proposal: ExecutorProposal): Promise<ProposalSubmissionResult>;
  requestDecision(input: {
    taskId: string;
    question: string;
  }): Promise<{ decisionId: string }>;
}

export interface ExecutorHandle {
  events: AsyncIterable<ExecutorEvent>;
  result: Promise<ExecutorResult>;
  cancel(reason: string): Promise<void>;
}

export interface NodeExecutorAdapter {
  readonly id: string;
  describe(): ExecutorCapabilities;
  start(task: ExecutorTask, host: HarnessHost): Promise<ExecutorHandle>;
}
