/**
 * Explicit loopback·local_tools execution host (DI / evidence only).
 * Not a live/paid model. Must never activate in ordinary production config
 * without PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1 (fail closed).
 *
 * Writes real workspace files, runs the project test script via local spawn,
 * and exposes AgentRun/Evidence views the production Loop stepper already polls.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import type { AgentRunStatus } from "../contracts/agent-run.js";
import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";
import type {
  LoopAgentRunRequest,
  LoopAgentRunView,
  LoopEvidenceView,
  LoopExecutionHooks,
  LoopLeafBinding,
} from "./loop-execution.js";
import { resolveLoopLeafWriteScope, type LoopFeatureNode } from "./loop-execution.js";
import { createWorkspacePathDigester } from "./loop-approval-binding.js";

export type LoopExecutionLoopbackMode = "off" | "local_tools";

export type LoopbackRunAudit = {
  runId: string;
  filePath: string;
  beforeSha256: string;
  afterSha256: string;
  unifiedDiff: string;
  command?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  evidenceStatus?: LoopEvidenceView["status"];
};

type LoopbackRunState = {
  runId: string;
  status: AgentRunStatus;
  applySucceeded: boolean;
  filePath: string;
  featureNodeId: string;
  beforeSha256: string;
  afterSha256: string;
  unifiedDiff: string;
  evidence: LoopEvidenceView | null;
  command?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
};

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function simpleUnifiedDiff(
  path: string,
  before: string,
  after: string,
): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lines = [`--- a/${path}`, `+++ b/${path}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i++) {
    const a = beforeLines[i];
    const b = afterLines[i];
    if (a === b) continue;
    if (a !== undefined && b === undefined) lines.push(`-${a}`);
    else if (a === undefined && b !== undefined) lines.push(`+${b}`);
    else {
      lines.push(`-${a}`);
      lines.push(`+${b}`);
    }
  }
  return lines.slice(0, 80).join("\n");
}

/**
 * Production isolation: local_tools may only enable when the process explicitly
 * opts in. Ordinary packaged / unset env → refuse (no silent bypass).
 */
export function isLoopExecutionLoopbackAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK === "1";
}

