import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ModelGatewayRequest, ModelGatewayResponse } from "../contracts/model-gateway.js";
import { createDefaultSettings } from "../contracts/settings.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { classifyRunOutcome } from "./harness/run-outcome.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ModelGateway } from "./model-gateway/index.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleRoot = resolve("..", "sample-graph-saas");
const loginPath = "app/login/page.tsx";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("verification repair file identity", () => {
  it("reaches a second verification and restores the original input from the first backup", async () => {
    const workspaceRoot = copyWorkspace();
    const before = readFileSync(join(workspaceRoot, loginPath), "utf8");
    const gateway = new RepairGateway();
    const api = apiWithRunner(workspaceRoot, gateway, () => failedCommand());
    const project = await api.openSampleWorkspace();
    await configureAutomaticVerification(api, project.projectId);

    const run = await api.confirmExecution((await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "component_app",
      filePath: loginPath,
      rawPrompt: "Change the login heading to welcome returning users.",
    })).id);
    const finished = await waitForRunStatus(api, run.runId, "error");
    const events = await api.getAgentRunEvents(run.runId);
    const appliedBackups = events
      .filter((event) => event.type === "apply_result")
      .map((event) => event.payload.backupId)
      .filter((backupId): backupId is string => typeof backupId === "string");

    expect(finished.status).toBe("error");
    expect(classifyRunOutcome(events)).toBe("verification_failed");
    expect(gateway.generations).toBe(2);
    expect(gateway.repairs).toBe(1);
    expect(events.filter((event) => event.type === "verification_completed")).toHaveLength(2);
    expect(events.find((event) => event.type === "run_completed")?.payload).toMatchObject({
      verificationStatus: "failed",
      repair_attempt: 1,
    });
    expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toContain("<h1>Welcome again</h1>");
    expect(appliedBackups).toHaveLength(2);
    expect(backupOriginal(workspaceRoot, appliedBackups[0]!)).toBe(before);
    await expect(api.restoreApplyBackup(project.projectId, appliedBackups[1]!)).resolves.toMatchObject({
      restored: true,
      outcome: "restored",
    });
    await expect(api.restoreApplyBackup(project.projectId, appliedBackups[0]!)).resolves.toMatchObject({
      restored: true,
      outcome: "restored",
    });
    expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(before);
    expect(backupOriginal(workspaceRoot, appliedBackups[0]!)).toBe(before);
  });

  it("completes when the single repair verification passes", async () => {
    const workspaceRoot = copyWorkspace();
    const before = readFileSync(join(workspaceRoot, loginPath), "utf8");
    const gateway = new RepairGateway();
    let calls = 0;
    const api = apiWithRunner(workspaceRoot, gateway, () => {
      calls += 1;
      return calls === 1 ? failedCommand() : passedCommand();
    });
    const project = await api.openSampleWorkspace();
    await configureAutomaticVerification(api, project.projectId);

    const run = await api.confirmExecution((await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "component_app",
      filePath: loginPath,
      rawPrompt: "Change the login heading to welcome returning users.",
    })).id);
    const finished = await waitForRunStatus(api, run.runId, "complete");
    const events = await api.getAgentRunEvents(run.runId);
    const appliedBackups = events
      .filter((event) => event.type === "apply_result")
      .map((event) => event.payload.backupId)
      .filter((backupId): backupId is string => typeof backupId === "string");

    expect(finished.status).toBe("complete");
    expect(calls).toBe(2);
    expect(gateway.generations).toBe(2);
    expect(gateway.repairs).toBe(1);
    expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toContain("<h1>Welcome again</h1>");
    expect(appliedBackups).toHaveLength(2);
    expect(backupOriginal(workspaceRoot, appliedBackups[0]!)).toBe(before);
    await expect(api.restoreApplyBackup(project.projectId, appliedBackups[1]!)).resolves.toMatchObject({
      restored: true,
    });
    await expect(api.restoreApplyBackup(project.projectId, appliedBackups[0]!)).resolves.toMatchObject({
      restored: true,
    });
    expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(before);
    expect(backupOriginal(workspaceRoot, appliedBackups[0]!)).toBe(before);
  });

  it("does not adopt a file the user replaced after the first apply", async () => {
    const workspaceRoot = copyWorkspace();
    const before = readFileSync(join(workspaceRoot, loginPath), "utf8");
    const gateway = new RepairGateway();
    const userText = "user kept this edit\n";
    const api = apiWithRunner(workspaceRoot, gateway, (cwd) => {
      const target = join(cwd, loginPath);
      const replacement = `${target}.user-edit`;
      writeFileSync(replacement, userText);
      rmSync(target);
      symlinkSync(replacement, target);
      return failedCommand();
    });
    const project = await api.openSampleWorkspace();
    await configureAutomaticVerification(api, project.projectId);

    const run = await api.confirmExecution((await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "component_app",
      filePath: loginPath,
      rawPrompt: "Change the login heading to welcome returning users.",
    })).id);
    const finished = await waitForTerminal(api, run.runId);
    const events = await api.getAgentRunEvents(run.runId);
    const backups = backupIds(workspaceRoot);

    expect(finished.status).toBe("error");
    expect(events.filter((event) => event.type === "apply_result")).toHaveLength(1);
    expect(gateway.generations).toBe(2);
    expect(gateway.repairs).toBe(1);
    expect(events.some((event) =>
      event.type === "step_failed" &&
      event.step?.outputSummary?.includes("no longer matches its authorized file identity"),
    )).toBe(true);
    expect(lstatSync(join(workspaceRoot, loginPath)).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(userText);
    expect(backups).toHaveLength(1);
    expect(backupOriginal(workspaceRoot, backups[0]!)).toBe(before);
  });

  it("does not back up an in-place user edit over the repaired identity", async () => {
    const workspaceRoot = copyWorkspace();
    const before = readFileSync(join(workspaceRoot, loginPath), "utf8");
    const gateway = new RepairGateway();
    const userText = `${before}\nuser typed during verification\n`;
    const api = apiWithRunner(workspaceRoot, gateway, (cwd) => {
      writeFileSync(join(cwd, loginPath), userText);
      return failedCommand();
    });
    const project = await api.openSampleWorkspace();
    await configureAutomaticVerification(api, project.projectId);

    const run = await api.confirmExecution((await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "component_app",
      filePath: loginPath,
      rawPrompt: "Change the login heading to welcome returning users.",
    })).id);
    const finished = await waitForTerminal(api, run.runId);
    const events = await api.getAgentRunEvents(run.runId);
    const backups = backupIds(workspaceRoot);

    expect(finished.status).toBe("error");
    expect(events.filter((event) => event.type === "apply_result")).toHaveLength(1);
    expect(gateway.repairs).toBe(1);
    expect(readFileSync(join(workspaceRoot, loginPath), "utf8")).toBe(userText);
    expect(backups).toHaveLength(1);
    expect(backupOriginal(workspaceRoot, backups[0]!)).toBe(before);
  });
});

