/**
 * Public approve→confirm regressions for the built-in model pre-generate ask gate.
 *
 * Default product path must reach a proposal without inventing a Continue
 * clarification. Diagnostic opt-in (PROJECTOS_MODEL_ASK_BEFORE_GENERATE=1) may
 * park on the waiting-decision card; answering Continue resumes the same run.
 * That env is not “model autonomously needed a question” coverage — Fake/scripted
 * /H3 requestDecision suites remain the real mid-run contract.
 *
 * Gateway is a local mock (not DeepSeek). No UI changes.
 */
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentRun } from "../contracts/agent-run.js";
import type { ModelGatewayRequest, ModelGatewayResponse } from "../contracts/model-gateway.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ModelGateway } from "./model-gateway/index.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleRoot = resolve("..", "sample-graph-saas");
const loginPath = "app/login/page.tsx";
const temporaryRoots: string[] = [];
const ENV_ASK = "PROJECTOS_MODEL_ASK_BEFORE_GENERATE";

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class LoginChangeGateway extends ModelGateway {
  generations = 0;

  constructor() {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    const mode = isRecord(request.input) && typeof request.input.mode === "string"
      ? request.input.mode
      : undefined;
    let output: string;
    if (request.requestKind === "request_intent") {
      output = JSON.stringify({
        action: "final",
        intent: {
          goal: "Change the login heading to welcome returning users.",
          kind: "change",
          touches: [{
            nodeId: "feat_login",
            reason: "Owns the login surface",
            files: [loginPath],
            allow: { editExisting: true, addParts: false, deletePartIds: [] },
          }],
          structuralProposals: [],
          assumptions: [],
          outOfScope: [],
          acceptance: ["The login heading welcomes returning users"],
          questions: [],
        },
      });
    } else if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Change the login heading to welcome returning users.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["feat_login"],
        affectedFiles: [loginPath],
        confidence: 1,
      });
    } else if (mode === "locate_plan") {
      output = JSON.stringify({
        path: loginPath,
        objective: "Welcome returning users on the login page",
        targetDescription: "The login page heading",
        anchors: ["LoginPage heading"],
        constraints: ["Modify only the authorized login page"],
        acceptanceCriteria: ["The login heading welcomes returning users"],
        rationale: "The selected page owns the visible login heading.",
      });
    } else if (mode === "validate_proposal") {
      output = JSON.stringify({
        path: loginPath,
        verdict: "valid",
        criteria: [{
          criterion: "The login heading welcomes returning users",
          status: "satisfied",
          explanation: "The proposed heading says Welcome Back.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the authorized login page changes.",
        },
        summary: "The scoped proposal meets its acceptance criterion.",
        rationale: "The exact heading replacement implements the requested outcome.",
      });
    } else {
      this.generations += 1;
      output = JSON.stringify({
        summary: "Welcome returning users on the login page",
        path: loginPath,
        edits: [{ search: "<h1>Demo access</h1>", replace: "<h1>Welcome Back</h1>" }],
      });
    }
    return {
      requestId: `ask_gate_${this.generations}`,
      provider: "test",
      model: profile.model,
      output,
      usage: { inputTokens: 8, outputTokens: 8 },
      latencyMs: 1,
    };
  }
}

function copyWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "model-ask-gate-"));
  temporaryRoots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleRoot, workspaceRoot, {
    recursive: true,
    filter: (source) => {
      const rel = relative(sampleRoot, source);
      if (rel === "") return true;
      const top = rel.split(sep)[0];
      return top !== "node_modules" && top !== ".next" && top !== ".git";
    },
  });
  rmSync(join(workspaceRoot, ".projectos", "apply-backups"), { recursive: true, force: true });
  const project = JSON.parse(
    readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8"),
  ) as { projectId: string };
  const settings = createDefaultSettings(project.projectId, false);
  settings.execution.mode = "fixture";
  settings.modelProfiles = [];
  writeFileSync(join(workspaceRoot, ".projectos", "settings.json"), JSON.stringify(settings, null, 2));
  return workspaceRoot;
}

async function enableReviewFirstModel(api: ProjectOSLocalApi, projectId: string): Promise<void> {
  await api.updateSettings(projectId, {
    presentationMode: false,
    execution: {
      mode: "model",
      defaultModelProfileId: "fixture-model",
      defaultAgentProfileId: "default-feature",
      thinkingDepth: "off",
      changeExecutionPolicy: "review_first",
    },
    modelProfiles: [{
      id: "fixture-model",
      name: "Fixture Model",
      provider: "custom",
      apiFormat: "openai_chat",
      displayName: "Fixture Model",
      model: "fixture-model",
      baseUrl: "https://example.invalid",
      apiKeyRef: "model_profile:fixture-model",
      isDefault: true,
    }],
  });
}

