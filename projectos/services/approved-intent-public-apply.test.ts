/**
 * Real approved-intent → orchestrator → validated proposal → public apply.
 *
 * Contract note: feature_change apply without an orchestrator run fails closed
 * at the publication boundary (`run_not_found`). That is intentional (R1), not a
 * fixture hole to widen. Demo kind remains the demo-scenario exception.
 *
 * Gateway here is a controllable local mock matching agent_step locate/generate/
 * validate contracts. It is NOT a real DeepSeek/model call (gateway real +0).
 *
 * Forbidden in this file: spy/noop of maybeStartPendingOrchestratorRun; private
 * injection of approvedIntent / validationResult onto runs.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultSettings } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import type {
  ModelGatewayRequest,
  ModelGatewayResponse,
} from "../contracts/model-gateway.js";
import { ModelGateway } from "./model-gateway/index.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { bindExistingFileAuthorization } from "./recoverable-write-transaction.js";
import type { AgentRun } from "../contracts/agent-run.js";
import { copySampleTree } from "../test-support/copy-sample.js";

const sampleRoot = join(process.cwd(), "..", "sample-graph-saas");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function copySampleWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "approved-intent-public-apply-"));
  roots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  copySampleTree(sampleRoot, workspaceRoot);
  rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
  rmSync(join(workspaceRoot, ".projectos", "apply-backups"), { recursive: true, force: true });
  const project = JSON.parse(
    readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8"),
  ) as { projectId: string };
  const settings = createDefaultSettings(project.projectId, false);
  settings.execution.mode = "fixture";
  settings.modelProfiles = [];
  writeFileSync(
    join(workspaceRoot, ".projectos", "settings.json"),
    JSON.stringify(settings, null, 2),
    "utf8",
  );
  return workspaceRoot;
}

function sideEffectSnapshot(workspaceRoot: string): {
  login: string;
  auth: string;
  currentWork: string;
  backup: boolean;
  backupListing: string;
} {
  const backupRoot = join(workspaceRoot, ".projectos", "apply-backups");
  const backup = existsSync(backupRoot);
  return {
    login: readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8"),
    auth: readFileSync(join(workspaceRoot, "lib/auth.ts"), "utf8"),
    currentWork: readFileSync(join(workspaceRoot, ".projectos", "current-work.json"), "utf8"),
    backup,
    backupListing: backup
      ? readdirSync(backupRoot, { recursive: true }).map(String).sort().join("\n")
      : "",
  };
}

function authorizationSnapshot(api: ProjectOSLocalApi): Array<{
  runId: string;
  modify: string | null;
  fixture: string[];
}> {
  const current = api as unknown as {
    boundRunAuthorizations: Map<string, { selectedFilePath: string }>;
    boundFixtureDiffAuthorizations: Map<string, { files: Map<string, unknown> }>;
  };
  const runIds = new Set([
    ...current.boundRunAuthorizations.keys(),
    ...current.boundFixtureDiffAuthorizations.keys(),
  ]);
  return [...runIds].sort().map((runId) => ({
    runId,
    modify: current.boundRunAuthorizations.get(runId)?.selectedFilePath ?? null,
    fixture: [...(current.boundFixtureDiffAuthorizations.get(runId)?.files.keys() ?? [])].sort(),
  }));
}

/** Controllable mock — not a real model provider. */
class ReviewFirstLoginGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor() {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
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
            files: ["app/login/page.tsx"],
            allow: { editExisting: true, addParts: false, deletePartIds: [] },
          }],
          structuralProposals: [],
          assumptions: [],
          outOfScope: ["Do not edit pricing or unrelated auth helpers"],
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
        affectedFiles: ["app/login/page.tsx"],
        confidence: 1,
      });
    } else if (mode === "locate_plan") {
      output = JSON.stringify({
        path: "app/login/page.tsx",
        objective: "Welcome returning users on the login page",
        targetDescription: "The login page heading",
        anchors: ["LoginPage heading"],
        constraints: ["Modify only the authorized login page"],
        acceptanceCriteria: ["The login heading welcomes returning users"],
        rationale: "The selected page owns the visible login heading.",
      });
    } else if (mode === "validate_proposal") {
      output = JSON.stringify({
        path: "app/login/page.tsx",
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
      output = JSON.stringify({
        summary: "Welcome returning users on the login page",
        path: "app/login/page.tsx",
        edits: [{
          search: "<h1>Demo access</h1>",
          replace: "<h1>Welcome Back</h1>",
        }],
      });
    }
    return {
      requestId: `mock_${this.requests.length}`,
      provider: "test",
      model: profile.model,
      output,
      usage: { inputTokens: 8, outputTokens: 8 },
      latencyMs: 1,
    };
  }
}

