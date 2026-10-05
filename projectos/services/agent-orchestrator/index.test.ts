import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ProjectOSSettingsSchema } from "../../contracts/settings.js";
import type { PromptRefinement } from "../../contracts/prompt-refinement.js";
import type {
  GlobalContextBundle,
  LocalContextBundle,
  NodeContextBundle,
} from "../../contracts/local-context.js";
import type { GreenfieldInitializationPlan } from "../../contracts/greenfield-initialization-plan.js";
import type { AgentFlowStepKind } from "../../contracts/events.js";
import type { ModelGatewayRequest } from "../../contracts/model-gateway.js";
import type { GeneratedDiff } from "../../contracts/diff.js";
import { ProjectOSError } from "../../errors.js";
import { validateAgentRunEventSequence } from "../../validation/index.js";
import { InMemorySecretStore } from "../../persistence/index.js";
import { ProjectOSWorkspaceStore } from "../../persistence/workspace-store.js";
import { ModelGateway } from "../model-gateway/index.js";
import { SettingsService } from "../settings-service.js";
import { ProjectOSLocalApi } from "../project-os-local-api.js";
import {
  AgentOrchestrator,
  type AgentRunEventPersistence,
  type AutomaticLeafExecutionDependency,
  type GreenfieldInitializationDependency,
  type HierarchyDelegationDependency,
} from "./index.js";
import { CREATE_FILE_MAX_BYTES } from "../create-file-content.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("AgentOrchestrator generated diff truthfulness", () => {
  it("fails the run and produces no diff for malformed model output", async () => {
    const rejectedOutputs = [
      "not valid json SECRET_REJECTED_ONE",
      "still not valid json SECRET_REJECTED_TWO",
    ];
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      rejectedOutputs.map((output) => ({ output })),
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext())).rejects.toMatchObject({
      code: "agent_orchestration_failed",
    });

    expect(state.status).toBe("error");
    expect(state.run.status).toBe("error");
    expect(state.diff).toBeUndefined();
    expect(state.events.some((event) => event.type === "diff_ready")).toBe(false);
    expect(state.events.some((event) => event.type === "step_failed")).toBe(true);
    expect(requests).toHaveLength(3);
    expect(requests[2]?.input).toMatchObject({
      generationRetry: { reason: "malformed_json" },
    });
    const serializedEvents = JSON.stringify(state.events);
    expect(serializedEvents).toContain("retry (malformed JSON)");
    expect(serializedEvents).not.toContain("SECRET_REJECTED_ONE");
    expect(serializedEvents).not.toContain("SECRET_REJECTED_TWO");
  });

  it("materializes a messy reasoning-model search/replace response", async () => {
    const replacement = "UPDATED { \"quoted\" } with `code`";
    const modelJson = JSON.stringify({
      summary: "Update the selected marker",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: replacement }],
    });
    const output = `<think>private provider trace</think>\nHere is the result:\n\`\`\`json\n${modelJson}\n\`\`\``;
    const { orchestrator, workspace, requests } = createModelOrchestrator(output);
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(state.diff).toMatchObject({
      summary: "Update the selected marker",
      files: [{
        path: "app/login/page.tsx",
        changeType: "modify",
        before: "SELECTED_CONTEXT_MARKER",
        after: replacement,
      }],
    });
    expect(requests).toHaveLength(3);
    expect(requests[1]?.systemPrompt).toContain('"after"');
    expect(requests[1]?.systemPrompt).toContain("Return exactly one JSON object");
    const serializedEvents = JSON.stringify(state.events);
    expect(serializedEvents).not.toContain("private provider trace");
    expect(serializedEvents).not.toContain("SELECTED_CONTEXT_MARKER");
    expect(serializedEvents).not.toContain(replacement);
  });

  it("materializes generate-proposal JSON delivered only in provider reasoning", async () => {
    const modelJson = JSON.stringify({
      summary: "Update the selected marker",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "REASONING_ONLY_MARKER" }],
    });
    const { orchestrator, workspace } = createModelOrchestrator({
      output: "",
      reasoning: modelJson,
    });
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(state.diff?.files[0]).toMatchObject({
      before: "SELECTED_CONTEXT_MARKER",
      after: "REASONING_ONLY_MARKER",
    });
  });

  it("uses valid generate-proposal JSON from reasoning when output JSON has the wrong shape", async () => {
    const modelJson = JSON.stringify({
      summary: "Update the selected marker",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "REASONING_FALLBACK_MARKER" }],
    });
    const wrongShape = JSON.stringify({
      path: "app/login/page.tsx",
      objective: "Wrong shape object in answer output",
      targetDescription: "Not a diff payload",
      anchors: ["selected login marker"],
      constraints: ["Keep the change inside the selected file"],
      acceptanceCriteria: ["The requested login behavior is updated"],
      rationale: "This is a locate-plan shape, not generate diff.",
    });
    const { orchestrator, workspace } = createModelOrchestrator({
      output: wrongShape,
      reasoning: modelJson,
    });
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(state.diff?.files[0]).toMatchObject({
      before: "SELECTED_CONTEXT_MARKER",
      after: "REASONING_FALLBACK_MARKER",
    });
  });

  it("retries malformed output once and stores only the valid materialized diff", async () => {
    const valid = JSON.stringify({
      summary: "Retry succeeded",
      path: "app/login/page.tsx",
      edits: [{
        search: "SELECTED_CONTEXT_MARKER",
        replace: "RETRIED_CONTEXT_MARKER",
      }],
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator([
      { output: "malformed SECRET_FIRST_ATTEMPT" },
      { output: valid },
    ]);
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(requests).toHaveLength(4);
    expect(requests[2]?.input).toMatchObject({
      generationRetry: { reason: "malformed_json" },
    });
    expect(JSON.stringify(requests[2]?.input)).not.toContain("SECRET_FIRST_ATTEMPT");
    expect(state.diff?.files[0]).toMatchObject({
      before: "SELECTED_CONTEXT_MARKER",
      after: "RETRIED_CONTEXT_MARKER",
    });
    expect(state.events.filter((event) => event.type === "diff_ready")).toHaveLength(1);
  });

  it("rejects a modify proposal whose materialized UTF-8 output exceeds the file cap", async () => {
    const oversized = "x".repeat(CREATE_FILE_MAX_BYTES + 1);
    const output = JSON.stringify({
      summary: "Oversized replacement",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: oversized }],
    });
    const { orchestrator, workspace } = createModelOrchestrator(output);
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .rejects.toMatchObject({
        code: "agent_orchestration_failed",
        details: { lastFailureCategory: "output_too_large" },
      });
    expect(state.diff).toBeUndefined();
  });

  it("retries a truncated generate-proposal response with a larger token allowance", async () => {
    const valid = JSON.stringify({
      summary: "Truncation retry succeeded",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "COMPLETE_MARKER" }],
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator([
      { output: "partial", finishReason: "length" },
      { output: valid, finishReason: "stop" },
    ]);
    workspace.settings = ProjectOSSettingsSchema.parse({
      ...workspace.settings,
      execution: {
        ...workspace.settings.execution,
        thinkingDepth: "medium",
      },
    });
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(requests.map((request) => request.maxOutputTokens)).toEqual([4096, 8192, 16_384, 4096]);
    expect(requests[1]?.thinkingDepth).toBe("off");
    expect(requests[2]?.thinkingDepth).toBe("off");
    expect(requests[2]?.input).toMatchObject({
      generationRetry: { reason: "response_truncated" },
    });
    expect(state.diff?.files[0]?.after).toBe("COMPLETE_MARKER");
  });

  it("retries a generate-proposal that echoed the after placeholder instead of source", async () => {
    const stub = JSON.stringify({
      summary: "...",
      path: "app/login/page.tsx",
      after: "<complete modified file contents>",
    });
    const valid = JSON.stringify({
      summary: "Placeholder retry succeeded",
      path: "app/login/page.tsx",
      after: "COMPLETE_MARKER",
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator([
      { output: stub, finishReason: "length" },
      { output: valid, finishReason: "stop" },
    ]);
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(requests[2]?.input).toMatchObject({
      generationRetry: { reason: "response_truncated" },
    });
    expect(state.diff?.files[0]?.after).toBe("COMPLETE_MARKER");
  });

  it("applies non-overlapping edits against the original and allows an empty replacement", async () => {
    const output = JSON.stringify({
      summary: "Edit and delete exact spans",
      path: "app/login/page.tsx",
      edits: [
        { search: "omega", replace: "" },
        { search: "alpha", replace: "A" },
      ],
    });
    const { orchestrator, workspace } = createModelOrchestrator(output);
    const bundle = localContextBundle(workspace);
    const selected = bundle.fileManifest.find((file) => file.relationship === "selected")!;
    selected.content = "alpha middle omega";
    selected.byteLength = new TextEncoder().encode(selected.content).byteLength;
    selected.includedByteLength = selected.byteLength;
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: bundle,
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(state.diff?.files[0]).toMatchObject({
      before: "alpha middle omega",
      after: "A middle ",
    });
  });

  it("keeps the bound snapshot as before and lets apply reject a concurrent edit", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "projectos-generation-stale-"));
    temporaryRoots.push(tempRoot);
    const workspaceRoot = join(tempRoot, "sample-graph-saas");
    cpSync(sampleWorkspaceRoot, workspaceRoot, { recursive: true });
    rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
    const relativePath = "app/login/page.tsx";
    const targetPath = join(workspaceRoot, relativePath);
    const original = readFileSync(targetPath, "utf8");
    const concurrent = `${original}\n// concurrent user edit\n`;
    const output = JSON.stringify({
      summary: "Generate from the bound snapshot",
      path: relativePath,
      edits: [{
        search: original,
        replace: `${original}\n// model edit\n`,
      }],
    });
    const { orchestrator, workspace } = createModelOrchestrator(
      [{
        output,
        beforeReturn: () => writeFileSync(targetPath, concurrent, "utf8"),
      }],
      [],
      workspaceRoot,
    );
    const bundle = localContextBundle(workspace);
    const selected = bundle.fileManifest.find((file) => file.relationship === "selected")!;
    selected.content = original;
    selected.byteLength = new TextEncoder().encode(original).byteLength;
    selected.includedByteLength = selected.byteLength;
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: bundle,
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(state.diff?.files[0]?.before).toBe(original);
    expect(readFileSync(targetPath, "utf8")).toBe(concurrent);
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    await api.openSampleWorkspace();
    const generatedApplyApi = api as unknown as {
      commitGeneratedDiffTransaction(
        runId: string,
        diff: GeneratedDiff,
        run: typeof state.run,
      ): Promise<unknown>;
    };
    await expect(generatedApplyApi.commitGeneratedDiffTransaction(
      state.run.runId,
      state.diff!,
      state.run,
    )).rejects.toMatchObject({ code: "diff_stale" });
    expect(readFileSync(targetPath, "utf8")).toBe(concurrent);
  });

  it.each([
    [
      "absent search",
      "SELECTED_CONTEXT_MARKER",
      [{ search: "MISSING_MARKER", replace: "new" }],
      "search_absent",
    ],
    [
      "ambiguous search",
      "repeat repeat",
      [{ search: "repeat", replace: "new" }],
      "search_ambiguous",
    ],
    [
      "overlapping edits",
      "abcdef",
      [
        { search: "abc", replace: "first" },
        { search: "cde", replace: "second" },
      ],
      "overlapping_edits",
    ],
    [
      "no effective change",
      "same",
      [{ search: "same", replace: "same" }],
      "no_effect",
    ],
  ])("fails closed for %s", async (_label, snapshot, edits, category) => {
    const output = JSON.stringify({
      summary: "Invalid exact edits",
      path: "app/login/page.tsx",
      edits,
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator(output);
    const bundle = localContextBundle(workspace);
    const selected = bundle.fileManifest.find((file) => file.relationship === "selected")!;
    selected.content = snapshot;
    selected.byteLength = new TextEncoder().encode(snapshot).byteLength;
    selected.includedByteLength = selected.byteLength;
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: bundle,
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .rejects.toMatchObject({
        code: "agent_orchestration_failed",
        details: {
          failureCategory: "retry_also_invalid",
          lastFailureCategory: category,
        },
      });

    expect(requests).toHaveLength(3);
    expect(state.diff).toBeUndefined();
    expect(state.events.some((event) => event.type === "diff_ready")).toBe(false);
  });

  it("reports verification as not_run without displaying a completed verify step", async () => {
    const output = JSON.stringify({
      summary: "Valid generated change",
      files: [{
        path: "app/login/page.tsx",
        changeType: "modify",
        after: "export default function Login() { return null; }\n",
      }],
    });
    const { orchestrator, workspace } = createModelOrchestrator(output);
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    const verification = state.events.find(
      (event) => event.type === "verification_completed",
    );
    expect(state.diff).toBeDefined();
    expect(verification?.payload).toEqual({ status: "not_run" });
    expect(
      state.events.some(
        (event) =>
          event.type === "verification_completed" &&
          event.payload?.status === "passed",
      ),
    ).toBe(false);
    expect(
      state.events.some(
        (event) => event.step?.kind === "verify",
      ),
    ).toBe(false);
  });

  it("rejects a connected-file modification with a scope violation and stores no diff", async () => {
    const output = JSON.stringify({
      summary: "Out-of-scope generated change",
      files: [{
        path: "lib/auth.ts",
        changeType: "modify",
        after: "export const connected = 'must not change';\n",
      }],
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator(output);
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await expect(
      orchestrator.startRun(workspace, state.run.runId, toolContext()),
    ).rejects.toMatchObject({
      code: "diff_scope_violation",
      details: { failureCategory: "wrong_path_or_scope" },
    });

    expect(state.status).toBe("error");
    expect(state.run.status).toBe("error");
    expect(state.diff).toBeUndefined();
    expect(state.events.some((event) => event.type === "diff_ready")).toBe(false);
    expect(state.events.some((event) =>
      event.type === "step_failed" &&
      JSON.stringify(event).includes("wrong path or scope"),
    )).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("ignores configured stepSequence and runs only the server-defined live phases", async () => {
    const output = JSON.stringify({
      summary: "Scoped request trace",
      files: [{
        path: "app/login/page.tsx",
        changeType: "modify",
        after: "export default function Login() { return null; }\n",
      }],
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      output,
      ["understand", "retrieve_context", "plan", "generate_diff", "verify"],
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(requests).toHaveLength(3);
    expect(state.events.filter((event) => event.type === "model_request")).toHaveLength(3);
    expect(
      state.events
        .filter((event) => event.type === "step_started")
        .map((event) => event.step?.kind),
    ).toEqual(["context_prepared", "locate_plan", "generate_proposal", "validate_proposal"]);
    expect(
      state.events.find(
        (event) => event.type === "step_started" &&
          event.step?.kind === "generate_proposal",
      )?.step?.relatedFiles,
    ).toEqual(["app/login/page.tsx"]);
    expect(
      state.events
        .filter((event) => event.type === "step_completed")
        .map((event) => event.step?.kind),
    ).toEqual(["context_prepared", "locate_plan", "generate_proposal", "validate_proposal"]);
    expect(state.run.status).toBe("awaiting_review");
  });

  it("runs locate and edit as distinct model phases and binds actions to their real phase", async () => {
    const output = JSON.stringify({
      summary: "Apply the planned login update",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "PLANNED_CONTEXT_MARKER" }],
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator(output);
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(requests).toHaveLength(3);
    expect(requests[0]?.input).toMatchObject({ mode: "locate_plan", writeCapability: false });
    expect(requests[1]?.input).toMatchObject({
      fileEditPlan: {
        path: "app/login/page.tsx",
        objective: "Update the selected login behavior",
        targetDescription: "The exact selected marker in the login page",
      },
    });
    const steps = state.events
      .filter((event) => event.type === "step_started")
      .map((event) => event.step!);
    expect(steps.map((step) => step.kind)).toEqual([
      "context_prepared",
      "locate_plan",
      "generate_proposal",
      "validate_proposal",
    ]);
    const locateStep = steps[1]!;
    const generateStep = steps[2]!;
    expect(state.events.find((event) => event.type === "edit_plan_created")).toMatchObject({
      phaseId: locateStep.id,
      payload: {
        path: "app/login/page.tsx",
        objective: "Update the selected login behavior",
        anchors: ["selected login marker"],
        acceptanceCriteria: ["The requested login behavior is updated"],
        rationale: "The selected file directly owns the requested behavior.",
        changeRequired: true,
      },
    });
    expect(state.events.filter((event) => event.type === "model_request")).toEqual([
      expect.objectContaining({ phaseId: locateStep.id, payload: expect.objectContaining({ stage: "locate" }) }),
      expect.objectContaining({ phaseId: generateStep.id, payload: expect.objectContaining({ stage: "edit" }) }),
      expect.objectContaining({ payload: expect.objectContaining({ stage: "validate" }) }),
    ]);
    expect(state.events.find((event) => event.type === "decision_summary")?.phaseId)
      .toBe(generateStep.id);
    expect(state.events.find((event) => event.type === "diff_proposed")?.phaseId)
      .toBe(generateStep.id);
    expect(() => orchestrator.requireValidatedProposal(state.run.runId, state.diff!))
      .not.toThrow();
    expect(() => orchestrator.requireValidatedProposal(state.run.runId, {
      ...state.diff!,
      summary: "Mutated after validation",
    })).toThrowError(expect.objectContaining({ code: "proposal_validation_failed" }));
    expect(JSON.stringify(state.events)).not.toContain("constraints");
    expect(JSON.stringify(state.events)).not.toContain("targetDescription");
  });

  it("completes a modify run without generating a diff when the locate plan marks changeRequired false", async () => {
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      JSON.stringify({
        summary: "should not be used",
        path: "app/login/page.tsx",
        edits: [{ search: "unused", replace: "unused" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{
        output: validFileEditPlanOutput({
          changeRequired: false,
          rationale: "The selected file already satisfies every acceptance criterion.",
        }),
      }],
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toMatchObject({ mode: "locate_plan", writeCapability: false });
    expect(
      state.events
        .filter((event) => event.type === "step_started")
        .map((event) => event.step?.kind),
    ).toEqual(["context_prepared", "locate_plan", "generate_proposal", "validate_proposal"]);
    expect(
      state.events
        .filter((event) => event.type === "step_completed")
        .map((event) => event.step?.kind),
    ).toEqual(["context_prepared", "locate_plan", "generate_proposal", "validate_proposal"]);
    expect(state.events.some((event) => event.type === "diff_ready")).toBe(false);
    expect(state.run.status).toBe("complete");
    expect(state.diff?.files[0]).toMatchObject({
      path: "app/login/page.tsx",
      changeType: "modify",
      before: expect.any(String),
      after: expect.any(String),
    });
    expect(state.diff?.files[0]?.before).toBe(state.diff?.files[0]?.after);
    expect(state.validationResult?.verdict).toBe("valid");
    expect(
      state.events.find((event) => event.type === "run_completed")?.payload,
    ).toMatchObject({ outcome: "no_change_required" });
  });

  it("retries an invalid locate plan once without echoing the rejected response", async () => {
    const output = JSON.stringify({
      summary: "Use the recovered plan",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "RECOVERED_MARKER" }],
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      output,
      [],
      sampleWorkspaceRoot,
      [
        { output: "not-json SECRET_REJECTED_PLAN" },
        { output: validFileEditPlanOutput() },
      ],
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(requests).toHaveLength(4);
    expect(requests[1]?.input).toMatchObject({
      planRetry: { reason: "malformed_json" },
    });
    expect(JSON.stringify(requests[1])).not.toContain("SECRET_REJECTED_PLAN");
    expect(JSON.stringify(state.events)).not.toContain("SECRET_REJECTED_PLAN");
    expect(state.diff?.files[0]?.after).toBe("RECOVERED_MARKER");
  });

  it("fails the locate phase after two invalid plans and never generates a diff", async () => {
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      JSON.stringify({
        summary: "Must never be requested",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "UNREACHABLE" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: "bad-plan-one" }, { output: "bad-plan-two" }],
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .rejects.toMatchObject({
        code: "agent_orchestration_failed",
        details: {
          failureCategory: "retry_also_invalid",
          lastFailureCategory: "malformed_json",
        },
      });

    expect(requests).toHaveLength(2);
    expect(state.diff).toBeUndefined();
    expect(state.events.filter((event) => event.type === "model_request").map((event) =>
      event.payload?.stage,
    )).toEqual(["locate", "locate"]);
    expect(state.events.find((event) => event.type === "step_failed")?.step?.kind)
      .toBe("locate_plan");
    expect(state.events.some((event) => event.type === "edit_plan_created")).toBe(false);
  });

  it("rejects a locate plan for another path without retrying or generating", async () => {
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      "unused generation response",
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput({ path: "lib/auth.ts" }) }],
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .rejects.toMatchObject({
        code: "diff_scope_violation",
        details: { failureCategory: "wrong_path_or_scope" },
      });

    expect(requests).toHaveLength(1);
    expect(state.diff).toBeUndefined();
    expect(state.events.some((event) => event.type === "edit_plan_created")).toBe(false);
  });

  it("keeps provider reasoning in the transient channel and out of durable events", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "projectos-transient-reasoning-"));
    temporaryRoots.push(tempRoot);
    const workspaceRoot = join(tempRoot, "sample-graph-saas");
    cpSync(sampleWorkspaceRoot, workspaceRoot, { recursive: true });
    rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
    const output = JSON.stringify({
      summary: "Reasoned scoped update",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "REASONED_MARKER" }],
    });
    const { orchestrator, workspace } = createModelOrchestrator(
      [{ output, reasoning: "Generate safely with Bearer edit-secret" }],
      [],
      workspaceRoot,
      [{
        output: validFileEditPlanOutput(),
        reasoning: "Locate safely with Bearer locate-secret",
      }],
      "filesystem",
      [{
        output: validProposalValidationOutput(),
        reasoning: "Validate safely with Bearer validation-secret",
      }],
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });
    const received: typeof state.transientTraces = [];
    const unsubscribe = orchestrator.subscribeTransient(state.run.runId, (trace) => {
      received.push(trace);
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());
    unsubscribe();

    expect(received).toHaveLength(3);
    expect(received.map((trace) => trace.phaseId)).toEqual(
      state.events
        .filter((event) => event.type === "step_started" && [
          "locate_plan",
          "generate_proposal",
          "validate_proposal",
        ].includes(event.step?.kind ?? ""))
        .map((event) => event.step!.id),
    );
    expect(received.every((trace) => trace.type === "provider_reasoning")).toBe(true);
    expect(JSON.stringify(received)).not.toContain("locate-secret");
    expect(JSON.stringify(received)).not.toContain("edit-secret");
    expect(JSON.stringify(received)).not.toContain("validation-secret");
    const durableEvents = JSON.stringify(state.events);
    expect(durableEvents).not.toContain("provider_reasoning");
    expect(durableEvents).not.toContain("Locate safely");
    expect(durableEvents).not.toContain("Generate safely");
    expect(durableEvents).not.toContain("Validate safely");
    const persistedEvents = readFileSync(
      join(workspaceRoot, ".projectos", "agent-runs", `${state.run.runId}.jsonl`),
      "utf8",
    );
    expect(persistedEvents).not.toContain("provider_reasoning");
    expect(persistedEvents).not.toContain("Locate safely");
    expect(persistedEvents).not.toContain("Generate safely");
    expect(persistedEvents).not.toContain("Validate safely");
    const replayed: typeof state.transientTraces = [];
    orchestrator.streamExistingTransientTraces(state.run.runId, (trace) => replayed.push(trace));
    expect(replayed).toEqual(received);
  });

  it("dispatches each event to a listener snapshot under re-entrant subscription", async () => {
    const { orchestrator, workspace } = createModelOrchestrator(JSON.stringify({
      summary: "Listener snapshot",
      path: "app/login/page.tsx",
      edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "LISTENER_MARKER" }],
    }));
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });
    let firstEventId: string | undefined;
    const lateListenerEventIds: string[] = [];
    let unsubscribeLate = () => {};
    const unsubscribeFirst = orchestrator.subscribe(state.run.runId, (event) => {
      if (firstEventId) return;
      firstEventId = event.eventId;
      unsubscribeLate = orchestrator.subscribe(state.run.runId, (lateEvent) => {
        lateListenerEventIds.push(lateEvent.eventId);
      });
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());
    unsubscribeFirst();
    unsubscribeLate();

    expect(firstEventId).toBeDefined();
    expect(lateListenerEventIds).not.toContain(firstEventId);
    expect(lateListenerEventIds.length).toBeGreaterThan(0);
  });

  it("fails an empty greenfield schedule with a typed error before finalization", async () => {
    const { orchestrator, workspace } = createModelOrchestrator("unused");
    const internal = orchestrator as unknown as {
      greenfieldInitialization?: GreenfieldInitializationDependency;
      runGreenfieldInitialization(
        workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
        state: ReturnType<AgentOrchestrator["createRun"]>,
        plan: GreenfieldInitializationPlan,
      ): Promise<unknown>;
    };
    internal.greenfieldInitialization = {
      async preparePlan() { throw new Error("not reached"); },
      async createTrancheChildRuns() { throw new Error("not reached"); },
      async commitTranche() { throw new Error("not reached"); },
      async verify() { throw new Error("not reached"); },
      release() {},
    };
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await expect(internal.runGreenfieldInitialization(
      workspace,
      state,
      { tranches: [] } as unknown as GreenfieldInitializationPlan,
    )).rejects.toMatchObject({
      code: "agent_orchestration_failed",
      message: expect.stringContaining("at least one executable tranche"),
    });
  });

  it("automatically applies a validated proposal, reports failed verification, and completes", async () => {
    const calls: string[] = [];
    const automaticLeafExecution: AutomaticLeafExecutionDependency = {
      async apply(_workspace, run, diff) {
        calls.push(`apply:${diff.files[0]?.path}`);
        return {
          runId: run.runId,
          applied: true,
          filesChanged: ["app/login/page.tsx"],
          verificationStatus: "not_run",
          outcome: "applied",
          backupId: "backup-automatic",
        };
      },
      async verify(_workspace, run) {
        calls.push("verify");
        return { runId: run.runId, status: "failed", results: [] };
      },
    };
    const { orchestrator, workspace, scopeValidationCalls } = createModelOrchestrator(
      JSON.stringify({
        summary: "Automatic validated change",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "AUTOMATIC_MARKER" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput() }],
      "memory",
      [{ output: validProposalValidationOutput() }],
      automaticLeafExecution,
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
      executionPolicy: "automatic",
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(calls).toEqual(["apply:app/login/page.tsx", "verify"]);
    expect(scopeValidationCalls).toHaveLength(2);
    expect(state.run.status).toBe("complete");
    expect(state.status).toBe("complete");
    expect(state.applyResult).toMatchObject({
      applied: true,
      backupId: "backup-automatic",
      verificationStatus: "failed",
    });
    expect(state.verificationResult?.status).toBe("failed");
    expect(
      state.events.filter((event) => event.type === "step_started").map((event) =>
        event.step?.kind,
      ),
    ).toEqual([
      "context_prepared",
      "locate_plan",
      "generate_proposal",
      "validate_proposal",
      "apply_change",
      "verify_change",
    ]);
    expect(state.events.find((event) => event.type === "apply_result")).toMatchObject({
      phaseId: `${state.run.runId}_apply_change`,
      payload: { outcome: "applied", backupId: "backup-automatic" },
    });
    expect(state.events.find((event) => event.type === "verification_completed")?.payload)
      .toMatchObject({ status: "failed" });
    expect(state.events.some((event) => event.type === "step_failed")).toBe(false);
  });

  it("starts a queued run at most once when duplicate callers race", async () => {
    let applyCalls = 0;
    let verifyCalls = 0;
    const automaticLeafExecution: AutomaticLeafExecutionDependency = {
      async apply(_workspace, run) {
        applyCalls += 1;
        return {
          runId: run.runId,
          applied: true,
          filesChanged: ["app/login/page.tsx"],
          verificationStatus: "not_run",
          outcome: "applied",
          backupId: "backup-single-start",
        };
      },
      async verify(_workspace, run) {
        verifyCalls += 1;
        return { runId: run.runId, status: "passed", results: [] };
      },
    };
    const { orchestrator, workspace } = createModelOrchestrator(
      JSON.stringify({
        summary: "Apply exactly once",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "SINGLE_START_MARKER" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput() }],
      "memory",
      [{ output: validProposalValidationOutput() }],
      automaticLeafExecution,
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
      executionPolicy: "automatic",
    });

    await Promise.all([
      orchestrator.startRun(workspace, state.run.runId, toolContext()),
      orchestrator.startRun(workspace, state.run.runId, toolContext()),
    ]);

    expect(applyCalls).toBe(1);
    expect(verifyCalls).toBe(1);
    expect(state.events.filter((event) => event.type === "run_started")).toHaveLength(1);
    expect(state.events.filter((event) => event.type === "apply_result")).toHaveLength(1);
  });

  it.each(["delete", "clear-project"] as const)(
    "cancels in-flight model work on %s and never reaches apply",
    async (mode) => {
      let applyCalls = 0;
      let cancelRun = () => {};
      const automaticLeafExecution: AutomaticLeafExecutionDependency = {
        async apply() {
          applyCalls += 1;
          throw new Error("cancelled work must not apply");
        },
        async verify(_workspace, run) {
          return { runId: run.runId, status: "not_run", results: [] };
        },
      };
      const { orchestrator, workspace } = createModelOrchestrator(
        JSON.stringify({
          summary: "Cancelled proposal",
          path: "app/login/page.tsx",
          edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "MUST_NOT_APPLY" }],
        }),
        [],
        sampleWorkspaceRoot,
        [{
          output: validFileEditPlanOutput(),
          beforeReturn: () => cancelRun(),
        }],
        "memory",
        [{ output: validProposalValidationOutput() }],
        automaticLeafExecution,
      );
      const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
        localContext: localContextBundle(workspace),
        executionPolicy: "automatic",
      });
      cancelRun = mode === "delete"
        ? () => orchestrator.deleteRun(state.run.runId)
        : () => orchestrator.clearProjectRuns(workspace.project.projectId);

      await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
        .resolves.toBeUndefined();

      expect(applyCalls).toBe(0);
      expect(orchestrator.getRun(state.run.runId)).toBeUndefined();
    },
  );

  it("uses UUID-backed run, event, and transient-trace identifiers", async () => {
    const { orchestrator, workspace } = createModelOrchestrator(
      [{
        output: JSON.stringify({
          summary: "UUID proposal",
          path: "app/login/page.tsx",
          edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "UUID_MARKER" }],
        }),
        reasoning: "Generate with a unique trace",
      }],
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput(), reasoning: "Locate with a unique trace" }],
      "memory",
      [{ output: validProposalValidationOutput(), reasoning: "Validate with a unique trace" }],
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
    expect(state.run.runId).toMatch(new RegExp(`^run_${uuid}$`, "i"));
    expect(state.events.every((event) =>
      new RegExp(`^evt_${uuid}$`, "i").test(event.eventId)
    )).toBe(true);
    expect(state.transientTraces.every((trace) =>
      new RegExp(`^trace_${uuid}$`, "i").test(trace.traceId)
    )).toBe(true);
    expect(new Set(state.events.map((event) => event.eventId)).size).toBe(state.events.length);
    expect(new Set(state.transientTraces.map((trace) => trace.traceId)).size)
      .toBe(state.transientTraces.length);
  });

  it("bounds event replay and evicts the oldest terminal run histories", () => {
    const { orchestrator, workspace } = createModelOrchestrator("unused");
    const active = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
    });
    for (let index = 0; index < 600; index += 1) {
      orchestrator.recordVerificationResult(
        workspace,
        active.run.runId,
        `check-${index}`,
        "passed",
      );
    }
    expect(active.events).toHaveLength(512);

    const terminalRunIds: string[] = [];
    for (let index = 0; index < 140; index += 1) {
      const state = orchestrator.createRun(workspace, {
        ...refinement(),
        id: `retention_${index}`,
      }, "feature_change", {
        localContext: localContextBundle(workspace),
      });
      terminalRunIds.push(state.run.runId);
      orchestrator.failRun(workspace, state.run.runId, new Error(`terminal-${index}`));
    }

    expect(orchestrator.getRun(terminalRunIds[0]!)).toBeUndefined();
    expect(orchestrator.getRun(terminalRunIds.at(-1)!)).toBeDefined();
    expect(orchestrator.getRun(active.run.runId)).toBe(active);
  });

  it("keeps the in-memory event prefix consistent when audit persistence fails post-commit", async () => {
    const persistedEventIds: string[] = [];
    let applyCalls = 0;
    const persistence: AgentRunEventPersistence = {
      append(_workspace, event) {
        if (event.type === "apply_result") {
          throw new Error("simulated audit disk failure");
        }
        persistedEventIds.push(event.eventId);
      },
    };
    const automaticLeafExecution: AutomaticLeafExecutionDependency = {
      async apply(_workspace, run) {
        applyCalls += 1;
        return {
          runId: run.runId,
          applied: true,
          filesChanged: ["app/login/page.tsx"],
          verificationStatus: "not_run",
          outcome: "applied",
          backupId: "backup-persistence-failure",
        };
      },
      async verify(_workspace, run) {
        return { runId: run.runId, status: "passed", results: [] };
      },
    };
    const { orchestrator, workspace } = createModelOrchestrator(
      JSON.stringify({
        summary: "Persisted-prefix proposal",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "PERSISTED_PREFIX" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput() }],
      persistence,
      [{ output: validProposalValidationOutput() }],
      automaticLeafExecution,
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
      executionPolicy: "automatic",
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .resolves.toBeUndefined();

    expect(applyCalls).toBe(1);
    expect(state.run.status).toBe("complete");
    expect(state.applyResult?.outcome).toBe("applied");
    expect(state.events.map((event) => event.eventId)).toEqual(persistedEventIds);
    expect(state.events.some((event) => event.type === "apply_result")).toBe(false);
    expect(state.events.some((event) => event.type === "run_completed")).toBe(false);
  });

  it("stops recursive leaf expansion before creating or running all over-cap descendants", async () => {
    const harness = createHierarchyBudgetHarness("leaf-cap");

    await expect(
      harness.orchestrator.startRun(harness.workspace, harness.root.run.runId),
    ).rejects.toMatchObject({ code: "agent_orchestration_failed" });

    expect(harness.counters.leafChildrenCreated).toBeLessThan(40);
    expect(harness.counters.leafChildrenCreated).toBeLessThanOrEqual(32);
    expect(harness.counters.leafRunsStarted).toBeLessThanOrEqual(32);
    expect(JSON.stringify(harness.allEvents())).toContain("32-file");
  });

  it("stops recursive planner expansion before creating all over-cap descendants", async () => {
    const harness = createHierarchyBudgetHarness("planner-cap");

    await expect(
      harness.orchestrator.startRun(harness.workspace, harness.root.run.runId),
    ).rejects.toMatchObject({ code: "agent_orchestration_failed" });

    expect(harness.counters.plannerChildrenCreated).toBeLessThan(72);
    expect(harness.counters.plannerChildrenCreated).toBeLessThanOrEqual(63);
    expect(JSON.stringify(harness.allEvents())).toContain("64-planner");
  });

  it("rejects a delegated planner whose actual scope is not deeper than its parent", async () => {
    const harness = createHierarchyBudgetHarness("misleveled-child");

    await expect(
      harness.orchestrator.startRun(harness.workspace, harness.root.run.runId),
    ).rejects.toMatchObject({ code: "agent_orchestration_failed" });

    const child = harness.allStates().find((state) => state.run.parentRunId === harness.root.run.runId);
    expect(child?.run.scope?.kind).toBe("global");
    expect(child?.run.status).toBe("queued");
    expect(JSON.stringify(harness.root.events)).toContain("strictly deeper");
  });

  it("fails closed after two malformed validator responses and never applies", async () => {
    let applyCalls = 0;
    const automaticLeafExecution: AutomaticLeafExecutionDependency = {
      async apply() {
        applyCalls += 1;
        throw new Error("must not apply");
      },
      async verify(_workspace, run) {
        return { runId: run.runId, status: "not_run", results: [] };
      },
    };
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      JSON.stringify({
        summary: "Proposal requiring validation",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "UNVALIDATED" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput() }],
      "memory",
      [
        { output: "malformed SECRET_VALIDATION_ONE" },
        { output: "still malformed SECRET_VALIDATION_TWO" },
      ],
      automaticLeafExecution,
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
      executionPolicy: "automatic",
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .rejects.toMatchObject({
        code: "proposal_validation_failed",
        details: {
          failureCategory: "retry_also_invalid",
          lastFailureCategory: "malformed_json",
        },
      });

    expect(requests).toHaveLength(4);
    expect(requests[3]?.input).toMatchObject({
      validationRetry: { reason: "malformed_json" },
    });
    expect(JSON.stringify(requests[3])).not.toContain("SECRET_VALIDATION_ONE");
    expect(JSON.stringify(state.events)).not.toContain("SECRET_VALIDATION_ONE");
    expect(JSON.stringify(state.events)).not.toContain("SECRET_VALIDATION_TWO");
    expect(applyCalls).toBe(0);
    expect(state.events.some((event) => event.type === "apply_result")).toBe(false);
    expect(state.events.some((event) => event.type === "diff_ready")).toBe(false);
  });

  it("reports a semantic validator rejection and applies nothing", async () => {
    let applyCalls = 0;
    const automaticLeafExecution: AutomaticLeafExecutionDependency = {
      async apply() {
        applyCalls += 1;
        throw new Error("must not apply");
      },
      async verify(_workspace, run) {
        return { runId: run.runId, status: "not_run", results: [] };
      },
    };
    const invalidValidation = JSON.parse(validProposalValidationOutput()) as Record<string, unknown>;
    invalidValidation.verdict = "invalid";
    invalidValidation.criteria = [{
      criterion: "The requested login behavior is updated",
      status: "unsatisfied",
      explanation: "The proposal does not meet the requested outcome.",
    }];
    const { orchestrator, workspace } = createModelOrchestrator(
      JSON.stringify({
        summary: "Rejected change",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "REJECTED_MARKER" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput() }],
      "memory",
      [{ output: JSON.stringify(invalidValidation) }],
      automaticLeafExecution,
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
      executionPolicy: "automatic",
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .rejects.toMatchObject({ code: "proposal_validation_failed" });

    expect(applyCalls).toBe(0);
    expect(state.validationResult?.verdict).toBe("invalid");
    expect(state.events.find((event) => event.type === "proposal_validation_result"))
      .toMatchObject({ payload: { verdict: "invalid" } });
    expect(state.events.some((event) => event.type === "apply_result")).toBe(false);
  });

  it("accepts validation when criteria and scope evidence are valid despite an inconsistent top-level verdict", async () => {
    const automaticLeafExecution: AutomaticLeafExecutionDependency = {
      async apply(_workspace, run) {
        return {
          runId: run.runId,
          applied: true,
          filesChanged: ["app/login/page.tsx"],
          verificationStatus: "not_run",
          outcome: "applied",
          backupId: "backup-inconsistent-verdict",
        };
      },
      async verify(_workspace, run) {
        return { runId: run.runId, status: "not_run", results: [] };
      },
    };
    const inconsistentValidation = validProposalValidationOutput({ verdict: "invalid" });
    const { orchestrator, workspace } = createModelOrchestrator(
      JSON.stringify({
        summary: "Accepted change",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "ACCEPTED_MARKER" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput() }],
      "memory",
      [{ output: inconsistentValidation }],
      automaticLeafExecution,
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
      executionPolicy: "automatic",
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(state.validationResult?.verdict).toBe("valid");
    expect(state.events.find((event) => event.type === "proposal_validation_result"))
      .toMatchObject({ payload: { verdict: "valid" } });
    expect(state.events.some((event) => event.type === "diff_ready")).toBe(true);
  });

  it("rejects validator scope expansion without retrying or applying", async () => {
    let applyCalls = 0;
    const automaticLeafExecution: AutomaticLeafExecutionDependency = {
      async apply() {
        applyCalls += 1;
        throw new Error("must not apply");
      },
      async verify(_workspace, run) {
        return { runId: run.runId, status: "not_run", results: [] };
      },
    };
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      JSON.stringify({
        summary: "Scoped proposal",
        path: "app/login/page.tsx",
        edits: [{ search: "SELECTED_CONTEXT_MARKER", replace: "SCOPED_MARKER" }],
      }),
      [],
      sampleWorkspaceRoot,
      [{ output: validFileEditPlanOutput() }],
      "memory",
      [{ output: validProposalValidationOutput({ path: "lib/auth.ts" }) }],
      automaticLeafExecution,
    );
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: localContextBundle(workspace),
      executionPolicy: "automatic",
    });

    await expect(orchestrator.startRun(workspace, state.run.runId, toolContext()))
      .rejects.toMatchObject({
        code: "diff_scope_violation",
        details: { failureCategory: "wrong_path_or_scope" },
      });

    expect(requests).toHaveLength(3);
    expect(applyCalls).toBe(0);
    expect(state.events.some((event) => event.type === "apply_result")).toBe(false);
  });

  it("feeds exact and connected bundle content to final generation and summarizes it in context steps", async () => {
    const output = JSON.stringify({
      summary: "Scoped generated change",
      files: [{
        path: "app/login/page.tsx",
        changeType: "modify",
        after: "export default function Login() { return 'updated'; }\n",
      }],
    });
    const { orchestrator, workspace, requests } = createModelOrchestrator(
      output,
      ["retrieve_context", "inspect_files"],
    );
    const bundle = localContextBundle(workspace);
    bundle.responseLanguage = "zh";
    const state = orchestrator.createRun(workspace, refinement(), "feature_change", {
      localContext: bundle,
    });

    await orchestrator.startRun(workspace, state.run.runId, toolContext());

    expect(state.diff?.files).toEqual([
      expect.objectContaining({
        path: "app/login/page.tsx",
        changeType: "modify",
        before: "SELECTED_CONTEXT_MARKER",
        after: "export default function Login() { return 'updated'; }\n",
      }),
    ]);
    expect(requests).toHaveLength(3);
    const generationRequest = requests[1]!;
    expect(generationRequest.systemPrompt).toContain(
      "You may modify exactly one file: app/login/page.tsx",
    );
    expect(generationRequest.systemPrompt).toContain(
      "Connected files are context-only and must not be changed",
    );
    expect(generationRequest.systemPrompt).toContain(
      "untrusted <project_metadata> data boundary",
    );
    expect(generationRequest.systemPrompt).toContain("Respond in zh");
    expect(generationRequest.input).toMatchObject({
      localContext: {
        scope: { selectedFilePath: "app/login/page.tsx" },
        fileManifest: expect.arrayContaining([
          expect.objectContaining({
            path: "app/login/page.tsx",
            content: "SELECTED_CONTEXT_MARKER",
          }),
          expect.objectContaining({
            path: "lib/auth.ts",
            content: "CONNECTED_CONTEXT_MARKER",
          }),
        ]),
      },
    });
    const summaries = state.events
      .filter((event) => event.type === "step_completed")
      .map((event) => event.step?.outputSummary ?? "");
    expect(summaries.join("\n")).toContain("lib/auth.ts: exact, supporting");
    expect(
      state.events
        .filter((event) => event.type === "step_completed")
        .map((event) => event.step?.kind),
    ).toEqual(["context_prepared", "locate_plan", "generate_proposal", "validate_proposal"]);

    const actionTypes = state.events
      .filter((event) => event.type.endsWith("_result") || [
        "context_assembled",
        "file_read",
        "model_request",
        "edit_plan_created",
        "decision_summary",
        "diff_proposed",
      ].includes(event.type))
      .map((event) => event.type);
    expect(actionTypes).toEqual([
      "context_assembled",
      "model_request",
      "edit_plan_created",
      "model_request",
      "decision_summary",
      "diff_proposed",
      "model_request",
      "proposal_validation_result",
      "verification_result",
    ]);
    expect(state.events.filter((event) => event.type === "model_request").map((event) =>
      event.payload?.stage,
    )).toEqual(["locate", "edit", "validate"]);
    expect(state.events.find((event) => event.type === "model_request")?.payload).toEqual({
      stage: "locate",
      provider: "test",
      model: "test-model",
      durationMs: 1,
      status: "ok",
      tokenUsage: { input: 1, output: 1 },
    });
    expect(state.events.find((event) => event.type === "context_assembled")?.payload)
      .toMatchObject({
        childrenCoverage: {
          totalCount: 0,
          includedCount: 0,
          omittedCount: 0,
        },
      });
    const serializedEvents = JSON.stringify(state.events);
    expect(serializedEvents).not.toContain("SELECTED_CONTEXT_MARKER");
    expect(serializedEvents).not.toContain("CONNECTED_CONTEXT_MARKER");
    expect(serializedEvents).not.toContain("return 'updated'");
    expect(validateAgentRunEventSequence(state.events)).toEqual([]);

    orchestrator.recordApplyResult(workspace, state.run.runId, {
      runId: state.run.runId,
      applied: true,
      filesChanged: ["app/login/page.tsx"],
      verificationStatus: "not_run",
      outcome: "applied",
      backupId: "backup-test",
    });
    expect(state.events.at(-1)).toMatchObject({
      type: "apply_result",
      payload: {
        filesWritten: ["app/login/page.tsx"],
        backupId: "backup-test",
        outcome: "applied",
      },
    });
    expect(validateAgentRunEventSequence(state.events)).toEqual([]);
  });
});