async function publicApproveConfirm(
  api: ProjectOSLocalApi,
  projectId: string,
): Promise<AgentRun> {
  const draft = await api.extractRequestIntent({
    projectId,
    nodeId: "feat_login",
    filePath: loginPath,
    rawRequest: "Change the login heading to welcome returning users.",
    executorSelection: { kind: "model", modelProfileId: "fixture-model" },
  });
  await api.approveRequestIntent(projectId, draft.id, draft.revision);
  const refinement = await api.prepareIntentExecution(projectId, draft.id);
  return api.confirmExecution(refinement.id);
}

async function waitForRunStatus(
  api: ProjectOSLocalApi,
  runId: string,
  status: AgentRun["status"],
  timeoutMs = 8_000,
): Promise<AgentRun> {
  const deadline = Date.now() + timeoutMs;
  let run = await api.getAgentRun(runId);
  while (run.status !== status && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    run = await api.getAgentRun(runId);
  }
  return run;
}

async function waitForPendingDecision(
  api: ProjectOSLocalApi,
  projectId: string,
  runId: string,
  timeoutMs = 6_000,
): Promise<{ id: string; revision: number; question: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listed = await api.listRunDecisions(projectId, runId);
    const hit = listed.find((entry) => entry.status === "pending");
    if (hit) {
      return { id: hit.id, revision: hit.revision, question: hit.question };
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
  }
  throw new Error(`no pending decision for ${runId}`);
}

describe("ProjectOSLocalApi model ask-before-generate gate (public approve path)", () => {
  it("default approve→confirm reaches proposal without a new pending clarification", async () => {
    const previous = process.env[ENV_ASK];
    delete process.env[ENV_ASK];
    try {
      const workspaceRoot = copyWorkspace();
      const before = readFileSync(join(workspaceRoot, loginPath), "utf8");
      const gateway = new LoginChangeGateway();
      const api = new ProjectOSLocalApi({
        sampleWorkspaceRoot: workspaceRoot,
        localContextAssembler: new LocalContextAssembler(),
        modelGateway: gateway,
        runEventPersistence: "memory",
      });
      const project = await api.openSampleWorkspace();
      await enableReviewFirstModel(api, project.projectId);

      const run = await publicApproveConfirm(api, project.projectId);
      const finished = await waitForRunStatus(api, run.runId, "awaiting_review");
      expect(finished.status).toBe("awaiting_review");
      expect(gateway.generations).toBeGreaterThanOrEqual(1);

      const decisions = await api.listRunDecisions(project.projectId, run.runId);
      expect(decisions.filter((entry) => entry.status === "pending")).toEqual([]);
      expect(decisions.some((entry) =>
        /Continue generating the authorized edit/i.test(entry.question)
      )).toBe(false);

      const diff = await api.getDiff(run.runId);
      expect(diff.files).toEqual([
        expect.objectContaining({ path: loginPath, changeType: "modify" }),
      ]);
      expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(before);
    } finally {
      if (previous === undefined) delete process.env[ENV_ASK];
      else process.env[ENV_ASK] = previous;
    }
  });

  it("opt-in ask parks before generate; Continue resumes same-run proposal without prior write", async () => {
    const previous = process.env[ENV_ASK];
    process.env[ENV_ASK] = "1";
    try {
      const workspaceRoot = copyWorkspace();
      const before = readFileSync(join(workspaceRoot, loginPath), "utf8");
      const gateway = new LoginChangeGateway();
      const api = new ProjectOSLocalApi({
        sampleWorkspaceRoot: workspaceRoot,
        localContextAssembler: new LocalContextAssembler(),
        modelGateway: gateway,
        runEventPersistence: "memory",
        pipelineBudget: { maxWallClockMs: 20_000 },
      });
      const project = await api.openSampleWorkspace();
      await enableReviewFirstModel(api, project.projectId);

      const run = await publicApproveConfirm(api, project.projectId);
      const pending = await waitForPendingDecision(api, project.projectId, run.runId);
      expect(pending.question).toMatch(/Continue generating the authorized edit/i);
      expect(gateway.generations).toBe(0);
      expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(before);
      expect((await api.getAgentRun(run.runId)).status).toBe("running");

      await api.resolveRunDecision(
        project.projectId,
        pending.id,
        pending.revision,
        { optionId: "continue" },
      );

      const finished = await waitForRunStatus(api, run.runId, "awaiting_review");
      expect(finished.status).toBe("awaiting_review");
      expect(gateway.generations).toBeGreaterThanOrEqual(1);
      expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(before);

      const answered = await api.listRunDecisions(project.projectId, run.runId);
      expect(answered.some((entry) =>
        entry.id === pending.id && entry.status === "resolved"
      )).toBe(true);
      const diff = await api.getDiff(run.runId);
      expect(diff.files[0]).toMatchObject({ path: loginPath, changeType: "modify" });
    } finally {
      if (previous === undefined) delete process.env[ENV_ASK];
      else process.env[ENV_ASK] = previous;
    }
  });
});