class RepairGateway extends ModelGateway {
  generations = 0;
  repairs = 0;

  constructor() {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    let output: string;
    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Change the login heading to welcome returning users.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["component_app"],
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
          explanation: "The proposed heading stays on the authorized login page.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the authorized login page changes.",
        },
        summary: "The scoped proposal meets its acceptance criterion.",
        rationale: "The exact heading replacement implements the requested outcome.",
      });
    } else if (input.verificationRepair) {
      this.generations += 1;
      this.repairs += 1;
      output = JSON.stringify({
        summary: "Revise the applied login heading after verification failed",
        path: loginPath,
        edits: [{ search: "<h1>Welcome Back</h1>", replace: "<h1>Welcome again</h1>" }],
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
      requestId: `request_${this.generations}_${this.repairs}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

function apiWithRunner(
  workspaceRoot: string,
  gateway: RepairGateway,
  produce: (cwd: string) => {
    status: "failed" | "passed";
    exitCode: number;
    durationMs: number;
    timedOut: boolean;
    outputTruncated: boolean;
  },
): ProjectOSLocalApi {
  return new ProjectOSLocalApi({
    sampleWorkspaceRoot: workspaceRoot,
    localContextAssembler: new LocalContextAssembler(),
    modelGateway: gateway,
    runEventPersistence: "memory",
    verificationRunner: {
      async run(commands, cwd) {
        const result = produce(cwd);
        return commands.map((command) => ({ command, ...result }));
      },
    },
  });
}

function failedCommand() {
  return {
    status: "failed" as const,
    exitCode: 1,
    durationMs: 5,
    timedOut: false,
    outputTruncated: false,
  };
}

function passedCommand() {
  return {
    status: "passed" as const,
    exitCode: 0,
    durationMs: 5,
    timedOut: false,
    outputTruncated: false,
  };
}

async function configureAutomaticVerification(api: ProjectOSLocalApi, projectId: string): Promise<void> {
  await api.updateSettings(projectId, {
    presentationMode: false,
    execution: {
      mode: "model",
      defaultModelProfileId: "fixture-model",
      defaultAgentProfileId: "default-feature",
      thinkingDepth: "off",
      changeExecutionPolicy: "automatic",
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
    verification: {
      commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }],
    },
  });
  const approval = await api.getVerificationCommandApproval(projectId);
  if (approval.status === "approval_required") {
    await api.approveVerificationCommands(projectId, approval.commandSetHash);
  }
}

function copyWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-repair-identity-"));
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
  const project = JSON.parse(readFileSync(join(workspaceRoot, ".projectos", "project.json"), "utf8")) as {
    projectId: string;
  };
  const settings = createDefaultSettings(project.projectId, false);
  settings.execution.mode = "fixture";
  settings.modelProfiles = [];
  writeFileSync(join(workspaceRoot, ".projectos", "settings.json"), JSON.stringify(settings, null, 2));
  return workspaceRoot;
}

function backupIds(workspaceRoot: string): string[] {
  const root = join(workspaceRoot, ".projectos", "apply-backups");
  if (!existsSync(root)) return [];
  return readdirSync(root).sort();
}

function backupOriginal(workspaceRoot: string, backupId: string): string {
  return readFileSync(
    join(workspaceRoot, ".projectos", "apply-backups", backupId, "0000.original"),
    "utf8",
  );
}

async function waitForRunStatus(api: ProjectOSLocalApi, runId: string, status: "error" | "complete") {
  const deadline = Date.now() + 5_000;
  let run = await api.getAgentRun(runId);
  while (run.status !== status && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    run = await api.getAgentRun(runId);
  }
  return run;
}

async function waitForTerminal(api: ProjectOSLocalApi, runId: string) {
  const deadline = Date.now() + 5_000;
  let run = await api.getAgentRun(runId);
  while (run.status !== "error" && run.status !== "complete" && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    run = await api.getAgentRun(runId);
  }
  return run;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
