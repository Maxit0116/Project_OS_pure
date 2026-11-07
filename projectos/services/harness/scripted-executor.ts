import {
  ExecutorCapabilitiesSchema,
  ExecutorResultSchema,
  type ExecutorProposal,
  type ExecutorResult,
  type ExecutorTask,
} from "../../contracts/executor-adapter.js";
import type { ExecutorHandle, HarnessHost, NodeExecutorAdapter } from "./executor-adapter.js";
import { eventQueue, waitForHost } from "./fake-executor.js";

export const SCRIPTED_EXECUTOR_ID = "scripted";
export const SCRIPTED_EXECUTOR_LABEL = "Scripted executor (dev, no model)";

type CommentStyle = { open: string; close?: string };

const COMMENT_STYLES: Record<string, CommentStyle> = {
  ".ts": { open: "//" },
  ".tsx": { open: "//" },
  ".js": { open: "//" },
  ".jsx": { open: "//" },
  ".mjs": { open: "//" },
  ".cjs": { open: "//" },
  ".go": { open: "//" },
  ".rs": { open: "//" },
  ".java": { open: "//" },
  ".swift": { open: "//" },
  ".py": { open: "#" },
  ".rb": { open: "#" },
  ".sh": { open: "#" },
  ".yml": { open: "#" },
  ".yaml": { open: "#" },
  ".toml": { open: "#" },
  ".css": { open: "/*", close: "*/" },
  ".scss": { open: "//" },
  ".html": { open: "<!--", close: "-->" },
  ".md": { open: "<!--", close: "-->" },
};

function commentStyleFor(path: string): CommentStyle | undefined {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? undefined : COMMENT_STYLES[path.slice(dot).toLowerCase()];
}

function now(): string {
  return new Date().toISOString();
}

/**
 * A deterministic stand-in for a real agent, for development and demos only.
 *
 * It reads the one file its task may write and proposes appending a single
 * comment that states, in the file itself, that no model produced the change.
 * It exists to exercise the harness path (task, scoped host, proposal staging,
 * review) without a model credential. It never claims to understand the request.
 */
export class ScriptedExecutorAdapter implements NodeExecutorAdapter {
  readonly id = SCRIPTED_EXECUTOR_ID;
  readonly label = SCRIPTED_EXECUTOR_LABEL;
  readonly devOnly = true;

  describe() {
    return ExecutorCapabilitiesSchema.parse({
      modes: ["change", "debug"],
      roles: ["leaf"],
      structuredPlans: false,
      proposalExport: true,
      mediatedTools: true,
      cancellation: true,
      nativeResume: false,
      usage: "unavailable",
      thinkingDepths: ["off"],
    });
  }

  async start(task: ExecutorTask, host: HarnessHost): Promise<ExecutorHandle> {
    const queue = eventQueue();
    const controller = new AbortController();
    let cancelReason = "";
    const cancelled = (): ExecutorResult => {
      const reason = cancelReason || "cancelled";
      queue.push({ type: "task_cancelled", taskId: task.taskId, reason, timestamp: now() });
      return ExecutorResultSchema.parse({ outcome: "cancelled", taskId: task.taskId, reason });
    };
    const failed = (reason: string): ExecutorResult => {
      queue.push({ type: "task_failed", taskId: task.taskId, reason, timestamp: now() });
      return ExecutorResultSchema.parse({ outcome: "failed", taskId: task.taskId, reason });
    };
    const result = (async (): Promise<ExecutorResult> => {
      queue.push({ type: "task_started", taskId: task.taskId, timestamp: now() });
      if (task.role !== "leaf" || task.allowedWritePaths.length !== 1) {
        return failed("The scripted executor edits exactly one file");
      }
      const path = task.allowedWritePaths[0]!;
      const style = commentStyleFor(path);
      if (!style) return failed(`The scripted executor cannot annotate '${path}'`);
      queue.push({ type: "progress", taskId: task.taskId, message: `scripted executor reading ${path}`, timestamp: now() });
      const read = await waitForHost(host.readSource({ taskId: task.taskId, path }), controller.signal);
      if (read.kind === "cancelled") return cancelled();
      // Request text must not be able to close the comment and inject content.
      const objective = task.objective
        .replace(/\s+/g, " ")
        .replace(/-->|\*\/|<!--|\/\*/g, "")
        .trim()
        .slice(0, 120);
      const text = `Scripted executor (no model) — requested: ${objective}`;
      const line = style.close ? `${style.open} ${text} ${style.close}` : `${style.open} ${text}`;
      const before = read.value.content;
      const after = `${before}${before === "" || before.endsWith("\n") ? "" : "\n"}${line}\n`;
      const proposal: ExecutorProposal = {
        proposalId: `proposal_${task.taskId}`,
        taskId: task.taskId,
        diff: {
          runId: task.runId,
          summary: `Scripted executor appends a marker comment to ${path}. No model was used.`,
          files: [{ path, changeType: "modify", before, after }],
        },
      };
      queue.push({ type: "proposal_ready", taskId: task.taskId, proposalId: proposal.proposalId, timestamp: now() });
      const submitted = await waitForHost(
        host.submitProposal(proposal, { signal: controller.signal }),
        controller.signal,
      );
      if (submitted.kind === "cancelled") return cancelled();
      if (!submitted.value.accepted) {
        return failed(submitted.value.reason ?? "proposal rejected by harness");
      }
      queue.push({ type: "task_completed", taskId: task.taskId, timestamp: now() });
      return ExecutorResultSchema.parse({ outcome: "completed", taskId: task.taskId, proposal });
    })().catch((error): ExecutorResult => {
      if (controller.signal.aborted) return cancelled();
      return failed(error instanceof Error ? error.message : String(error));
    }).finally(() => queue.close());
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