function createModelOrchestrator(
  output: string | StubModelResponse | StubModelResponse[],
  stepSequence: AgentFlowStepKind[] = [],
  workspaceRoot = sampleWorkspaceRoot,
  planResponses: StubModelResponse[] = [{ output: validFileEditPlanOutput() }],
  eventPersistence: AgentRunEventPersistence = "memory",
  validationResponses: StubModelResponse[] = [{ output: validProposalValidationOutput() }],
  automaticLeafExecution?: AutomaticLeafExecutionDependency,
) {
  const workspace = new ProjectOSWorkspaceStore().loadWorkspace(workspaceRoot);
  workspace.settings = ProjectOSSettingsSchema.parse({
    ...workspace.settings,
    execution: {
      ...workspace.settings.execution,
      mode: "model",
      defaultAgentProfileId: "default-feature",
      defaultModelProfileId: "test-model",
      thinkingDepth: "off",
    },
    modelProfiles: [{
      id: "test-model",
      name: "Test Model",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "test-model",
      baseUrl: "https://example.invalid",
      apiKeyRef: "model_profile:test-model",
      isDefault: true,
    }],
    agentProfiles: workspace.settings.agentProfiles.map((profile) =>
      profile.id === "default-feature"
        ? { ...profile, modelProfileId: "test-model", enabledTools: [], stepSequence }
        : profile,
    ),
  });
  const secretStore = new InMemorySecretStore();
  const requests: ModelGatewayRequest[] = [];
  const scopeValidationCalls: GeneratedDiff[] = [];
  const generationResponses = typeof output === "string"
    ? [{ output }]
    : Array.isArray(output)
      ? output
      : [output];
  let planResponseIndex = 0;
  let generationResponseIndex = 0;
  let validationResponseIndex = 0;
  const gateway = {
    async complete(_profile: unknown, request: ModelGatewayRequest) {
      requests.push(request);
      const mode = isRecord(request.input) && typeof request.input.mode === "string"
        ? request.input.mode
        : undefined;
      const selected = mode === "locate_plan"
        ? planResponses[Math.min(planResponseIndex++, planResponses.length - 1)]!
        : mode === "validate_proposal"
          ? validationResponses[
              Math.min(validationResponseIndex++, validationResponses.length - 1)
            ]!
          : generationResponses[
              Math.min(generationResponseIndex++, generationResponses.length - 1)
            ]!;
      selected.beforeReturn?.();
      return {
        requestId: "req_test",
        provider: "test",
        model: "test-model",
        output: selected.output,
        ...(selected.finishReason ? { finishReason: selected.finishReason } : {}),
        ...(selected.reasoning ? { reasoning: selected.reasoning } : {}),
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
  } as unknown as ModelGateway;
  const orchestrator = new AgentOrchestrator({
    gateway,
    settingsService: new SettingsService(secretStore),
    eventPersistence,
    validateGeneratedDiffScope(runId, diff) {
      scopeValidationCalls.push(diff);
      const file = diff.files[0];
      if (
        diff.runId !== runId ||
        diff.files.length !== 1 ||
        file?.changeType !== "modify" ||
        file.path !== "app/login/page.tsx"
      ) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Generated diff for run '${runId}' violates its bound scope`,
        );
      }
    },
    ...(automaticLeafExecution ? { automaticLeafExecution } : {}),
  });
  return { orchestrator, workspace, requests, scopeValidationCalls };
}

type HierarchyBudgetHarnessMode =
  | "leaf-cap"
  | "planner-cap"
  | "misleveled-child";

interface HierarchyBudgetNode {
  id: string;
  level: "context" | "container" | "component";
  children: string[];
  files: string[];
}

function createHierarchyBudgetHarness(mode: HierarchyBudgetHarnessMode) {
  const workspace = new ProjectOSWorkspaceStore().loadWorkspace(sampleWorkspaceRoot);
  workspace.settings = ProjectOSSettingsSchema.parse({
    ...workspace.settings,
    execution: {
      ...workspace.settings.execution,
      mode: "model",
      defaultAgentProfileId: "default-feature",
      defaultModelProfileId: "test-model",
      thinkingDepth: "off",
    },
    modelProfiles: [{
      id: "test-model",
      name: "Test Model",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "test-model",
      baseUrl: "https://example.invalid",
      apiKeyRef: "model_profile:test-model",
      isDefault: true,
    }],
    agentProfiles: workspace.settings.agentProfiles.map((profile) =>
      profile.id === "default-feature"
        ? { ...profile, modelProfileId: "test-model", enabledTools: [] }
        : profile,
    ),
  });

  const nodes = new Map<string, HierarchyBudgetNode>();
  const contextIds: string[] = [];
  if (mode === "leaf-cap") {
    for (let branch = 0; branch < 5; branch += 1) {
      const contextId = `budget_context_${branch}`;
      const containerId = `budget_container_${branch}`;
      const componentId = `budget_component_${branch}`;
      const files = Array.from(
        { length: 8 },
        (_, index) => `src/${componentId}/file_${index}.ts`,
      );
      contextIds.push(contextId);
      nodes.set(contextId, {
        id: contextId,
        level: "context",
        children: [containerId],
        files: [],
      });
      nodes.set(containerId, {
        id: containerId,
        level: "container",
        children: [componentId],
        files: [],
      });
      nodes.set(componentId, {
        id: componentId,
        level: "component",
        children: [],
        files,
      });
    }
  } else if (mode === "planner-cap") {
    for (let branch = 0; branch < 8; branch += 1) {
      const contextId = `budget_context_${branch}`;
      const containerIds = Array.from(
        { length: 8 },
        (_, index) => `budget_container_${branch}_${index}`,
      );
      contextIds.push(contextId);
      nodes.set(contextId, {
        id: contextId,
        level: "context",
        children: containerIds,
        files: [],
      });
      for (const containerId of containerIds) {
        nodes.set(containerId, {
          id: containerId,
          level: "container",
          children: [],
          files: [],
        });
      }
    }
  } else {
    const contextId = "budget_context_misleveled";
    contextIds.push(contextId);
    nodes.set(contextId, {
      id: contextId,
      level: "context",
      children: [],
      files: [],
    });
  }

  const counters = {
    plannerChildrenCreated: 0,
    leafChildrenCreated: 0,
    leafRunsStarted: 0,
  };
  const gateway = {
    async complete(_profile: unknown, request: ModelGatewayRequest) {
      const input = isRecord(request.input) ? request.input : {};
      const requestMode = typeof input.mode === "string" ? input.mode : undefined;
      const immediateTargets = isRecord(input.immediateTargets)
        ? input.immediateTargets
        : undefined;
      const allowedIds = Array.isArray(immediateTargets?.allowedIds)
        ? immediateTargets.allowedIds.filter((value): value is string => typeof value === "string")
        : [];
      const localContext = isRecord(input.localContext) ? input.localContext : undefined;
      const localScope = localContext && isRecord(localContext.scope)
        ? localContext.scope
        : undefined;
      const fileEditPlan = isRecord(input.fileEditPlan) ? input.fileEditPlan : undefined;
      const selectedPath = typeof localScope?.selectedFilePath === "string"
        ? localScope.selectedFilePath
        : typeof fileEditPlan?.path === "string"
          ? fileEditPlan.path
          : undefined;
      let output: string;

      if (requestMode === "plan_graph_delegation") {
        if (immediateTargets?.kind === "planner" && allowedIds.length > 0) {
          output = JSON.stringify({
            objective: "Expand the bounded synthetic hierarchy",
            tasks: allowedIds.map((nodeId) => ({
              nodeId,
              objective: `Plan ${nodeId}`,
              acceptanceCriteria: [`${nodeId} is delegated`],
            })),
            rationale: "Exercise recursive server-owned budget enforcement.",
          });
        } else if (immediateTargets?.kind === "leaf-file" && allowedIds.length > 0) {
          output = JSON.stringify({
            objective: "Prepare bounded synthetic leaf changes",
            tasks: allowedIds.map((path) => ({
              path,
              objective: `Change ${path}`,
              acceptanceCriteria: [`${path} is updated`],
            })),
            rationale: "Exercise the whole-tree leaf cap before child creation.",
          });
        } else {
          output = "invalid empty hierarchy plan";
        }
      } else if (requestMode === "locate_plan" && selectedPath) {
        counters.leafRunsStarted += 1;
        output = JSON.stringify({
          path: selectedPath,
          objective: `Change ${selectedPath}`,
          targetDescription: "The exact synthetic source marker",
          anchors: ["SOURCE_MARKER"],
          constraints: ["Modify only the authorized synthetic file"],
          acceptanceCriteria: [`${selectedPath} is updated`],
          rationale: "The synthetic leaf owns its exact marker.",
        });
      } else if (requestMode === "validate_proposal" && selectedPath) {
        const criteria = Array.isArray(fileEditPlan?.acceptanceCriteria)
          ? fileEditPlan.acceptanceCriteria.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        output = JSON.stringify({
          path: selectedPath,
          verdict: "valid",
          criteria: criteria.map((criterion) => ({
            criterion,
            status: "satisfied",
            explanation: "The exact synthetic marker was changed.",
          })),
          scopeAssessment: {
            status: "compliant",
            explanation: "Only the server-authorized synthetic file changes.",
          },
          summary: "The synthetic proposal is valid.",
          rationale: "The proposal remains within its leaf scope.",
        });
      } else if (selectedPath) {
        output = JSON.stringify({
          summary: `Change ${selectedPath}`,
          path: selectedPath,
          edits: [{
            search: `SOURCE:${selectedPath}`,
            replace: `UPDATED:${selectedPath}`,
          }],
        });
      } else {
        output = "{}";
      }
      return {
        requestId: `request_budget_${crypto.randomUUID()}`,
        provider: "test",
        model: "test-model",
        output,
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
  } as unknown as ModelGateway;

  let orchestrator: AgentOrchestrator;
  let childSequence = 0;
  const childStates: ReturnType<AgentOrchestrator["createRun"]>[] = [];
  const hierarchyDelegation: HierarchyDelegationDependency = {
    async createChildRuns(_workspace, parentRun, plan) {
      return plan.tasks.map((task) => {
        const runId = `run_budget_child_${++childSequence}`;
        const childRefinement: PromptRefinement = {
          id: `ref_budget_child_${childSequence}`,
          understood: task.objective,
          ambiguities: [],
          suggestions: [...task.acceptanceCriteria],
          affectedNodeIds: [task.nodeId],
          affectedFiles: task.targetKind === "leaf-file" ? [task.filePath] : [],
          confidence: 1,
          mode: "model",
          executionPolicy: "review_first",
        };
        if (task.targetKind === "planner") {
          counters.plannerChildrenCreated += 1;
          const node = nodes.get(task.nodeId);
          if (!node) throw new Error(`Missing synthetic planner '${task.nodeId}'`);
          const misleveled = mode === "misleveled-child" && parentRun.scope?.kind === "global";
          const scope = misleveled
            ? { kind: "global" as const }
            : { kind: task.level, nodeId: task.nodeId };
          const role = scope.kind === "global"
            ? "global" as const
            : scope.kind === "context"
              ? "context_planner" as const
              : scope.kind === "container"
                ? "container_planner" as const
                : "node_planner" as const;
          const childState = orchestrator.createRun(workspace, childRefinement, "feature_change", {
            runId,
            localContext: syntheticNodeContext(workspace, node, nodes),
            executionPolicy: "review_first",
            scope,
            parentRunId: parentRun.runId,
            rootRunId: parentRun.rootRunId ?? parentRun.runId,
            role,
          });
          childStates.push(childState);
        } else {
          counters.leafChildrenCreated += 1;
          const childState = orchestrator.createRun(workspace, childRefinement, "feature_change", {
            runId,
            localContext: syntheticLeafContext(workspace, task.nodeId, task.filePath),
            executionPolicy: "review_first",
            scope: {
              kind: "leaf-file",
              nodeId: task.nodeId,
              filePath: task.filePath,
            },
            parentRunId: parentRun.runId,
            rootRunId: parentRun.rootRunId ?? parentRun.runId,
            role: "leaf_file_editor",
          });
          childStates.push(childState);
        }
        return { taskId: task.taskId, runId, targetKind: task.targetKind };
      });
    },
  };

  orchestrator = new AgentOrchestrator({
    gateway,
    settingsService: new SettingsService(new InMemorySecretStore()),
    eventPersistence: "memory",
    validateGeneratedDiffScope(runId, diff) {
      const scope = orchestrator.getRun(runId)?.run.scope;
      if (
        scope?.kind !== "leaf-file" ||
        diff.files.length !== 1 ||
        diff.files[0]?.path !== scope.filePath
      ) {
        throw new ProjectOSError("diff_scope_violation", "Synthetic leaf escaped scope");
      }
    },
    hierarchyDelegation,
  });
  const rootRunId = `run_budget_root_${mode}`;
  const root = orchestrator.createRun(workspace, {
    ...refinement(),
    id: `ref_budget_root_${mode}`,
    understood: "Exercise recursive hierarchy budgets",
    affectedNodeIds: [],
    affectedFiles: [],
  }, "feature_change", {
    runId: rootRunId,
    executionPolicy: "review_first",
    scope: { kind: "global" },
    rootRunId,
    role: "global",
    globalContext: syntheticGlobalContext(workspace, contextIds),
  });

  return {
    orchestrator,
    workspace,
    root,
    counters,
    allStates: () => [root, ...childStates],
    allEvents: () => [root, ...childStates].flatMap((state) => state.events),
  };
}

function syntheticGlobalContext(
  workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
  contextIds: string[],
): GlobalContextBundle {
  const hash = `sha256:${"a".repeat(64)}`;
  return {
    version: "0.1.0",
    projectId: workspace.project.projectId,
    assembledAt: "2026-07-20T00:00:00.000Z",
    scope: { kind: "global" },
    responseLanguage: "und",
    projectName: workspace.project.displayName,
    conciseDescription: "Synthetic hierarchy budget fixture.",
    descriptionSource: "derived",
    analyzedAt: workspace.graph.analyzedAt,
    topLevelNodes: contextIds.map((id) => ({
      id,
      name: id,
      summary: "Synthetic context",
      level: "context" as const,
      childCount: 1,
    })),
    contextHash: hash,
    bundleHash: hash,
    allowedReadPaths: [],
    allowedWritePaths: [],
  };
}

function syntheticNodeContext(
  workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
  node: HierarchyBudgetNode,
  nodes: Map<string, HierarchyBudgetNode>,
): NodeContextBundle {
  const base = localContextBundle(workspace);
  const fileManifest = node.files.map((path) => {
    const content = `SOURCE:${path}`;
    const byteLength = new TextEncoder().encode(content).byteLength;
    return {
      path,
      relationship: "connected" as const,
      linkedRole: "primary" as const,
      disposition: "exact" as const,
      byteLength,
      sha256: `sha256:${"b".repeat(64)}`,
      includedByteLength: byteLength,
      content,
    };
  });
  return {
    version: "0.2.0",
    projectId: workspace.project.projectId,
    assembledAt: "2026-07-20T00:00:00.000Z",
    scope: { kind: "node", nodeId: node.id },
    responseLanguage: "und",
    project: base.project,
    neighborhood: {
      selected: syntheticNodeSummary(node.id),
      parent: null,
      children: node.children.map((id) => syntheticNodeSummary(nodes.get(id)?.id ?? id)),
      childrenCoverage: {
        totalCount: node.children.length,
        includedCount: node.children.length,
        omittedCount: 0,
        estimatedTokensIncluded: 0,
      },
      upstream: [],
      downstream: [],
      unresolvedNodeIds: [],
    },
    fileManifest,
    allowedReadPaths: node.files,
    allowedWritePaths: [],
    budget: {
      ...base.budget,
      selectedEstimatedTokens: 0,
      connectedEstimatedTokensIncluded: fileManifest.reduce(
        (total, file) => total + Math.ceil([...file.content].length / 4),
        0,
      ),
    },
    bundleHash: `sha256:${"c".repeat(64)}`,
  };
}

function syntheticLeafContext(
  workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
  nodeId: string,
  filePath: string,
): LocalContextBundle {
  const base = localContextBundle(workspace);
  const content = `SOURCE:${filePath}`;
  const byteLength = new TextEncoder().encode(content).byteLength;
  return {
    ...base,
    scope: { nodeId, selectedFilePath: filePath },
    neighborhood: {
      ...base.neighborhood,
      selected: syntheticNodeSummary(nodeId),
      children: [],
      childrenCoverage: {
        totalCount: 0,
        includedCount: 0,
        omittedCount: 0,
        estimatedTokensIncluded: 0,
      },
    },
    fileManifest: [{
      path: filePath,
      relationship: "selected",
      linkedRole: "primary",
      disposition: "exact",
      byteLength,
      sha256: `sha256:${"d".repeat(64)}`,
      includedByteLength: byteLength,
      content,
    }],
    allowedReadPaths: [filePath],
    allowedWritePaths: [filePath],
    budget: {
      ...base.budget,
      selectedEstimatedTokens: Math.ceil([...content].length / 4),
      connectedEstimatedTokensIncluded: 0,
    },
    bundleHash: `sha256:${"e".repeat(64)}`,
  };
}

function syntheticNodeSummary(id: string) {
  return {
    id,
    name: id,
    summary: "Synthetic hierarchy node",
    status: "active" as const,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

interface StubModelResponse {
  output: string;
  finishReason?: string;
  reasoning?: string;
  beforeReturn?: () => void;
}

function validFileEditPlanOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    path: "app/login/page.tsx",
    objective: "Update the selected login behavior",
    targetDescription: "The exact selected marker in the login page",
    anchors: ["selected login marker"],
    constraints: ["Keep the change inside the selected file"],
    acceptanceCriteria: ["The requested login behavior is updated"],
    rationale: "The selected file directly owns the requested behavior.",
    ...overrides,
  });
}

function validProposalValidationOutput(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    path: "app/login/page.tsx",
    verdict: "valid",
    criteria: [{
      criterion: "The requested login behavior is updated",
      status: "satisfied",
      explanation: "The proposal implements the requested behavior.",
    }],
    scopeAssessment: {
      status: "compliant",
      explanation: "The proposal modifies only the authorized file.",
    },
    summary: "The proposal satisfies the scoped plan.",
    rationale: "The exact edit matches the requested outcome and remains in scope.",
    ...overrides,
  });
}

function localContextBundle(
  workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
): LocalContextBundle {
  return {
    version: "0.2.0",
    projectId: workspace.project.projectId,
    assembledAt: "2026-07-18T00:00:00.000Z",
    scope: {
      nodeId: "feat_login",
      selectedFilePath: "app/login/page.tsx",
    },
    responseLanguage: "und",
    project: {
      displayName: workspace.project.displayName,
      framework: workspace.project.framework,
      description: {
        content: "A scoped login project.",
        source: "derived",
        estimatedTokens: 6,
      },
      synopsis: "A scoped login context.",
      synopsisSource: "derived_project_graph",
      graphAnalyzedAt: workspace.graph.analyzedAt,
      graphAnalysisStatus: workspace.graph.analysisStatus,
      synopsisOmittedNodeCount: 0,
    },
    neighborhood: {
      selected: {
        id: "feat_login",
        name: "Identity & Access",
        summary: "Login capability",
        status: "active",
      },
      parent: null,
      children: [],
      childrenCoverage: {
        totalCount: 0,
        includedCount: 0,
        omittedCount: 0,
        estimatedTokensIncluded: 0,
      },
      upstream: [],
      downstream: [],
      unresolvedNodeIds: [],
    },
    fileManifest: [
      {
        path: "app/login/page.tsx",
        relationship: "selected",
        linkedRole: "primary",
        disposition: "exact",
        byteLength: 23,
        sha256: `sha256:${"1".repeat(64)}`,
        includedByteLength: 23,
        content: "SELECTED_CONTEXT_MARKER",
      },
      {
        path: "lib/auth.ts",
        relationship: "connected",
        linkedRole: "supporting",
        disposition: "exact",
        byteLength: 24,
        sha256: `sha256:${"2".repeat(64)}`,
        includedByteLength: 24,
        content: "CONNECTED_CONTEXT_MARKER",
      },
    ],
    allowedReadPaths: ["app/login/page.tsx", "lib/auth.ts"],
    allowedWritePaths: ["app/login/page.tsx"],
    budget: {
      estimator: "unicode_chars_div_4_v1",
      descriptionEstimatedTokens: 6,
      selectedEstimatedTokens: 6,
      connectedTokenLimit: 8_000,
      connectedEstimatedTokensIncluded: 6,
      connectedFileLimit: 8,
    },
    bundleHash: `sha256:${"3".repeat(64)}`,
  };
}

function refinement(): PromptRefinement {
  return {
    id: "ref_test",
    understood: "Change the login page",
    ambiguities: [],
    suggestions: [],
    affectedNodeIds: ["feat_login"],
    affectedFiles: ["app/login/page.tsx"],
    confidence: 1,
    mode: "model",
  };
}

function toolContext() {
  return {
    getNodeContext: async () => {
      throw new Error("not used");
    },
    getFileContext: async () => {
      throw new Error("not used");
    },
  } as never;
}
