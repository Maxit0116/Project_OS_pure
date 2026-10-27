import {
  ExecutorCapabilitiesSchema,
  ExecutorEventSchema,
  ExecutorResultSchema,
  type ExecutorEvent,
  type ExecutorProposal,
  type ExecutorResult,
  type ExecutorTask,
} from "../../contracts/executor-adapter.js";
import type { ExecutorHandle, HarnessHost, NodeExecutorAdapter } from "./executor-adapter.js";

export interface FakeExecutorScenario {
  proposal?: ExecutorProposal;
  decisionQuestion?: string;
  failureReason?: string;
}

function now(): string {
  return new Date().toISOString();
}

function eventQueue() {
  const events: ExecutorEvent[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;
  return {
    push(event: ExecutorEvent) {
      events.push(ExecutorEventSchema.parse(event));
      waiters.splice(0).forEach((wake) => wake());
    },
    close() {
      closed = true;
      waiters.splice(0).forEach((wake) => wake());
    },
    async *read(): AsyncIterable<ExecutorEvent> {
      let index = 0;
      while (!closed || index < events.length) {
        while (index < events.length) yield events[index++]!;
        if (closed) break;
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

export class FakeExecutorAdapter implements NodeExecutorAdapter {
  readonly id = "fake";

  constructor(private readonly scenario: FakeExecutorScenario = {}) {}

  describe() {
    return ExecutorCapabilitiesSchema.parse({
      modes: ["ask", "plan", "change", "debug"],
      roles: ["global", "planner", "leaf"],
      structuredPlans: true,
      proposalExport: true,
      mediatedTools: true,
      cancellation: true,
      nativeResume: false,
      usage: "reported",
      thinkingDepths: ["off", "low", "medium", "high"],
    });
  }

  async start(task: ExecutorTask, host: HarnessHost): Promise<ExecutorHandle> {
    const queue = eventQueue();
    let cancelled = false;
    let cancelReason = "";
    const result = (async (): Promise<ExecutorResult> => {
      queue.push({ type: "task_started", taskId: task.taskId, timestamp: now() });
      queue.push({ type: "progress", taskId: task.taskId, message: "fake executor started", timestamp: now() });
      if (this.scenario.decisionQuestion) {
        const decision = await host.requestDecision({ taskId: task.taskId, question: this.scenario.decisionQuestion });
        queue.push({ type: "decision_requested", taskId: task.taskId, decisionId: decision.decisionId, question: this.scenario.decisionQuestion, timestamp: now() });
        queue.close();
        return ExecutorResultSchema.parse({ outcome: "waiting", taskId: task.taskId, decisionId: decision.decisionId });
      }
      if (cancelled) {
        queue.push({ type: "task_failed", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
        queue.close();
        return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason: cancelReason || "cancelled" });
      }
      if (this.scenario.failureReason) {
        queue.push({ type: "task_failed", taskId: task.taskId, reason: this.scenario.failureReason, timestamp: now() });
        queue.close();
        return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason: this.scenario.failureReason });
      }
      if (this.scenario.proposal) {
        queue.push({ type: "proposal_ready", taskId: task.taskId, proposalId: this.scenario.proposal.proposalId, timestamp: now() });
        const submission = await host.submitProposal(this.scenario.proposal);
        if (!submission.accepted) {
          const reason = submission.reason ?? "proposal rejected by harness";
          queue.push({ type: "task_failed", taskId: task.taskId, reason, timestamp: now() });
          queue.close();
          return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason });
        }
      }
      queue.push({ type: "task_completed", taskId: task.taskId, timestamp: now() });
      queue.close();
      return ExecutorResultSchema.parse({ outcome: "completed", taskId: task.taskId, ...(this.scenario.proposal ? { proposal: this.scenario.proposal } : {}) });
    })();
    return {
      events: queue.read(),
      result,
      async cancel(reason: string) {
        cancelled = true;
        cancelReason = reason;
      },
    };
  }
}
