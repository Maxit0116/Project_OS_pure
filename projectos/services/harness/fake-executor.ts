import {
  ExecutorCapabilitiesSchema,
  ExecutorEventSchema,
  ExecutorResultSchema,
  type ExecutorEvent,
  type ExecutorDelegationPlan,
  type ExecutorProposal,
  type ExecutorResult,
  type ExecutorTask,
} from "../../contracts/executor-adapter.js";
import type { ExecutorHandle, HarnessHost, NodeExecutorAdapter } from "./executor-adapter.js";

export interface FakeExecutorScenario {
  proposal?: ExecutorProposal;
  delegationPlan?: ExecutorDelegationPlan;
  answer?: string;
  evidence?: string[];
  decisionQuestion?: string;
  escalationReason?: string;
  failureReason?: string;
}

export type AbortableResult<T> = { kind: "value"; value: T } | { kind: "cancelled" };

export function waitForHost<T>(operation: Promise<T>, signal: AbortSignal): Promise<AbortableResult<T>> {
  if (signal.aborted) return Promise.resolve({ kind: "cancelled" });
  let removeListener = () => {};
  const cancelled = new Promise<AbortableResult<T>>((resolve) => {
    const onAbort = () => resolve({ kind: "cancelled" });
    signal.addEventListener("abort", onAbort, { once: true });
    removeListener = () => signal.removeEventListener("abort", onAbort);
  });
  return Promise.race([
    operation.then((value) => ({ kind: "value" as const, value })),
    cancelled,
  ]).finally(removeListener);
}

function now(): string {
  return new Date().toISOString();
}

export function eventQueue() {
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
      usage: "unavailable",
      thinkingDepths: ["off", "low", "medium", "high"],
    });
  }

  async start(task: ExecutorTask, host: HarnessHost): Promise<ExecutorHandle> {
    const queue = eventQueue();
    let cancelled = false;
    let cancelReason = "";
    const controller = new AbortController();
    const result = (async (): Promise<ExecutorResult> => {
      queue.push({ type: "task_started", taskId: task.taskId, timestamp: now() });
      queue.push({ type: "progress", taskId: task.taskId, message: "fake executor started", timestamp: now() });
      if (this.scenario.decisionQuestion) {
        const requested = await waitForHost(host.requestDecision(
          { taskId: task.taskId, question: this.scenario.decisionQuestion },
          { signal: controller.signal },
        ), controller.signal);
        if (cancelled || requested.kind === "cancelled") {
          queue.push({ type: "task_cancelled", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason: cancelReason || "cancelled" });
        }
        const decision = requested.value;
        queue.push({ type: "decision_requested", taskId: task.taskId, decisionId: decision.decisionId, question: this.scenario.decisionQuestion, timestamp: now() });
        return ExecutorResultSchema.parse({ outcome: "waiting", taskId: task.taskId, decisionId: decision.decisionId });
      }
      if (cancelled) {
        queue.push({ type: "task_cancelled", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
        return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason: cancelReason || "cancelled" });
      }
      if (this.scenario.failureReason) {
        queue.push({ type: "task_failed", taskId: task.taskId, reason: this.scenario.failureReason, timestamp: now() });
        return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason: this.scenario.failureReason });
      }
      if (this.scenario.delegationPlan) {
        if (this.scenario.delegationPlan.taskId !== task.taskId) {
          throw new Error("Fake delegation plan belongs to another task");
        }
        queue.push({
          type: "delegation_ready",
          taskId: task.taskId,
          childTaskIds: this.scenario.delegationPlan.tasks.map((child) => child.taskId),
          timestamp: now(),
        });
        return ExecutorResultSchema.parse({ outcome: "delegation", plan: this.scenario.delegationPlan });
      }
      if (this.scenario.escalationReason) {
        queue.push({ type: "escalated", taskId: task.taskId, reason: this.scenario.escalationReason, timestamp: now() });
        return ExecutorResultSchema.parse({
          outcome: "escalated",
          taskId: task.taskId,
          reason: this.scenario.escalationReason,
          requestedEffects: [],
        });
      }
      if (this.scenario.answer) {
        return ExecutorResultSchema.parse({
          outcome: "answer",
          taskId: task.taskId,
          answer: this.scenario.answer,
          evidence: this.scenario.evidence ?? [],
        });
      }
      if (this.scenario.proposal) {
        queue.push({ type: "proposal_ready", taskId: task.taskId, proposalId: this.scenario.proposal.proposalId, timestamp: now() });
        const submitted = await waitForHost(
          host.submitProposal(this.scenario.proposal, { signal: controller.signal }),
          controller.signal,
        );
        if (cancelled || submitted.kind === "cancelled") {
          queue.push({ type: "task_cancelled", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason: cancelReason || "cancelled" });
        }
        const submission = submitted.value;
        if (!submission.accepted) {
          const reason = submission.reason ?? "proposal rejected by harness";
          queue.push({ type: "task_failed", taskId: task.taskId, reason, timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason });
        }
        if (cancelled) {
          queue.push({ type: "task_cancelled", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason: cancelReason || "cancelled" });
        }
      }
      queue.push({ type: "task_completed", taskId: task.taskId, timestamp: now() });
      return ExecutorResultSchema.parse({ outcome: "completed", taskId: task.taskId, ...(this.scenario.proposal ? { proposal: this.scenario.proposal } : {}) });
    })().catch((error): ExecutorResult => {
      if (controller.signal.aborted) {
        const reason = cancelReason || "cancelled";
        queue.push({ type: "task_cancelled", taskId: task.taskId, reason, timestamp: now() });
        return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason });
      }
      const reason = error instanceof Error ? error.message : String(error);
      queue.push({ type: "task_failed", taskId: task.taskId, reason, timestamp: now() });
      return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason });
    }).finally(() => queue.close());
    return {
      events: queue.read(),
      result,
      async cancel(reason: string) {
        cancelled = true;
        cancelReason = reason;
        controller.abort(reason);
      },
    };
  }
}
