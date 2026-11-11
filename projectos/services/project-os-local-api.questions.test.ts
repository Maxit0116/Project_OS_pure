import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunDecision } from "../contracts/run-state.js";
import { copySampleTree } from "../test-support/copy-sample.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { copySampleTree } from "../test-support/copy-sample.js";

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function copyOfSample(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-question-"));
  roots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  copySampleTree(resolve("..", "sample-graph-saas"), workspaceRoot);
  return workspaceRoot;
}

type Internals = {
  orchestrator: {
    pendingQuestions: Map<string, { resolve: (answer: unknown) => void; reject: (error: Error) => void }>;
    decisionPort: { open(decision: RunDecision): void; supersede(decisionId: string): void } | undefined;
  };
};

async function openWithPendingQuestion() {
  const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: copyOfSample(), runEventPersistence: "memory" });
  const project = await api.openSampleWorkspace();
  const internals = api as unknown as Internals;
  const decision: RunDecision = {
    version: "0.1.0",
    id: "decision_run_q_question_1",
    projectId: project.projectId,
    rootRunId: "run_q",
    runId: "run_q",
    kind: "clarification",
    question: "Which address should the receipt go to?",
    options: [
      { id: "option_1", label: "Account email" },
      { id: "option_2", label: "Another address" },
      { id: "decline", label: "Let Agent decide" },
    ],
    status: "pending",
    revision: 1,
    createdAt: "2026-11-05T00:00:00.000Z",
  };
  // The agent's side: the question is recorded, and the run waits on it.
  internals.orchestrator.decisionPort!.open(decision);
  const answered = vi.fn();
  internals.orchestrator.pendingQuestions.set(decision.id, { resolve: answered, reject: vi.fn() });
  return { api, project, decision, internals, answered };
}

describe("a question the agent put to the person", () => {
  it("is kept where the person's decision card reads it", async () => {
    const { api, project, decision } = await openWithPendingQuestion();

    const listed = await api.listRunDecisions(project.projectId, "run_q");

    expect(listed).toEqual([expect.objectContaining({ id: decision.id, kind: "clarification", status: "pending" })]);
  });

  it("wakes the waiting run with the person's answer, and records it", async () => {
    const { api, project, decision, answered } = await openWithPendingQuestion();

    const resolved = await api.resolveRunDecision(project.projectId, decision.id, 1, { optionId: "option_2", text: "the billing one" });

    expect(resolved).toMatchObject({ status: "resolved", answer: { optionId: "option_2", text: "the billing one" } });
    expect(answered).toHaveBeenCalledTimes(1);
    expect(answered).toHaveBeenCalledWith({ question: decision.question, answer: "Another address. the billing one" });
    expect((await api.listRunDecisions(project.projectId, "run_q"))[0]).toMatchObject({ status: "resolved" });
  });

  it("wakes the run too when the person leaves it to the agent", async () => {
    const { api, project, decision, answered } = await openWithPendingQuestion();

    await api.resolveRunDecision(project.projectId, decision.id, 1, { optionId: "decline" }, "declined");

    expect(answered).toHaveBeenCalledWith({
      question: decision.question,
      answer: "The person left this to the agent.",
      leftToAgent: true,
    });
  });

  it("refuses a stale answer and does not wake anything", async () => {
    const { api, project, decision, answered } = await openWithPendingQuestion();

    await expect(api.resolveRunDecision(project.projectId, decision.id, 7, { optionId: "option_1" })).rejects.toThrow(/stale/iu);
    expect(answered).not.toHaveBeenCalled();
  });

  it("is taken off the screen when the run that asked it is gone", async () => {
    const { api, project, decision, internals } = await openWithPendingQuestion();

    internals.orchestrator.decisionPort!.supersede(decision.id);

    expect((await api.listRunDecisions(project.projectId, "run_q"))[0]).toMatchObject({ status: "superseded" });
    // A superseded question cannot be answered later.
    await expect(api.resolveRunDecision(project.projectId, decision.id, 2, { optionId: "option_1" })).rejects.toThrow(/cannot be answered again|no longer pending/iu);
  });
});
