/**
 * Synthetic acceptance-ops rehearsal (0 real provider HTTP).
 *
 * Maps the paid Electron probe checklist onto the real product entries:
 *   mode(change) → extractRequestIntent (discovery) → approveRequestIntent
 *   → prepareIntentExecution → confirmExecution → ≥2 delegated children
 *   → cancelAgentRun after first child_run_started → later sibling not newly started.
 *
 * NOT DeepSeek evidence. Existing sibling-clarify-share unit tests remain the
 * orchestrator contract; this file only closes the acceptance-ops wiring gap.
 */
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentRunEvent } from "../contracts/events.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { DeterministicLoginChangeGateway } from "./model-gateway/deterministic-login-change-gateway.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleRoot = resolve("..", "sample-graph-saas");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  delete process.env.PROJECTOS_DETERMINISTIC_SLOW_MS;
});

function copyWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "acceptance-ops-rehearsal-"));
  dirs.push(tempRoot);
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
  return workspaceRoot;
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
      displayName: "Fixture Model",
      model: "fixture-model",
      baseUrl: "https://example.invalid",
      apiKeyRef: "model_profile:fixture-model",
      isDefault: true,
    }],
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("waitFor timed out");
}

function childIdsFromEvents(events: AgentRunEvent[]): string[] {
  return [
    ...new Set(
      events
        .filter((e) => e.type === "child_run_started")
        .map((e) =>
          "childRunId" in e.payload
            ? String((e.payload as { childRunId?: string }).childRunId ?? "")
            : "",
        )
        .filter(Boolean),
    ),
  ];
}

describe("acceptance ops rehearsal (synthetic deterministic gateway)", () => {
  it("discovery → approve → ≥2 children → cancel after first start (not DeepSeek evidence)", async () => {
    const workspaceRoot = copyWorkspace();
    // Hold leaf model steps so Stop can land after the first child starts.
    process.env.PROJECTOS_DETERMINISTIC_SLOW_MS = "250";
    const gateway = new DeterministicLoginChangeGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: workspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);

    // 1) discovery (Agent change-mode extractRequestIntent) — node scope, no leaf filePath
    //    so confirmExecution opens node_planner with delegated children (probe mode card).
    const draft = await api.extractRequestIntent({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawRequest:
        "Update the login experience across its owned files with separate delegated child work.",
      executorSelection: { kind: "model", modelProfileId: "fixture-model" },
    });
    expect(draft.status).toBe("draft");
    expect(draft.kind).toBe("change");

    // 2) real approve entry (same API RequestIntentCard / 「批准并开始」 calls)
    await api.approveRequestIntent(project.projectId, draft.id, draft.revision);
    const refinement = await api.prepareIntentExecution(project.projectId, draft.id);
    const parent = await api.confirmExecution(refinement.id);
    expect(parent.role).toBe("node_planner");
    expect(parent.scope).toMatchObject({ kind: "node-plan", nodeId: "feat_login" });

    // Wait until the plan has delegated ≥2 tasks (acceptance: ≥2 child identities).
    await waitFor(async () => {
      const events = await api.getAgentRunEvents(parent.runId);
      const delegated = events.filter((e) => e.type === "task_delegated");
      return delegated.length >= 2;
    });

    // 3) wait until first child has started (poll durable journal — same surface probe reads)
    await waitFor(async () => {
      const events = await api.getAgentRunEvents(parent.runId);
      return childIdsFromEvents(events).length >= 1;
    });
    const atCancel = childIdsFromEvents(await api.getAgentRunEvents(parent.runId));
    expect(atCancel.length).toBeGreaterThanOrEqual(1);

    // 4) Stop after first child start (acceptance cancel point)
    await api.cancelAgentRun(parent.runId);

    // 5) settle; no *additional* child_run_started beyond the cancel-time set.
    await new Promise((r) => setTimeout(r, 600));
    const afterEvents = await api.getAgentRunEvents(parent.runId);
    const after = childIdsFromEvents(afterEvents);
    const startedAfterCancel = after.filter((id) => !atCancel.includes(id));
    expect(startedAfterCancel).toEqual([]);
    const delegatedCount = afterEvents.filter((e) => e.type === "task_delegated").length;
    expect(delegatedCount).toBeGreaterThanOrEqual(2);
    const cancelled = await api.getAgentRun(parent.runId);
    expect(["cancelled", "awaiting_review", "complete", "error"]).toContain(cancelled.status);
  }, 45_000);
});
