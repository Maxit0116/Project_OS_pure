import {
  ExecutorCapabilitiesSchema,
  ExecutorResultSchema,
  type ExecutorProposal,
  type ExecutorResult,
  type ExecutorTask,
} from "../../contracts/executor-adapter.js";
import type { GeneratedDiff } from "../../contracts/diff.js";
import type { ExecutorHandle, HarnessHost, NodeExecutorAdapter } from "./executor-adapter.js";
import { eventQueue, waitForHost } from "./fake-executor.js";

export const PROJECT_OS_MODEL_EXECUTOR_ID = "projectos";

function now(): string {
  return new Date().toISOString();
}

/**
 * The built-in model as an executor. It produces the diff with Project OS's own model loop
 * and hands it to the harness host exactly as any other executor does, so the server's
 * scope and snapshot checks apply to it too.
 *
 * One instance serves one attempt: `generate` is bound to a run by the caller, which keeps
 * run state, budgets and event emission out of the adapter. It is created per call and is
 * not registered, so it never appears in the executor picker.
 */
export class ProjectOSModelExecutor implements NodeExecutorAdapter {
  readonly id = PROJECT_OS_MODEL_EXECUTOR_ID;
  readonly label = "Project OS model";
  private failure: unknown;
  private failed = false;

  constructor(private readonly generate: () => Promise<GeneratedDiff>) {}

  describe() {
    return ExecutorCapabilitiesSchema.parse({
      modes: ["change", "debug"],
      roles: ["leaf"],
      structuredPlans: false,
      proposalExport: true,
      mediatedTools: true,
      cancellation: true,
      nativeResume: false,
      usage: "reported",
      thinkingDepths: ["off", "low", "medium", "high"],
    });
  }

  /** The generator's own error, if it threw; the caller rethrows it to keep its type and code. */
  takeError(): unknown {
    const failure = this.failed ? this.failure : undefined;
    this.failed = false;
    this.failure = undefined;
    return failure;
  }

  async start(task: ExecutorTask, host: HarnessHost): Promise<ExecutorHandle> {
    const queue = eventQueue();
    const controller = new AbortController();
    let cancelReason = "";
    const result = (async (): Promise<ExecutorResult> => {
      queue.push({ type: "task_started", taskId: task.taskId, timestamp: now() });
      try {
        const diff = await this.generate();
        if (controller.signal.aborted) {
          queue.push({ type: "task_cancelled", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason: cancelReason || "cancelled" });
        }
        const proposal: ExecutorProposal = { proposalId: `proposal_${task.taskId}`, taskId: task.taskId, diff };
        queue.push({ type: "proposal_ready", taskId: task.taskId, proposalId: proposal.proposalId, timestamp: now() });
        const submitted = await waitForHost(host.submitProposal(proposal, { signal: controller.signal }), controller.signal);
        if (submitted.kind === "cancelled") {
          queue.push({ type: "task_cancelled", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason: cancelReason || "cancelled" });
        }
        if (!submitted.value.accepted) {
          const reason = submitted.value.reason ?? "proposal rejected by harness";
          queue.push({ type: "task_failed", taskId: task.taskId, reason, timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason });
        }
        queue.push({ type: "task_completed", taskId: task.taskId, timestamp: now() });
        return ExecutorResultSchema.parse({ outcome: "completed", taskId: task.taskId, proposal });
      } catch (error) {
        this.failed = true;
        this.failure = error;
        const reason = error instanceof Error ? error.message : String(error);
        queue.push({ type: "task_failed", taskId: task.taskId, reason, timestamp: now() });
        return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason });
      }
    })().finally(() => queue.close());
    return {
      events: queue.read(),
      result,
      async cancel(reason: string) {
        cancelReason = reason;
        controller.abort(reason);
      },
    };
  }
}
