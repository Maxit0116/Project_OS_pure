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

export type ProjectOSModelExecutorOptions = {
  /**
   * When true, block on the production waiting-decision card via
   * `host.requestDecision` before generating. Default is false: after an
   * approved intent the leaf must generate without inventing a Continue card.
   * Opt in only for explicit mid-run / diagnostic pauses. Hosts without a
   * decision store (`not_implemented`) still continue without pausing.
   *
   * This flag is not “the model asked a real clarification” — that remains a
   * separate host.requestDecision call when an executor has a real question.
   */
  askBeforeGenerate?: boolean;
};

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
  private readonly askBeforeGenerate: boolean;

  constructor(
    private readonly generate: () => Promise<GeneratedDiff>,
    options: ProjectOSModelExecutorOptions = {},
  ) {
    this.askBeforeGenerate = options.askBeforeGenerate === true;
  }

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
        if (this.askBeforeGenerate) {
          const question =
            `Continue generating the authorized edit?\n\n${task.objective}`.slice(0, 500);
          try {
            const requested = await waitForHost(
              host.requestDecision(
                { taskId: task.taskId, question },
                { signal: controller.signal },
              ),
              controller.signal,
            );
            if (controller.signal.aborted || requested.kind === "cancelled") {
              queue.push({
                type: "task_cancelled",
                taskId: task.taskId,
                reason: cancelReason || "cancelled",
                timestamp: now(),
              });
              return ExecutorResultSchema.parse({
                outcome: "cancelled",
                taskId: task.taskId,
                reason: cancelReason || "cancelled",
              });
            }
            queue.push({
              type: "decision_requested",
              taskId: task.taskId,
              decisionId: requested.value.decisionId,
              question,
              timestamp: now(),
            });
          } catch (error) {
            // Host without a durable decision store (tests / legacy) — continue.
            const code =
              typeof error === "object" && error !== null && "code" in error
                ? String((error as { code?: unknown }).code ?? "")
                : "";
            if (code !== "not_implemented") throw error;
          }
        }
        if (controller.signal.aborted) {
          queue.push({ type: "task_cancelled", taskId: task.taskId, reason: cancelReason || "cancelled", timestamp: now() });
          return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason: cancelReason || "cancelled" });
        }
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
