import { describe, expect, it, vi } from "vitest";
import { GeneratedDiffSchema } from "../../contracts/diff.js";
import type { ExecutorTask } from "../../contracts/executor-adapter.js";
import type { HarnessHost } from "./executor-adapter.js";
import { ProjectOSModelExecutor } from "./project-os-model-executor.js";

function task(): ExecutorTask {
  return {
    taskId: "task_model_1",
    runId: "run_1",
    mode: "change",
    role: "leaf",
    objective: "Change the login page heading",
    dependencyTaskIds: [],
    acceptanceCriteria: [],
    interfaceContractIds: [],
    interfaceContracts: [],
    contextBundleHash: "bundle",
    allowedReadPaths: ["app/login/page.tsx"],
    allowedWritePaths: ["app/login/page.tsx"],
  };
}

function emptyDiff(runId = "run_1") {
  return GeneratedDiffSchema.parse({
    runId,
    summary: "heading edit",
    files: [{
      path: "app/login/page.tsx",
      changeType: "modify",
      before: "old",
      after: "new",
    }],
  });
}

describe("ProjectOSModelExecutor requestDecision before generate", () => {
  it("calls host.requestDecision then generates after the card answer", async () => {
    let resolveDecision: ((value: { decisionId: string }) => void) | undefined;
    const decisionGate = new Promise<{ decisionId: string }>((resolve) => {
      resolveDecision = resolve;
    });
    const requestDecision = vi.fn(async () => decisionGate);
    const submitProposal = vi.fn(async () => ({ accepted: true as const }));
    const generate = vi.fn(async () => emptyDiff());
    const host = {
      requestDecision,
      submitProposal,
    } as unknown as HarnessHost;

    const adapter = new ProjectOSModelExecutor(generate);
    const handle = await adapter.start(task(), host);
    await new Promise((r) => setTimeout(r, 20));
    expect(generate).not.toHaveBeenCalled();
    expect(requestDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task_model_1",
        question: expect.stringContaining("Continue generating the authorized edit?"),
      }),
      expect.anything(),
    );
    resolveDecision!({ decisionId: "decision_model_1" });
    const result = await handle.result;
    expect(generate).toHaveBeenCalledOnce();
    expect(submitProposal).toHaveBeenCalledOnce();
    expect(result.outcome).toBe("completed");
  });

  it("skips the pause when the host reports not_implemented", async () => {
    const generate = vi.fn(async () => emptyDiff());
    const host = {
      requestDecision: vi.fn(async () => {
        const error = new Error("Host operation 'request_decision' is not available to a leaf task yet");
        (error as { code?: string }).code = "not_implemented";
        throw error;
      }),
      submitProposal: vi.fn(async () => ({ accepted: true as const })),
    } as unknown as HarnessHost;

    const adapter = new ProjectOSModelExecutor(generate);
    const result = await (await adapter.start(task(), host)).result;
    expect(generate).toHaveBeenCalledOnce();
    expect(result.outcome).toBe("completed");
  });

  it("can disable the mid-run ask", async () => {
    const requestDecision = vi.fn();
    const host = {
      requestDecision,
      submitProposal: vi.fn(async () => ({ accepted: true as const })),
    } as unknown as HarnessHost;
    const adapter = new ProjectOSModelExecutor(async () => emptyDiff(), {
      askBeforeGenerate: false,
    });
    const result = await (await adapter.start(task(), host)).result;
    expect(requestDecision).not.toHaveBeenCalled();
    expect(result.outcome).toBe("completed");
  });
});