async function enableModelExecution(api: ProjectOSLocalApi, projectId: string): Promise<void> {
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
      model: "fixture-model",
      baseUrl: "https://example.invalid",
      apiKeyRef: "model_profile:fixture-model",
      isDefault: true,
    }],
  });
}

async function waitForRunStatus(
  api: ProjectOSLocalApi,
  runId: string,
  status: AgentRun["status"],
): Promise<AgentRun> {
  const deadline = Date.now() + 8_000;
  let run = await api.getAgentRun(runId);
  while (run.status !== status && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    run = await api.getAgentRun(runId);
  }
  return run;
}

/**
 * Public extract→approve→prepare→confirm with real orchestrator start.
 * Does not spy maybeStartPendingOrchestratorRun.
 */
async function startValidatedLoginChange(workspaceRoot: string): Promise<{
  api: ProjectOSLocalApi;
  projectId: string;
  run: AgentRun;
  gateway: ReviewFirstLoginGateway;
}> {
  const gateway = new ReviewFirstLoginGateway();
  const api = new ProjectOSLocalApi({
    sampleWorkspaceRoot: workspaceRoot,
    localContextAssembler: new LocalContextAssembler(),
    modelGateway: gateway,
    runEventPersistence: "memory",
  });
  const project = await api.openSampleWorkspace();
  await enableModelExecution(api, project.projectId);
  const draft = await api.extractRequestIntent({
    projectId: project.projectId,
    nodeId: "feat_login",
    filePath: "app/login/page.tsx",
    rawRequest: "Change the login heading to welcome returning users.",
    executorSelection: { kind: "model", modelProfileId: "fixture-model" },
  });
  const approved = await api.approveRequestIntent(
    project.projectId,
    draft.id,
    draft.revision,
  );
  const refinement = await api.prepareIntentExecution(project.projectId, approved.id);
  const run = await api.confirmExecution(refinement.id);
  expect(run.approvedIntent).toBeDefined();
  expect(run.kind).toBe("feature_change");
  const awaiting = await waitForRunStatus(api, run.runId, "awaiting_review");
  expect(awaiting.status).toBe("awaiting_review");
  const events = await api.getAgentRunEvents(run.runId);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: "proposal_validation_result",
      payload: expect.objectContaining({ verdict: "valid" }),
    }),
  ]));
  return { api, projectId: project.projectId, run, gateway };
}

/** Test-only: overwrite the production-bound modify target after a real run exists. */
function rebindModifyPath(
  api: ProjectOSLocalApi,
  projectId: string,
  workspaceRoot: string,
  runId: string,
  relativePath: string,
): void {
  const bound = bindExistingFileAuthorization({
    operation: "modify",
    projectId,
    nodeId: "feat_login",
    workspaceRoot,
    relativePath,
  });
  const internals = api as unknown as {
    boundRunAuthorizations: Map<string, {
      projectId: string;
      nodeId: string;
      selectedFilePath: string;
      bundleHash: string;
      allowedWriteTarget: {
        relativePath: string;
        canonicalPath: string;
        device: number;
        inode: number;
      };
    }>;
  };
  internals.boundRunAuthorizations.set(runId, {
    projectId,
    nodeId: "feat_login",
    selectedFilePath: relativePath,
    bundleHash: `sha256:${"e".repeat(64)}`,
    allowedWriteTarget: {
      relativePath: bound.relativePath,
      canonicalPath: bound.canonicalPath,
      device: bound.device,
      inode: bound.inode,
    },
  });
}