function resolveTestCommand(workspaceRoot: string): {
  command: string;
  args: string[];
  display: string;
} {
  try {
    const pkg = JSON.parse(
      readFileSync(join(workspaceRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const script = pkg.scripts?.test?.trim();
    if (script) {
      if (script.startsWith("node ")) {
        const parts = script.split(/\s+/).filter(Boolean);
        return {
          command: parts[0]!,
          args: parts.slice(1),
          display: script,
        };
      }
      return {
        command: "npm",
        args: ["test", "--silent"],
        display: "npm test --silent",
      };
    }
  } catch {
    // ignore
  }
  return {
    command: "npm",
    args: ["test", "--silent"],
    display: "npm test --silent",
  };
}

function applyDeterministicEdit(
  workspaceRoot: string,
  filePath: string,
  goal: string,
): { before: string; after: string } {
  const abs = join(workspaceRoot, filePath);
  const before = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  const marker = `/* loopback·local_tools ${sha256(goal).slice(0, 12)} */\n`;
  let after = before;
  if (!before.includes("loopback·local_tools")) {
    after = `${marker}${before}`;
  } else {
    after = before.replace(
      /\/\* loopback·local_tools [a-f0-9]+ \*\//,
      marker.trim(),
    );
  }
  if (filePath.endsWith("hello.js") && !/export\s+function\s+hello\b/.test(after)) {
    after +=
      (after.endsWith("\n") ? "" : "\n") +
      "export function hello() { return 'ok'; }\n";
  }
  writeFileSync(abs, after, "utf8");
  return { before, after };
}

export class LoopExecutionLoopbackHost {
  mode: LoopExecutionLoopbackMode = "off";
  private readonly runs = new Map<string, LoopbackRunState>();
  private lastAudit: LoopbackRunAudit | null = null;

  setMode(
    mode: LoopExecutionLoopbackMode,
    env: NodeJS.ProcessEnv = process.env,
  ): { mode: LoopExecutionLoopbackMode; live: false } {
    if (mode === "local_tools" && !isLoopExecutionLoopbackAllowed(env)) {
      throw new Error(
        "loopback·local_tools refused: set PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1 for DI/evidence only — ordinary production config must stay fail-closed (no silent simulate)",
      );
    }
    this.mode = mode;
    if (mode === "off") {
      this.runs.clear();
      this.lastAudit = null;
    }
    return { mode, live: false };
  }

  getLastAudit(): LoopbackRunAudit | null {
    return this.lastAudit;
  }

  resolveLeaf(input: {
    nodes: LoopFeatureNode[];
    featureNodeId?: string;
    materials?: LoopTaskMaterial[];
  }): LoopLeafBinding | null {
    const fromGraph = resolveLoopLeafWriteScope(
      input.nodes,
      input.featureNodeId,
    );
    if (fromGraph) return fromGraph;
    const refs = (input.materials ?? []).filter(
      (material) =>
        material.kind === "project_ref" &&
        material.projectRef?.kind === "file" &&
        material.projectRef.path.trim().length > 0,
    );
    if (refs.length === 1) {
      return {
        featureNodeId: input.featureNodeId ?? `feat_mat_${refs[0]!.id}`,
        filePath: refs[0]!.projectRef!.path,
      };
    }
    return null;
  }

  startAgentRun(
    workspaceRoot: string,
    request: LoopAgentRunRequest,
  ): LoopAgentRunView {
    const { before, after } = applyDeterministicEdit(
      workspaceRoot,
      request.filePath,
      request.goal,
    );
    if (before === after && !existsSync(join(workspaceRoot, request.filePath))) {
      throw new Error(`loopback·local_tools could not write ${request.filePath}`);
    }
    const runId = `run_loopback_${randomUUID()}`;
    const beforeSha256 = sha256(before);
    const afterSha256 = sha256(after);
    const unifiedDiff = simpleUnifiedDiff(request.filePath, before, after);
    const state: LoopbackRunState = {
      runId,
      status: "complete",
      applySucceeded: true,
      filePath: request.filePath,
      featureNodeId: request.featureNodeId,
      beforeSha256,
      afterSha256,
      unifiedDiff,
      evidence: null,
    };
    this.runs.set(runId, state);
    this.lastAudit = {
      runId,
      filePath: request.filePath,
      beforeSha256,
      afterSha256,
      unifiedDiff,
    };
    return {
      runId,
      status: state.status,
      applySucceeded: state.applySucceeded,
    };
  }

  requestVerification(workspaceRoot: string, runId: string): void {
    const state = this.runs.get(runId);
    if (!state) return;
    const cmd = resolveTestCommand(workspaceRoot);
    const spawned = spawnSync(cmd.command, cmd.args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const exitCode = spawned.error ? null : spawned.status;
    const ok = exitCode === 0;
    state.command = cmd.display;
    state.exitCode = exitCode;
    state.stdout = (spawned.stdout ?? "").slice(0, 4000);
    state.stderr = (spawned.stderr ?? spawned.error?.message ?? "").slice(0, 4000);
    state.evidence = {
      id: `ev_${runId}`,
      runId,
      status: ok ? "passed" : "failed",
      command: cmd.display,
      exitCode,
    };
    this.lastAudit = {
      runId,
      filePath: state.filePath,
      beforeSha256: state.beforeSha256,
      afterSha256: state.afterSha256,
      unifiedDiff: state.unifiedDiff,
      command: cmd.display,
      exitCode,
      stdout: state.stdout,
      stderr: state.stderr,
      evidenceStatus: state.evidence.status,
    };
  }

  readRun(runId: string): LoopAgentRunView | null {
    const state = this.runs.get(runId);
    if (!state) return null;
    return {
      runId: state.runId,
      status: state.status,
      applySucceeded: state.applySucceeded,
    };
  }

  readEvidence(runId: string): LoopEvidenceView | null {
    return this.runs.get(runId)?.evidence ?? null;
  }

  buildHooks(input: {
    workspaceRoot: string;
    nodes: LoopFeatureNode[];
    featureNodeId?: string;
    materials?: LoopTaskMaterial[];
    fallback?: LoopExecutionHooks;
  }): LoopExecutionHooks {
    const leaf =
      this.resolveLeaf({
        nodes: input.nodes,
        ...(input.featureNodeId ? { featureNodeId: input.featureNodeId } : {}),
        ...(input.materials ? { materials: input.materials } : {}),
      }) ?? input.fallback?.leaf ?? null;

    if (this.mode !== "local_tools") {
      return (
        input.fallback ?? {
          leaf,
          readRun: () => null,
          readEvidence: () => null,
          startAgentRun: () => {
            throw new Error("No loop execution hooks");
          },
        }
      );
    }

    const digester = createWorkspacePathDigester(input.workspaceRoot);
    return {
      leaf,
      digestWorkspacePaths: digester,
      readRun: (runId) => this.readRun(runId) ?? input.fallback?.readRun(runId) ?? null,
      readEvidence: (runId) =>
        this.readEvidence(runId) ?? input.fallback?.readEvidence(runId) ?? null,
      startAgentRun: (request) => {
        if (!leaf) {
          throw new Error("文件未挂接");
        }
        return this.startAgentRun(input.workspaceRoot, {
          ...request,
          featureNodeId: leaf.featureNodeId,
          filePath: leaf.filePath,
        });
      },
      requestVerification: (runId) => {
        this.requestVerification(input.workspaceRoot, runId);
      },
      ...(input.fallback?.executeGithubOperation
        ? { executeGithubOperation: input.fallback.executeGithubOperation }
        : {}),
      ...(input.fallback?.executeConnectorOperation
        ? { executeConnectorOperation: input.fallback.executeConnectorOperation }
        : {}),
      ...(input.fallback?.executeTerminalCommand
        ? { executeTerminalCommand: input.fallback.executeTerminalCommand }
        : {}),
      allowConcurrentLoopRuns: input.fallback?.allowConcurrentLoopRuns,
    };
  }
}