describe("approved-intent public apply (real orchestrator)", () => {
  it("legal feature_change public getDiff/apply/undo after extract→approve→prepare→confirm", async () => {
    const workspaceRoot = copySampleWorkspace();
    const before = sideEffectSnapshot(workspaceRoot);
    const { api, projectId, run, gateway } = await startValidatedLoginChange(workspaceRoot);

    expect(gateway.requests.some((request) => request.requestKind === "request_intent")).toBe(true);
    expect(gateway.requests.some((request) =>
      isRecord(request.input) && request.input.mode === "locate_plan"
    )).toBe(true);
    expect(gateway.requests.some((request) =>
      isRecord(request.input) && request.input.mode === "validate_proposal"
    )).toBe(true);

    const diff = await api.getDiff(run.runId);
    expect(diff.files).toEqual([
      expect.objectContaining({ path: "app/login/page.tsx", changeType: "modify" }),
    ]);

    const applied = await api.applyDiff(run.runId);
    expect(applied).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: ["app/login/page.tsx"],
    });
    expect(applied.backupId).toEqual(expect.any(String));
    expect(readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8"))
      .toContain("<h1>Welcome Back</h1>");
    expect((await api.getAgentRun(run.runId)).status).toBe("complete");

    await expect(api.restoreApplyBackup(projectId, applied.backupId!)).resolves.toMatchObject({
      restored: true,
      outcome: "restored",
    });
    expect(readFileSync(join(workspaceRoot, "app/login/page.tsx"), "utf8")).toBe(before.login);
  });

  it("rejects public apply before independent validation completes", async () => {
    const workspaceRoot = copySampleWorkspace();
    let releaseValidation: (() => void) | undefined;
    const validationGate = new Promise<void>((resolve) => {
      releaseValidation = resolve;
    });
    const gateway = new ReviewFirstLoginGateway();
    const baseComplete = gateway.complete.bind(gateway);
    gateway.complete = async (profile, request) => {
      const mode = isRecord(request.input) && typeof request.input.mode === "string"
        ? request.input.mode
        : undefined;
      if (mode === "validate_proposal") {
        await validationGate;
      }
      return baseComplete(profile, request);
    };
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: "app/login/page.tsx",
      rawRequest: "Change the login heading to welcome returning users.",
      executorSelection: { kind: "model", modelProfileId: "fixture-model" },
    });
    await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const refinement = await api.prepareIntentExecution(project.projectId, draft.id);
    const run = await api.confirmExecution(refinement.id);

    // Wait until a proposal exists but validation is still gated.
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const events = await api.getAgentRunEvents(run.runId);
      if (events.some((event) => event.type === "diff_proposed")) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    }
    const before = sideEffectSnapshot(workspaceRoot);
    await expect(api.applyDiff(run.runId)).rejects.toMatchObject({
      code: "proposal_validation_failed",
    });
    expect(sideEffectSnapshot(workspaceRoot)).toEqual(before);
    releaseValidation?.();
    await waitForRunStatus(api, run.runId, "awaiting_review");
  });

  it("rejects model confirmExecution when no approved intent exists", async () => {
    const workspaceRoot = copySampleWorkspace();
    const gateway = new ReviewFirstLoginGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: "app/login/page.tsx",
      rawPrompt: "Change the login heading to welcome returning users.",
    });
    const before = sideEffectSnapshot(workspaceRoot);

    await expect(api.confirmExecution(refinement.id)).rejects.toMatchObject({
      code: "diff_scope_violation",
      message: expect.stringMatching(/approved request intent/u),
    });
    expect(sideEffectSnapshot(workspaceRoot)).toEqual(before);
  });

  it("OOS public getDiff/apply after real validated run when binding is narrowed (test rebind)", async () => {
    // Boundary: run+diff come from real orchestrator; only the write-target map
    // entry is overwritten to a disagreeing path to prove public scope checks.
    const workspaceRoot = copySampleWorkspace();
    const { api, projectId, run } = await startValidatedLoginChange(workspaceRoot);
    rebindModifyPath(api, projectId, workspaceRoot, run.runId, "lib/auth.ts");
    const before = sideEffectSnapshot(workspaceRoot);
    const beforeAuth = authorizationSnapshot(api);

    await expect(api.getDiff(run.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    await expect(api.applyDiff(run.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(sideEffectSnapshot(workspaceRoot)).toEqual(before);
    expect(authorizationSnapshot(api)).toEqual(beforeAuth);
  });
});
