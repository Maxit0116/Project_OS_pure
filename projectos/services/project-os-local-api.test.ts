import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultSettings } from "../contracts/settings.js";
import { ContextPayloadSchema, type CurrentWorkState } from "../contracts/context.js";
import type { AgentRun } from "../contracts/agent-run.js";
import type { ApplyResult, GeneratedDiff } from "../contracts/diff.js";
import type {
  HierarchyDelegationPlan,
  WholeTreeTransactionPlan,
} from "../contracts/hierarchy-delegation.js";
import { AgentRunEventSchema, type AgentRunEvent } from "../contracts/events.js";
import type { ModelGatewayRequest, ModelGatewayResponse } from "../contracts/model-gateway.js";
import type { GlobalContextBundle } from "../contracts/local-context.js";
import {
  MAP_IMAGE_MAX_BYTES,
  MapContentDocumentSchema,
  type MapArtifact,
} from "../contracts/map-content.js";
import { ProjectOSError } from "../errors.js";
import { InMemorySecretStore } from "../persistence/secret-store.js";
import { ProjectOSWorkspaceStore } from "../persistence/workspace-store.js";
import { validateAgentRunEventSequence } from "../validation/index.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { LocalContextAssembler } from "./local-context-assembler.js";
import { ModelGateway } from "./model-gateway/index.js";
import * as writeTransactionModule from "./recoverable-write-transaction.js";
import { WorkspaceTransactionCoordinator } from "./workspace-transaction-coordinator.js";
import { DependencyImpactScanner } from "./dependency-impact-scanner.js";
import { VerificationRunner } from "./verification-runner.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("ProjectOSLocalApi graph, tree, and context methods", () => {
  it("opens the real sample workspace and returns graph/tree data", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    const graph = await api.getProjectGraph(project.projectId);
    const tree = await api.getSemanticTree(project.projectId);

    expect(graph.projectId).toBe(project.projectId);
    expect(graph.nodes.some((node) => node.id === "feat_login")).toBe(true);
    expect(tree.projectId).toBe(project.projectId);
    expect(tree.roots.some((root) => root.sourceNodeId === "feat_login")).toBe(
      true,
    );
  });

  it("clears project-scoped execution state before reopening the same project", async () => {
    const root = copySampleWorkspace();
    const workspaceStore = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: root,
      localContextAssembler: new LocalContextAssembler(),
      runEventPersistence: "memory",
      workspaceStore,
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
    });
    const project = await api.openSampleWorkspace();
    const staleRefinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: "app/login/page.tsx",
      rawPrompt: "Remember this transient refinement only until the workspace reopens.",
    });
    const subscription = { dispose(): void {} };
    const internals = getLocalApiInternals(api);
    const oldWorkspace = internals.workspacesByProjectId.get(project.projectId)!;
    internals.pendingOrchestratorStarts.set("run_pending_reopen", {
      workspace: oldWorkspace,
      runId: "run_pending_reopen",
    });
    internals.boundCreateRunAuthorizations.set("run_create_reopen", {
      projectId: project.projectId,
    });
    internals.boundDeleteRunAuthorizations.set("run_delete_reopen", {
      projectId: project.projectId,
    });
    internals.boundImpactDeleteTransactions.set("run_impact_reopen", {
      projectId: project.projectId,
    });
    internals.boundNodeDeletionTransactions.set("run_node_delete_reopen", {
      projectId: project.projectId,
    });
    internals.activeNodeDeletionReservations.set(
      "run_node_delete_reopen",
      new Set(["feat_login"]),
    );
    internals.boundGreenfieldInitializations.set("run_greenfield_reopen", {
      projectId: project.projectId,
    });
    internals.activeGreenfieldInitializations.set(
      project.projectId,
      "run_greenfield_reopen",
    );
    internals.fallbackNotices.set(project.projectId, "stale notice");

    await api.openSampleWorkspace();

    expect(internals.workspacesByProjectId.get(project.projectId)).not.toBe(oldWorkspace);
    expect(internals.activeOrchestratorRuns.size).toBe(0);
    expect(internals.pendingOrchestratorStarts.size).toBe(0);
    expect(internals.refinementsById.has(staleRefinement.id)).toBe(false);
    expect(internals.boundRunAuthorizations.size).toBe(0);
    expect(internals.boundCreateRunAuthorizations.size).toBe(0);
    expect(internals.boundDeleteRunAuthorizations.size).toBe(0);
    expect(internals.boundImpactDeleteTransactions.size).toBe(0);
    expect(internals.boundNodeDeletionTransactions.size).toBe(0);
    expect(internals.activeNodeDeletionReservations.size).toBe(0);
    expect(internals.boundGreenfieldInitializations.size).toBe(0);
    expect(internals.activeGreenfieldInitializations.size).toBe(0);
    await expect(api.consumeFallbackNotice(project.projectId)).resolves.toBeUndefined();
    subscription.dispose();
  });

  it("terminalizes and reports an orchestrator startup rejection", async () => {
    const root = copySampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: root,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new AutomaticChangeGateway(),
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
    const internals = getLocalApiInternals(api);
    internals.orchestrator.startRun = async () => {
      throw new Error("synthetic startup failure");
    };

    const run = await api.confirmExecution(refinement.id);
    const failed = await waitForRunStatus(api, run.runId, "error");
    const events = await api.getAgentRunEvents(run.runId);

    expect(failed).toMatchObject({ status: "error", completedAt: expect.any(String) });
    expect(events.map((event) => event.type)).toEqual(["run_started", "step_failed"]);
    expect(events[1]).toMatchObject({
      type: "step_failed",
      payload: { message: "synthetic startup failure" },
    });
    expect(validateAgentRunEventSequence(events)).toEqual([]);
    await expect(api.consumeFallbackNotice(project.projectId)).resolves.toContain(
      "synthetic startup failure",
    );
  });

  it("assembles feature context for feat_login with auth linked files", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    const context = await api.getNodeContext(project.projectId, "feat_login");
    const linkedPaths = context.linkedFiles.map((file) => file.path);

    expect(ContextPayloadSchema.safeParse(context).success).toBe(true);
    expect(context.scope).toBe("feature");
    expect(context.nodeId).toBe("feat_login");
    expect(linkedPaths).toEqual(
      expect.arrayContaining([
        "app/login/page.tsx",
        "app/api/auth/route.ts",
        "lib/auth.ts",
      ]),
    );
    expect(context.rawContextMarkdown).toContain("Identity & Access");
    expect(context.downstream).toEqual([]);
  });

  it("assembles file context from semantic-tree links when graph fileIndex has no node id", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const graphPath = join(tempWorkspaceRoot, ".projectos", "graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8")) as {
      fileIndex: Array<{ path: string; nodeIds: string[] }>;
    };
    const authRoute = graph.fileIndex.find(
      (file) => file.path === "app/api/auth/route.ts",
    );
    if (!authRoute) throw new Error("Auth route fixture was not indexed");
    authRoute.nodeIds = [];
    writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    const context = await api.getFileContext(
      project.projectId,
      "app/api/auth/route.ts",
    );

    expect(ContextPayloadSchema.safeParse(context).success).toBe(true);
    expect(context.scope).toBe("file");
    expect(context.filePath).toBe("app/api/auth/route.ts");
    expect(context.nodeId).toBe("feat_login");
    expect(context.rawContextMarkdown).toContain("Related Nodes");
  });

  it("throws typed errors for unknown project, node, and file", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    await expect(api.getProjectGraph("missing-project")).rejects.toMatchObject({
      code: "project_not_loaded",
    } satisfies Partial<ProjectOSError>);
    await expect(
      api.getNodeContext(project.projectId, "missing-node"),
    ).rejects.toMatchObject({
      code: "node_not_found",
    } satisfies Partial<ProjectOSError>);
    await expect(
      api.getFileContext(project.projectId, "app/missing.tsx"),
    ).rejects.toMatchObject({
      code: "file_not_found",
    } satisfies Partial<ProjectOSError>);
  });

  it("binds live model authorization to the requested scope and attached context", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    const selectedFilePath = "app/login/page.tsx";
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: selectedFilePath,
      rawPrompt: "Change only the selected login page.",
    });
    const stored = getLocalApiInternals(api).refinementsById.get(refinement.id)!;
    expect(stored.requestedScope).toEqual({
      nodeId: "feat_login",
      selectedFilePath,
    });
    expect(stored.responseLanguage).toBe("und");

    stored.refinement.affectedFiles = ["lib/auth.ts"];
    stored.refinement.affectedNodeIds = ["feat_database"];
    await enableModelExecution(api, project.projectId);
    const run = await api.confirmExecution(refinement.id);

    const authorization = getLocalApiInternals(api).boundRunAuthorizations.get(
      run.runId,
    );
    const canonicalPath = realpathSync(join(tempWorkspaceRoot, selectedFilePath));
    const stats = lstatSync(canonicalPath);
    expect(authorization).toEqual({
      projectId: project.projectId,
      nodeId: "feat_login",
      selectedFilePath,
      bundleHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      allowedWriteTarget: {
        relativePath: selectedFilePath,
        canonicalPath,
        device: stats.dev,
        inode: stats.ino,
      },
    });
    const orchestratorState = getLocalApiInternals(api).orchestrator.getRun(run.runId);
    expect(orchestratorState?.localContext).toMatchObject({
      scope: { nodeId: "feat_login", selectedFilePath },
      responseLanguage: "und",
      bundleHash: authorization?.bundleHash,
      allowedWritePaths: [selectedFilePath],
    });
    expect(() => getLocalApiInternals(api).validateGeneratedDiffScope(
      run.runId,
      {
        runId: run.runId,
        summary: "Authorized change",
        files: [{
          path: selectedFilePath,
          changeType: "modify",
          after: "updated",
        }],
      },
    )).not.toThrow();
    expect(() => getLocalApiInternals(api).validateGeneratedDiffScope(
      run.runId,
      {
        runId: run.runId,
        summary: "Unauthorized connected-file change",
        files: [{
          path: "lib/auth.ts",
          changeType: "modify",
          after: "updated",
        }],
      },
    )).toThrowError(expect.objectContaining({ code: "diff_scope_violation" }));
  });

  it("rejects an invalid requested selection before publishing a live run", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: "README.md",
      rawPrompt: "Change an unrelated file.",
    });
    await enableModelExecution(api, project.projectId);

    await expect(api.confirmExecution(refinement.id)).rejects.toMatchObject({
      code: "local_context_unavailable",
    });
    expect(getLocalApiInternals(api).boundRunAuthorizations.size).toBe(0);
    expect(getLocalApiInternals(api).orchestrator.runs.size).toBe(0);
  });

  it("keeps fixture confirmation independent of local context assembly", async () => {
    let assembleCalls = 0;
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      localContextAssembler: {
        assemble() {
          assembleCalls += 1;
          throw new Error("Fixture confirmation must not assemble live context");
        },
        assembleNode() {
          throw new Error("Fixture confirmation must not assemble node context");
        },
        resolveAllowedWriteTarget() {
          throw new Error("Fixture confirmation must not resolve a write target");
        },
      },
    });
    const project = await api.openSampleWorkspace();
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });

    const run = await api.confirmExecution(refinement.id);

    expect(run).toMatchObject({
      projectId: project.projectId,
      kind: "feature_change",
      relatedNodeIds: expect.arrayContaining(["feat_login"]),
    });
    expect(assembleCalls).toBe(0);
    expect(getLocalApiInternals(api).boundRunAuthorizations.size).toBe(0);
  });

  it("rejects a registered run id already owned by another execution backend", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: copySampleWorkspace() });
    const project = await api.openSampleWorkspace();
    const collidingRun = generatedRun(project.projectId, "run_google_login");
    getLocalApiInternals(api).externalRunsByRunId.set(collidingRun.runId, {
      run: collidingRun,
      events: [],
      config: externalAgentConfig(),
    });
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });

    await expect(api.confirmExecution(refinement.id)).rejects.toMatchObject({
      code: "agent_orchestration_failed",
    });
    expect(getLocalApiInternals(api).externalRunsByRunId.get(collidingRun.runId)?.run)
      .toEqual(collidingRun);
  });

  it("rejects file and map-asset paths that escape their allowed roots", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const outsideFile = join(tempWorkspaceRoot, "..", "outside.txt");
    symlinkSync(outsideFile, join(tempWorkspaceRoot, "escape-link"));

    for (const unsafePath of ["../outside.txt", outsideFile, "bad\0path", "escape-link"]) {
      await expect(api.getFileContent(project.projectId, unsafePath)).rejects.toMatchObject({
        code: "file_not_found",
      });
    }
    for (const unsafePath of ["../outside.png", "/tmp/outside.png", "map-assets/../outside.png", "other/outside.png"]) {
      await expect(api.getMapAssetDataUrl(project.projectId, unsafePath)).rejects.toMatchObject({
        code: "map_asset_not_found",
      });
    }
  });

  it("blocks protected project metadata reads while allowing normal workspace files", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const normalPath = "normal-readable.txt";
    writeFileSync(join(tempWorkspaceRoot, normalPath), "workspace content", "utf8");
    mkdirSync(join(tempWorkspaceRoot, ".git"), { recursive: true });
    writeFileSync(join(tempWorkspaceRoot, ".git", "config"), "secret git config", "utf8");
    symlinkSync(
      join(tempWorkspaceRoot, ".projectos", "graph.json"),
      join(tempWorkspaceRoot, "metadata-alias"),
    );

    await expect(api.getFileContent(project.projectId, normalPath)).resolves.toBe(
      "workspace content",
    );
    for (const protectedPath of [
      ".projectos/graph.json",
      ".git/config",
      "metadata-alias",
    ]) {
      await expect(
        api.getFileContent(project.projectId, protectedPath),
      ).rejects.toMatchObject({ code: "file_not_found" });
    }
  });

  it("rejects path-backed map images outside the workspace and reads one inside it", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const imageBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=",
      "base64",
    );
    const outsideImage = join(tempWorkspaceRoot, "..", "outside-source.png");
    const insideImage = join(tempWorkspaceRoot, "inside-source.png");
    writeFileSync(outsideImage, imageBytes);
    writeFileSync(insideImage, imageBytes);

    const baseInput = {
      scope: "project" as const,
      position: { x: 40, y: 40 },
      size: { width: 160, height: 120 },
      fileName: "source.png",
      mimeType: "image/png" as const,
      width: 1,
      height: 1,
    };
    await expect(
      api.createMapImageArtifact(project.projectId, {
        ...baseInput,
        sourceAbsolutePath: outsideImage,
      }),
    ).rejects.toMatchObject({ code: "invalid_image" });

    const artifact = await api.createMapImageArtifact(project.projectId, {
      ...baseInput,
      sourceAbsolutePath: insideImage,
    });
    if (artifact.type !== "image") {
      throw new Error("Expected image artifact");
    }
    await expect(
      api.getMapAssetDataUrl(project.projectId, artifact.image.assetPath),
    ).resolves.toBe(`data:image/png;base64,${imageBytes.toString("base64")}`);
  });

  it("rejects a tampered map asset larger than the image byte limit", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const image = await api.createMapImageArtifact(project.projectId, {
      scope: "project",
      position: { x: 40, y: 40 },
      size: { width: 160, height: 120 },
      fileName: "bounded.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=",
    });
    if (image.type !== "image") throw new Error("Expected image artifact");
    writeFileSync(
      join(tempWorkspaceRoot, ".projectos", image.image.assetPath),
      Buffer.alloc(MAP_IMAGE_MAX_BYTES + 1),
    );

    await expect(
      api.getMapAssetDataUrl(project.projectId, image.image.assetPath),
    ).rejects.toMatchObject({ code: "image_too_large" });
  });

  it("rejects image repointing and cannot delete outside the map-assets root", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const imageDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=";
    const image = await api.createMapImageArtifact(project.projectId, {
      scope: "project",
      position: { x: 40, y: 40 },
      size: { width: 160, height: 120 },
      fileName: "contained.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      dataUrl: imageDataUrl,
    });
    if (image.type !== "image") {
      throw new Error("Expected image artifact");
    }

    await expect(
      api.updateMapArtifact(project.projectId, image.id, {
        image: { ...image.image, assetPath: "../../evil" },
      }),
    ).rejects.toThrow();
    await expect(
      api.updateMapArtifact(project.projectId, image.id, {
        image: { ...image.image, assetPath: "map-assets/missing.png" },
      }),
    ).rejects.toMatchObject({ code: "map_asset_not_found" });
    expect(
      (await api.getMapContent(project.projectId)).artifacts.find(
        (artifact) => artifact.id === image.id,
      ),
    ).toMatchObject({ image: { assetPath: image.image.assetPath } });

    const outsidePath = join(tempWorkspaceRoot, "outside-map-asset.png");
    writeFileSync(outsidePath, "must survive", "utf8");
    const storedWorkspace = getLocalApiInternals(api).workspacesByProjectId.get(
      project.projectId,
    );
    const storedImage = storedWorkspace?.mapContent.artifacts.find(
      (artifact) => artifact.id === image.id,
    );
    if (!storedImage || storedImage.type !== "image") {
      throw new Error("Expected stored image artifact");
    }
    storedImage.image.assetPath = "../outside-map-asset.png";

    await expect(api.deleteMapArtifact(project.projectId, image.id)).rejects.toMatchObject({
      code: "map_asset_not_found",
    });
    expect(readFileSync(outsidePath, "utf8")).toBe("must survive");
  });

  it("refines and executes the google-login scenario with deterministic event replay", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: copySampleWorkspace() });
    const project = await api.openSampleWorkspace();

    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);
    const loadedRun = await api.getAgentRun(run.runId);
    const events = collectRunEvents(api, run.runId);
    const replayedEvents = collectRunEvents(api, run.runId);

    expect(refinement.id).toBe("ref_google_login");
    expect(refinement.mode).toBe("deterministic_fixture");
    expect(run.runId).toBe("run_google_login");
    expect(run.status).toBe("running");
    expect(loadedRun).toEqual(run);
    expect(events).toHaveLength(11);
    expect(events[0]?.type).toBe("run_started");
    expect(events.at(-1)?.type).toBe("run_completed");
    expect(events.map((event) => event.eventId)).toEqual(
      replayedEvents.map((event) => event.eventId),
    );
    for (const event of events) {
      expect(AgentRunEventSchema.safeParse(event).success).toBe(true);
    }
    expect(validateAgentRunEventSequence(events)).toEqual([]);
  });

  it("returns a deterministic generic refinement when no scenario matches", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: copySampleWorkspace() });
    const project = await api.openSampleWorkspace();

    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Explain this login page without changing code.",
    });

    expect(refinement.mode).toBe("deterministic_fixture");
    expect(refinement.id).toMatch(/^ref_generic_/u);
    expect(refinement.affectedNodeIds).toEqual(["feat_login"]);
  });

  it("replaces malformed model refinement output with a diagnostic deterministic fallback", async () => {
    const rawModelText = "RAW MODEL TEXT THAT MUST NOT REACH THE REFINEMENT CARD";
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: copySampleWorkspace(),
      modelGateway: new MalformedRefinementGateway(rawModelText),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);

    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: "app/login/page.tsx",
      rawPrompt: "Change the login heading",
    });

    expect(refinement.mode).toBe("deterministic_fixture");
    expect(refinement.understood).not.toContain(rawModelText);
    expect(refinement.fallback).toMatchObject({
      stage: "prompt_refinement",
      backend: "model",
      profileId: "fixture-model",
      providerMessage: "The model returned malformed prompt refinement JSON",
    });
  });

  it("throws typed errors for unknown refinement and run ids", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot });
    await api.openSampleWorkspace();

    await expect(api.confirmExecution("missing-refinement")).rejects.toMatchObject({
      code: "refinement_not_found",
    } satisfies Partial<ProjectOSError>);
    await expect(api.getAgentRun("missing-run")).rejects.toMatchObject({
      code: "run_not_found",
    } satisfies Partial<ProjectOSError>);
    expect(() => api.streamAgentRun("missing-run", () => undefined)).toThrow(
      expect.objectContaining({ code: "run_not_found" }),
    );
  });

  it("gets and applies the google-login diff against a temp workspace copy", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);

    const diff = await api.getDiff(run.runId);
    for (const file of diff.files) {
      expect(existsSync(join(tempWorkspaceRoot, file.path))).toBe(true);
    }

    const beforeApply = new Map(diff.files.map((file) => [
      file.path,
      readFileSync(join(tempWorkspaceRoot, file.path), "utf8"),
    ]));
    for (const file of diff.files) {
      expect(beforeApply.get(file.path)).toBe(file.before);
    }

    const applyResult = await api.applyDiff(run.runId);
    const currentWork = JSON.parse(
      readFileSync(
        join(tempWorkspaceRoot, ".projectos", "current-work.json"),
        "utf8",
      ),
    ) as {
      focusedNodeId?: string;
      recentChanges: Array<{ path: string; action: string; runId?: string }>;
    };
    const reopenedApi = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
    });
    const reopenedProject = await reopenedApi.openSampleWorkspace();
    const reopenedContext = await reopenedApi.getNodeContext(
      reopenedProject.projectId,
      "feat_login",
    );

    expect(applyResult).toMatchObject({
      runId: "run_google_login",
      applied: true,
      filesChanged: diff.files.map((file) => file.path),
      verificationStatus: "not_run",
      outcome: "applied",
    });
    expect(applyResult.backupId).toEqual(expect.any(String));
    expect(applyResult.verificationStatus).not.toBe("demo_passed");
    for (const file of diff.files) {
      expect(readFileSync(join(tempWorkspaceRoot, file.path), "utf8")).toBe(file.after);
    }
    const manifest = JSON.parse(
      readFileSync(join(
        tempWorkspaceRoot,
        ".projectos",
        "apply-backups",
        applyResult.backupId!,
        "manifest.json",
      ), "utf8"),
    ) as {
      restoreAuthority: { kind: string };
      files: Array<{ path: string; operation: string }>;
    };
    expect(manifest.restoreAuthority).toEqual({ kind: "project_api" });
    expect(manifest.files.filter((file) => file.path !== ".projectos/current-work.json")
      .map((file) => file.path)).toEqual(diff.files.map((file) => file.path));
    expect(manifest.files).toContainEqual(expect.objectContaining({
      path: ".projectos/current-work.json",
      operation: "internal",
    }));
    expect(currentWork.focusedNodeId).toBe("feat_login");
    expect(currentWork.recentChanges).toEqual(
      expect.arrayContaining(
        diff.files.map((file) =>
          expect.objectContaining({
            path: file.path,
            action: "modified",
            runId: "run_google_login",
          }),
        ),
      ),
    );
    expect(
      reopenedContext.recentChanges.filter((change) => change.runId === run.runId),
    ).toHaveLength(diff.files.length);
  });

  it("rejects a prefab diff that targets a file outside the scenario node", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const scenarioPath = join(
      tempWorkspaceRoot,
      ".projectos",
      "demo-scenarios",
      "google-login.json",
    );
    const scenario = JSON.parse(readFileSync(scenarioPath, "utf8")) as {
      files: string[];
      diff: { files: Array<{ path: string; changeType: string; before?: string; after?: string }> };
    };
    const outsidePath = "app/pricing/page.tsx";
    const outsideBefore = readFileSync(join(tempWorkspaceRoot, outsidePath), "utf8");
    scenario.files = [...scenario.files, outsidePath];
    scenario.diff.files[0] = {
      path: outsidePath,
      changeType: "modify",
      before: outsideBefore,
      after: `${outsideBefore}\n// unauthorized prefab\n`,
    };
    writeFileSync(scenarioPath, JSON.stringify(scenario));
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);
    const loginBefore = readFileSync(join(tempWorkspaceRoot, "app/login/page.tsx"), "utf8");

    await expect(api.applyDiff(run.runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });

    expect(readFileSync(join(tempWorkspaceRoot, outsidePath), "utf8")).toBe(outsideBefore);
    expect(readFileSync(join(tempWorkspaceRoot, "app/login/page.tsx"), "utf8")).toBe(loginBefore);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("leaves prefab targets untouched when the transaction rolls back", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new FailSecondCommitApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);
    const diff = await api.getDiff(run.runId);
    const originals = new Map(diff.files.map((file) => [
      file.path,
      readFileSync(join(tempWorkspaceRoot, file.path), "utf8"),
    ]));
    const currentWorkPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const currentWork = readFileSync(currentWorkPath, "utf8");

    await expect(api.applyDiff(run.runId)).rejects.toMatchObject({
      code: "diff_apply_failed",
    });

    for (const file of diff.files) {
      expect(readFileSync(join(tempWorkspaceRoot, file.path), "utf8"))
        .toBe(originals.get(file.path));
    }
    expect(readFileSync(currentWorkPath, "utf8")).toBe(currentWork);
    const backups = readdirSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"));
    expect(backups).toHaveLength(1);
    expect(existsSync(join(
      tempWorkspaceRoot,
      ".projectos",
      "apply-backups",
      backups[0]!,
      "manifest.json",
    ))).toBe(true);
  });

  it("does not keep a demo_passed shortcut in the local apply path", () => {
    const source = readFileSync(new URL("./project-os-local-api.ts", import.meta.url), "utf8");
    expect(source).not.toContain('verificationStatus: "demo_passed"');
  });

  it("applies the auth-bugfix prefab through the same transaction after google-login", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const feature = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt:
        "Add Google login and redirect users to profile after successful sign in.",
    });
    const featureRun = await api.confirmExecution(feature.id);
    await api.applyDiff(featureRun.runId);

    const fix = await api.startHarnessFix("err_auth_provider_callback");
    const diff = await api.getDiff(fix.runId);
    const applied = await api.applyDiff(fix.runId);

    expect(applied).toMatchObject({
      runId: fix.runId,
      applied: true,
      filesChanged: diff.files.map((file) => file.path),
      verificationStatus: "not_run",
      outcome: "applied",
    });
    expect(applied.verificationStatus).not.toBe("demo_passed");
    for (const file of diff.files) {
      expect(readFileSync(join(tempWorkspaceRoot, file.path), "utf8")).toBe(file.after);
    }
    expect(existsSync(join(
      tempWorkspaceRoot,
      ".projectos",
      "apply-backups",
      applied.backupId!,
      "manifest.json",
    ))).toBe(true);
  });

  it("transactionally applies generated modifications and persists a recovery manifest", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const events: string[] = [];
    const workspaceStore = new RecordingWorkspaceStore(events);
    const api = new RecordingCommitApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore,
    }, events);
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const before = readFileSync(join(tempWorkspaceRoot, path), "utf8");
    const after = `${before}\n// generated apply marker\n`;
    const runId = "run_generated_happy";

    const result = await applyGeneratedDiffTransaction(api, generatedRun(project.projectId, runId), {
      runId,
      summary: "Apply a real generated edit",
      files: [{ path, changeType: "modify", before, after }],
    });

    expect(readFileSync(join(tempWorkspaceRoot, path), "utf8")).toBe(after);
    expect(result).toMatchObject({
      runId,
      applied: true,
      filesChanged: [path],
      verificationStatus: "not_run",
      outcome: "applied",
    });
    expect(result.backupId).toBeTypeOf("string");
    const backupRoot = join(
      tempWorkspaceRoot,
      ".projectos",
      "apply-backups",
      result.backupId!,
    );
    const manifest = JSON.parse(
      readFileSync(join(backupRoot, "manifest.json"), "utf8"),
    ) as { version: number; backupId: string; runId: string; files: Array<{ operation: string; resource?: string; path: string; backupFile: string; originalSha256: string; afterSha256: string }> };
    expect(manifest).toMatchObject({
      version: 4,
      backupId: result.backupId,
      runId,
      restoreAuthority: { kind: "project_api" },
    });
    expect(manifest.files[0]).toMatchObject({ operation: "modify" });
    expect(manifest.files[1]).toMatchObject({
      operation: "internal",
      resource: "current_work",
      path: ".projectos/current-work.json",
    });
    expect(manifest.files).toHaveLength(2);
    expect(manifest.files[0]?.originalSha256).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(manifest.files[0]?.afterSha256).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(readFileSync(join(backupRoot, manifest.files[0]!.backupFile), "utf8")).toBe(before);
    expect(events).toEqual(["commit", "commit"]);

    const currentWork = JSON.parse(
      readFileSync(join(tempWorkspaceRoot, ".projectos", "current-work.json"), "utf8"),
    ) as CurrentWorkState;
    expect(currentWork.activeRunId).toBe(runId);
    expect(currentWork.recentChanges.at(-1)).toMatchObject({ path, runId, action: "modified" });
    expect(currentWork.graphFreshness).toMatchObject({
      stale: true,
      lastAnalyzedAt: expect.any(String),
    });
  });

  it("keeps only the most recent 50 current-work changes across apply and undo", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const currentWorkPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const seeded = JSON.parse(readFileSync(currentWorkPath, "utf8")) as CurrentWorkState;
    seeded.recentChanges = Array.from({ length: 50 }, (_, index) => ({
      path: `history-${index}.ts`,
      action: "modified" as const,
      runId: `history-run-${index}`,
      timestamp: `2026-07-20T00:00:${String(index).padStart(2, "0")}.000Z`,
    }));
    writeFileSync(currentWorkPath, `${JSON.stringify(seeded, null, 2)}\n`, "utf8");

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const before = readFileSync(join(tempWorkspaceRoot, path), "utf8");
    const run = generatedRun(project.projectId, "run_recent_changes_cap");
    const applied = await applyGeneratedDiffTransaction(api, run, {
      runId: run.runId,
      summary: "Exercise bounded current-work history",
      files: [{ path, changeType: "modify", before, after: `${before}\n// bounded history\n` }],
    });

    const afterApply = await api.getCurrentWork(project.projectId);
    expect(afterApply.recentChanges).toHaveLength(50);
    expect(afterApply.recentChanges[0]?.path).toBe("history-1.ts");
    expect(afterApply.recentChanges.at(-1)).toMatchObject({ path, runId: run.runId });

    await api.restoreApplyBackup(project.projectId, applied.backupId!);
    const afterUndo = await api.getCurrentWork(project.projectId);
    expect(afterUndo.recentChanges).toHaveLength(50);
    expect(afterUndo.recentChanges[0]?.path).toBe("history-2.ts");
    expect(afterUndo.recentChanges.at(-1)).toMatchObject({
      path,
      runId: run.runId,
      action: "reverted",
    });
  });

  it("marks a generated run complete after a successful authorized apply", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const before = readFileSync(join(tempWorkspaceRoot, path), "utf8");
    const run = generatedRun(project.projectId, "run_apply_completion");
    authorizeTestRun(api, project.projectId, tempWorkspaceRoot, run.runId, path);

    await applyAuthorizedGeneratedDiff(api, run, {
      runId: run.runId,
      summary: "Complete the run after apply",
      files: [{ path, changeType: "modify", before, after: `${before}\n// complete\n` }],
    });

    expect(run.status).toBe("complete");
    expect(run.completedAt).toBeTypeOf("string");
  });

  it("restores applied bytes from backup and records the reversal", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const target = join(tempWorkspaceRoot, path);
    const before = readFileSync(target, "utf8");
    const after = `${before}\n// undo me\n`;
    const run = generatedRun(project.projectId, "run_restore_happy");
    const applied = await applyGeneratedDiffTransaction(api, run, {
      runId: run.runId,
      summary: "Create an undo checkpoint",
      files: [{ path, changeType: "modify", before, after }],
    });

    const restored = await api.restoreApplyBackup(project.projectId, applied.backupId!);

    expect(restored).toMatchObject({
      restored: true,
      filesRestored: [path],
      outcome: "restored",
    });
    expect(readFileSync(target, "utf8")).toBe(before);
    expect((await api.getCurrentWork(project.projectId)).recentChanges.at(-1)).toMatchObject({
      path,
      runId: run.runId,
      action: "reverted",
    });
  });

  it("refuses stale undo without clobbering edits made after apply", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const target = join(tempWorkspaceRoot, path);
    const before = readFileSync(target, "utf8");
    const run = generatedRun(project.projectId, "run_restore_stale");
    const applied = await applyGeneratedDiffTransaction(api, run, {
      runId: run.runId,
      summary: "Create a stale undo checkpoint",
      files: [{ path, changeType: "modify", before, after: `${before}\n// applied\n` }],
    });
    const newerEdit = `${before}\n// newer user edit\n`;
    writeFileSync(target, newerEdit, "utf8");

    await expect(
      api.restoreApplyBackup(project.projectId, applied.backupId!),
    ).rejects.toMatchObject({ code: "undo_stale" });
    expect(readFileSync(target, "utf8")).toBe(newerEdit);
  });

  it("runs only configured structured verification commands and reports honest status", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const calls: Array<{ cwd: string; commands: unknown[] }> = [];
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      verificationRunner: {
        async run(commands, cwd) {
          calls.push({ commands, cwd });
          return commands.map((command) => ({
            command,
            status: "failed" as const,
            exitCode: 1,
            durationMs: 5,
            timedOut: false,
            outputTruncated: false,
          }));
        },
      },
    });
    const project = await api.openSampleWorkspace();
    await api.updateSettings(project.projectId, {
      verification: {
        commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }],
      },
    });
    await approveConfiguredVerification(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);

    await expect(api.runVerification(run.runId)).resolves.toMatchObject({
      status: "failed",
      results: [{ status: "failed" }],
    });
    expect(calls).toEqual([{
      cwd: tempWorkspaceRoot,
      commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }],
    }]);
  });

  it("requires exact user approval before executing project verification commands", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const firstMarker = join(tempWorkspaceRoot, "verification-approved-first.txt");
    const changedMarker = join(tempWorkspaceRoot, "verification-approved-changed.txt");
    const firstCommand = {
      command: process.execPath,
      args: [
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(firstMarker)}, 'approved')`,
      ],
      timeoutMs: 10_000,
    };
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      verificationRunner: new VerificationRunner(),
    });
    const project = await api.openSampleWorkspace();
    await api.updateSettings(project.projectId, {
      verification: { commands: [firstCommand] },
    });
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);

    const pending = await api.getVerificationCommandApproval(project.projectId);
    expect(pending).toEqual({
      projectId: project.projectId,
      status: "approval_required",
      commandSetHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      commands: [firstCommand],
    });
    await expect(api.runVerification(run.runId)).rejects.toMatchObject({
      code: "verification_approval_required",
      message: "Verification commands require explicit user approval",
      details: {
        projectId: project.projectId,
        commandSetHash: pending.status === "approval_required"
          ? pending.commandSetHash
          : "unexpected",
        commands: [firstCommand],
      },
    });
    expect(existsSync(firstMarker)).toBe(false);

    if (pending.status !== "approval_required") {
      throw new Error("Expected verification approval to be required");
    }
    await expect(
      api.approveVerificationCommands(project.projectId, pending.commandSetHash),
    ).resolves.toMatchObject({ status: "approved" });
    await expect(api.runVerification(run.runId)).resolves.toMatchObject({
      status: "passed",
      results: [{ status: "passed" }],
    });
    expect(readFileSync(firstMarker, "utf8")).toBe("approved");

    const changedCommand = {
      ...firstCommand,
      args: [
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(changedMarker)}, 'changed')`,
      ],
    };
    await api.updateSettings(project.projectId, {
      verification: { commands: [changedCommand] },
    });
    const changed = await api.getVerificationCommandApproval(project.projectId);
    expect(changed).toMatchObject({
      status: "approval_required",
      commands: [changedCommand],
    });
    expect(changed.status === "approval_required" && changed.commandSetHash)
      .not.toBe(pending.commandSetHash);
    await expect(
      api.approveVerificationCommands(project.projectId, pending.commandSetHash),
    ).rejects.toMatchObject({
      code: "verification_approval_required",
      message: "Verification command approval request is stale",
    });
    await expect(api.runVerification(run.runId)).rejects.toMatchObject({
      code: "verification_approval_required",
    });
    expect(existsSync(changedMarker)).toBe(false);
  });

  it("reports verification not_run when no commands are configured", async () => {
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: copySampleWorkspace() });
    const project = await api.openSampleWorkspace();
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Add Google login and redirect users to profile after successful sign in.",
    });
    const run = await api.confirmExecution(refinement.id);

    await expect(api.runVerification(run.runId)).resolves.toEqual({
      runId: run.runId,
      status: "not_run",
      results: [],
    });
  });

  it("automatically validates, applies through the scoped kernel, verifies, and keeps undo", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const selectedPath = "app/login/page.tsx";
    const targetPath = join(tempWorkspaceRoot, selectedPath);
    const before = readFileSync(targetPath, "utf8");
    const gateway = new AutomaticChangeGateway();
    const verificationCalls: string[] = [];
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
      verificationRunner: {
        async run(commands, cwd) {
          verificationCalls.push(cwd);
          return commands.map((command) => ({
            command,
            status: "failed" as const,
            exitCode: 1,
            durationMs: 5,
            timedOut: false,
            outputTruncated: false,
          }));
        },
      },
    });
    const project = await api.openSampleWorkspace();
    await api.updateSettings(project.projectId, {
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
        model: "fixture-model",
        baseUrl: "https://example.invalid",
        apiKeyRef: "model_profile:fixture-model",
        isDefault: true,
      }],
      verification: {
        commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }],
      },
    });
    await approveConfiguredVerification(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: selectedPath,
      rawPrompt: "Change the login heading to welcome returning users.",
    });
    expect(refinement.executionPolicy).toBe("automatic");

    const run = await api.confirmExecution(refinement.id);
    const completed = await waitForRunStatus(api, run.runId, "complete");
    const events = await api.getAgentRunEvents(run.runId);

    expect(completed.status).toBe("complete");
    expect(readFileSync(targetPath, "utf8")).toContain("<h1>Welcome Back</h1>");
    expect(verificationCalls).toEqual([tempWorkspaceRoot]);
    expect(gateway.requests.map((request) =>
      isRecord(request.input) && typeof request.input.mode === "string"
        ? request.input.mode
        : request.requestKind,
    )).toEqual([
      "prompt_refinement",
      "locate_plan",
      "change_generation",
      "validate_proposal",
    ]);
    expect(events.filter((event) => event.type === "step_started").map((event) =>
      event.step?.kind,
    )).toEqual([
      "context_prepared",
      "locate_plan",
      "generate_proposal",
      "validate_proposal",
      "apply_change",
      "verify_change",
    ]);
    expect(events.find((event) => event.type === "proposal_validation_result"))
      .toMatchObject({ payload: { verdict: "valid", scopeStatus: "compliant" } });
    const applyEvent = events.find((event) => event.type === "apply_result");
    expect(applyEvent).toMatchObject({
      payload: { outcome: "applied", backupId: expect.any(String) },
    });
    expect(events.find((event) => event.type === "verification_completed")?.payload)
      .toMatchObject({ status: "failed" });
    expect(events.some((event) => event.type === "step_failed")).toBe(false);
    expect(readFileSync(targetPath, "utf8")).not.toBe(before);

    const backupId = applyEvent?.type === "apply_result"
      ? applyEvent.payload.backupId
      : undefined;
    expect(backupId).toBeDefined();
    await expect(api.restoreApplyBackup(project.projectId, backupId!)).resolves.toMatchObject({
      restored: true,
      outcome: "restored",
    });
    expect(readFileSync(targetPath, "utf8")).toBe(before);
  });

  it("keeps review_first awaiting manual apply after independent validation", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const selectedPath = "app/login/page.tsx";
    const targetPath = join(tempWorkspaceRoot, selectedPath);
    const before = readFileSync(targetPath, "utf8");
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new AutomaticChangeGateway(),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      filePath: selectedPath,
      rawPrompt: "Change the login heading to welcome returning users.",
    });
    expect(refinement.executionPolicy).toBe("review_first");

    const run = await api.confirmExecution(refinement.id);
    const awaitingReview = await waitForRunStatus(api, run.runId, "awaiting_review");

    expect(awaitingReview.status).toBe("awaiting_review");
    expect(readFileSync(targetPath, "utf8")).toBe(before);
    expect(await api.getAgentRunEvents(run.runId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "proposal_validation_result",
          payload: expect.objectContaining({ verdict: "valid" }),
        }),
      ]),
    );

    const applied = await api.applyDiff(run.runId);
    expect(applied).toMatchObject({ applied: true, outcome: "applied" });
    expect(readFileSync(targetPath, "utf8")).toContain("<h1>Welcome Back</h1>");
    expect((await api.getAgentRun(run.runId)).status).toBe("complete");
  });

  it("batch-validates delegated leaf proposals before an atomic reviewed group apply", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = new Map(delegatedPaths.map((filePath) => [
      filePath,
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"),
    ]));
    const gateway = new NodeDelegationGateway(delegatedPaths);
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    const completedParent = await waitForRunStatus(api, parent.runId, "awaiting_review");
    const parentEvents = await api.getAgentRunEvents(parent.runId);
    const delegatedEvents = parentEvents.filter(
      (event) => event.type === "task_delegated",
    );

    expect(completedParent).toMatchObject({
      scope: { kind: "node-plan", nodeId: "feat_login" },
      role: "node_planner",
      rootRunId: parent.runId,
      relatedFiles: [],
    });
    expect(getLocalApiInternals(api).boundRunAuthorizations.has(parent.runId)).toBe(false);
    expect(getLocalApiInternals(api).orchestrator.getRun(parent.runId)?.nodeContext)
      .toMatchObject({ allowedWritePaths: [] });
    expect(delegatedEvents).toHaveLength(2);
    expect(parentEvents.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "plan_created",
        "task_delegated",
        "child_run_started",
        "child_run_completed",
        "batch_validation_result",
      ]),
    );
    expect(validateAgentRunEventSequence(parentEvents)).toEqual([]);
    expect(JSON.stringify(parentEvents)).not.toContain("<h1>Demo access</h1>");
    expect(gateway.requests.find((request) =>
      isRecord(request.input) && request.input.mode === "plan_node_delegation"
    )?.input).toMatchObject({ writeCapability: false });
    // Multi-file E path must attempt an independent batch model pass.
    expect(
      gateway.requests.some(
        (request) =>
          isRecord(request.input) && request.input.mode === "validate_delegated_batch",
      ),
    ).toBe(true);
    expect(parentEvents.some((event) => event.type === "batch_validation_result")).toBe(true);
    expect(parentEvents.some((event) => event.type === "plan_completed")).toBe(false);

    for (const event of delegatedEvents) {
      if (event.type !== "task_delegated") continue;
      if (!("filePath" in event.payload)) {
        throw new Error("Expected the legacy node plan to delegate only leaf files");
      }
      const child = await api.getAgentRun(event.payload.childRunId);
      const childState = getLocalApiInternals(api).orchestrator.getRun(child.runId);
      const authorization = getLocalApiInternals(api).boundRunAuthorizations.get(child.runId);
      expect(child).toMatchObject({
        scope: {
          kind: "leaf-file",
          nodeId: "feat_login",
          filePath: event.payload.filePath,
        },
        role: "leaf_file_editor",
        parentRunId: parent.runId,
        rootRunId: parent.runId,
        status: "awaiting_review",
      });
      expect(authorization).toMatchObject({
        nodeId: "feat_login",
        selectedFilePath: event.payload.filePath,
      });
      expect(childState?.diff?.files).toEqual([
        expect.objectContaining({
          path: event.payload.filePath,
          changeType: "modify",
        }),
      ]);
      expect(childState?.validationResult).toMatchObject({ verdict: "valid" });
      expect((await api.getAgentRunEvents(child.runId)).some(
        (childEvent) => childEvent.type === "apply_result" ||
          childEvent.step?.kind === "apply_change",
      )).toBe(false);
      expect(validateAgentRunEventSequence(
        await api.getAgentRunEvents(child.runId),
      )).toEqual([]);
    }

    const parentDiff = await api.getDiff(parent.runId);
    expect(parentDiff.runId).toBe(parent.runId);
    expect(parentDiff.files.map((file) => file.path).sort()).toEqual(
      delegatedEvents
        .filter((event) => event.type === "task_delegated" && "filePath" in event.payload)
        .map((event) => (event.type === "task_delegated" && "filePath" in event.payload
          ? event.payload.filePath
          : ""))
        .sort(),
    );
    expect(parentDiff.files.every((file) => file.changeType === "modify")).toBe(true);

    for (const event of delegatedEvents) {
      if (event.type !== "task_delegated") continue;
      await expect(api.applyDiff(event.payload.childRunId)).rejects.toMatchObject({
        code: "diff_apply_unsupported",
      });
    }

    const applied = await api.applyDiff(parent.runId);
    expect(applied).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: delegatedPaths,
      verificationStatus: "not_run",
    });
    expect(applied.backupId).toBeTruthy();
    expect((await api.getAgentRun(parent.runId)).status).toBe("complete");
    expect((await api.getAgentRunEvents(parent.runId)).some(
      (event) => event.type === "plan_completed",
    )).toBe(true);
    expect(readFileSync(join(tempWorkspaceRoot, "app/login/page.tsx"), "utf8"))
      .toContain("<h1>Welcome Back</h1>");
    expect(readFileSync(join(tempWorkspaceRoot, "components/LoginForm.tsx"), "utf8"))
      .toContain("Open demo workspace");
    const manifest = JSON.parse(readFileSync(
      join(tempWorkspaceRoot, ".projectos", "apply-backups", applied.backupId!, "manifest.json"),
      "utf8",
    )) as { files: unknown[]; transactionGroup?: { childRunIds: string[] } };
    expect(manifest.files).toHaveLength(3);
    expect(manifest.files).toContainEqual(expect.objectContaining({
      operation: "internal",
      resource: "current_work",
    }));
    expect(manifest.transactionGroup?.childRunIds).toHaveLength(2);

    const restored = await api.restoreApplyBackup(project.projectId, applied.backupId!);
    expect(restored).toMatchObject({ restored: true, filesRestored: delegatedPaths });
    for (const filePath of delegatedPaths) {
      expect(readFileSync(join(tempWorkspaceRoot, filePath), "utf8"))
        .toBe(before.get(filePath));
    }
  });

  it("completes a delegated parent run when one child file already satisfies the plan", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const gateway = new NodeDelegationGateway(delegatedPaths, [], {
      noChangePaths: ["components/LoginForm.tsx"],
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    const completedParent = await waitForRunStatus(api, parent.runId, "awaiting_review");
    const parentEvents = await api.getAgentRunEvents(parent.runId);
    const delegatedEvents = parentEvents.filter(
      (event) => event.type === "task_delegated",
    );

    expect(completedParent.status).toBe("awaiting_review");
    expect(delegatedEvents).toHaveLength(2);
    expect(parentEvents.some((event) => event.type === "batch_validation_result")).toBe(true);
    expect(parentEvents.some((event) => event.type === "step_failed")).toBe(false);

    const formDelegation = delegatedEvents.find(
      (event) => event.type === "task_delegated" &&
        "filePath" in event.payload &&
        event.payload.filePath === "components/LoginForm.tsx",
    );
    expect(formDelegation?.type).toBe("task_delegated");
    if (formDelegation?.type !== "task_delegated" || !("childRunId" in formDelegation.payload)) {
      throw new Error("Missing form delegation");
    }
    const formChild = await api.getAgentRun(formDelegation.payload.childRunId);
    const formEvents = await api.getAgentRunEvents(formDelegation.payload.childRunId);
    expect(formChild.status).toBe("complete");
    expect(
      formEvents.find((event) => event.type === "run_completed")?.payload,
    ).toMatchObject({ outcome: "no_change_required" });
    expect(
      gateway.requests.filter((request) =>
        isRecord(request.input) &&
        request.input.mode === "locate_plan" &&
        isRecord(request.input.localContext) &&
        isRecord(request.input.localContext.scope) &&
        request.input.localContext.scope.selectedFilePath === "components/LoginForm.tsx",
      ),
    ).toHaveLength(1);
    expect(
      gateway.requests.some((request) =>
        isRecord(request.input) &&
        !("mode" in request.input) &&
        isRecord(request.input.localContext) &&
        isRecord(request.input.localContext.scope) &&
        request.input.localContext.scope.selectedFilePath === "components/LoginForm.tsx",
      ),
    ).toBe(false);

    const loginDelegation = delegatedEvents.find(
      (event) => event.type === "task_delegated" &&
        "filePath" in event.payload &&
        event.payload.filePath === "app/login/page.tsx",
    );
    if (loginDelegation?.type !== "task_delegated" || !("childRunId" in loginDelegation.payload)) {
      throw new Error("Missing login delegation");
    }
    const loginChild = await api.getAgentRun(loginDelegation.payload.childRunId);
    expect(loginChild.status).toBe("awaiting_review");
    const loginState = getLocalApiInternals(api).orchestrator.getRun(loginChild.runId);
    expect(loginState?.diff?.files[0]).toMatchObject({
      path: "app/login/page.tsx",
      changeType: "modify",
    });
    expect(loginState?.diff?.files[0]?.before).not.toBe(loginState?.diff?.files[0]?.after);
  });

  it("auto-applies a delegated group without writing files when every child is already satisfied", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx"];
    const gateway = new NodeDelegationGateway(delegatedPaths, [], {
      noChangePaths: ["app/login/page.tsx"],
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, parent.runId, "complete");
    const parentEvents = await api.getAgentRunEvents(parent.runId);

    expect(parentEvents.some((event) => event.type === "step_failed")).toBe(false);
    expect(
      parentEvents.find((event) => event.type === "run_completed")?.payload,
    ).toMatchObject({ outcome: "no_change_required" });
    const applyEvent = parentEvents.find((event) => event.type === "apply_result");
    expect(applyEvent?.type === "apply_result" ? applyEvent.payload : undefined)
      .toMatchObject({ filesWritten: [], outcome: "applied" });
    expect(
      readFileSync(join(tempWorkspaceRoot, "app/login/page.tsx"), "utf8"),
    ).toBe(readFileSync(join(sampleWorkspaceRoot, "app/login/page.tsx"), "utf8"));
  });

  it("creates one component-owned file and graph/tree ownership in one mixed transaction", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const newFile = "app/login/login-copy.ts";
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const gateway = new ComponentFileCreateGateway(newFile);
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Create a component-owned helper for reusable login copy.",
    });
    const parent = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, parent.runId, "awaiting_review");
    const delegated = (await api.getAgentRunEvents(parent.runId)).find(
      (event) => event.type === "task_delegated",
    );
    if (delegated?.type !== "task_delegated") throw new Error("Missing create delegation");
    const child = await api.getAgentRun(delegated.payload.childRunId);
    const childState = getLocalApiInternals(api).orchestrator.getRun(child.runId) as {
      createContext?: {
        scope: { intendedFilePath: string; responsibility: string };
        nodeContext: { fileManifest: Array<{ relationship: string }> };
        allowedWritePaths: string[];
      };
      diff?: GeneratedDiff;
      validationResult?: { verdict: string; createdFileSha256?: string };
    } | undefined;
    expect(child).toMatchObject({
      scope: { kind: "leaf-create", nodeId: "feat_login", filePath: newFile },
      role: "leaf_file_creator",
      parentRunId: parent.runId,
      status: "awaiting_review",
    });
    expect(childState?.createContext).toMatchObject({
      scope: {
        intendedFilePath: newFile,
        responsibility: "Provide reusable login copy for the login component",
      },
      allowedWritePaths: [newFile],
    });
    expect(childState?.createContext?.nodeContext.fileManifest.every(
      (file) => file.relationship === "connected",
    )).toBe(true);
    expect(childState?.diff?.files).toEqual([expect.objectContaining({
      path: newFile,
      changeType: "create",
      after: expect.stringContaining("LOGIN_COPY"),
    })]);
    expect(childState?.diff?.files[0]).not.toHaveProperty("before");
    expect(childState?.validationResult).toMatchObject({
      verdict: "valid",
      createdFileSha256: expect.stringMatching(/^sha256:/u),
    });
    expect(JSON.stringify(await api.getAgentRunEvents(child.runId))).not.toContain("LOGIN_COPY");
    expect(existsSync(join(tempWorkspaceRoot, newFile))).toBe(false);

    const applied = await api.applyDiff(parent.runId);
    expect(applied).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: [newFile],
      backupId: expect.any(String),
    });
    expect(readFileSync(join(tempWorkspaceRoot, newFile), "utf8"))
      .toContain("LOGIN_COPY");
    expect((await api.getProjectGraph(project.projectId)).fileIndex.find(
      (file) => file.path === newFile,
    )?.nodeIds).toEqual(["feat_login"]);
    expect((await api.getProjectGraph(project.projectId)).nodes.find(
      (node) => node.id === "feat_login",
    )?.linkedFiles).toContainEqual(expect.objectContaining({ path: newFile }));
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId))).toContain(newFile);
    const manifest = JSON.parse(readFileSync(join(
      tempWorkspaceRoot,
      ".projectos",
      "apply-backups",
      applied.backupId!,
      "manifest.json",
    ), "utf8")) as { files: Array<{ operation: string; path: string }> };
    expect(manifest.files.map((file) => [file.operation, file.path])).toEqual([
      ["create", newFile],
      ["internal", ".projectos/graph-product-overlay.json"],
      ["internal", ".projectos/semantic-tree.json"],
      ["internal", ".projectos/current-work.json"],
    ]);

    await expect(api.restoreApplyBackup(project.projectId, applied.backupId!))
      .resolves.toMatchObject({ restored: true, filesRestored: [newFile] });
    expect(existsSync(join(tempWorkspaceRoot, newFile))).toBe(false);
    expect((await api.getProjectGraph(project.projectId)).fileIndex.some(
      (file) => file.path === newFile,
    )).toBe(false);
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId)))
      .not.toContain(newFile);
  });

  it("creates a product component, wiring, and validated scaffold files atomically", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const newFile = "app/login/NewLoginPanel.tsx";
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const gateway = new NodeScaffoldGateway(newFile);
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "container_next_web",
      rawPrompt: "Add a new login guidance component and scaffold its file.",
    });
    const parent = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, parent.runId, "awaiting_review");
    const state = getLocalApiInternals(api).orchestrator.getRun(parent.runId) as {
      nodeScaffoldPlan?: {
        newNodeId: string;
        node: { level: string };
        files: Array<{ filePath: string }>;
      };
      scaffoldChildren?: Array<{ runId: string }>;
    } | undefined;
    expect(state?.nodeScaffoldPlan).toMatchObject({
      node: { level: "component" },
      files: [{ filePath: newFile }],
    });
    expect(state?.scaffoldChildren).toHaveLength(1);
    expect(existsSync(join(tempWorkspaceRoot, newFile))).toBe(false);
    const eventsBeforeApply = await api.getAgentRunEvents(parent.runId);
    expect(eventsBeforeApply.some((event) => event.type === "plan_created")).toBe(true);
    expect(eventsBeforeApply.some(
      (event) => event.type === "task_delegated" &&
        "operation" in event.payload && event.payload.operation === "create",
    )).toBe(true);

    const applied = await api.applyDiff(parent.runId);
    expect(applied).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: [newFile],
      backupId: expect.any(String),
    });
    const nodeId = state!.nodeScaffoldPlan!.newNodeId;
    const graph = await api.getProjectGraph(project.projectId);
    expect(graph.nodes.find((node) => node.id === nodeId)).toMatchObject({
      parentId: "container_next_web",
      level: "component",
      elementType: "component",
      tags: expect.arrayContaining(["product-authored"]),
    });
    expect(graph.nodes.find((node) => node.id === "container_next_web")?.children)
      .toContain(nodeId);
    expect(graph.edges.some((edge) =>
      edge.source === nodeId && edge.target === "feat_login" && edge.relation === "uses"
    )).toBe(true);
    expect(graph.fileIndex.find((file) => file.path === newFile)?.nodeIds).toEqual([nodeId]);
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId))).toContain(newFile);
    expect(readFileSync(join(tempWorkspaceRoot, newFile), "utf8")).toContain("LoginGuidance");

    await expect(api.restoreApplyBackup(project.projectId, applied.backupId!))
      .resolves.toMatchObject({ restored: true, filesRestored: [newFile] });
    expect(existsSync(join(tempWorkspaceRoot, newFile))).toBe(false);
    expect((await api.getProjectGraph(project.projectId)).nodes.some((node) => node.id === nodeId))
      .toBe(false);
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId)))
      .not.toContain(newFile);
  });

  it("automatically commits a validated node scaffold under the automatic policy", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const newFile = "app/login/AutomaticGuidance.tsx";
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeScaffoldGateway(newFile),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "container_next_web",
      rawPrompt: "Add a new login guidance component and scaffold its file.",
    });
    const run = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, run.runId, "complete");
    const state = getLocalApiInternals(api).orchestrator.getRun(run.runId) as {
      applyResult?: ApplyResult;
      nodeScaffoldPlan?: { newNodeId: string };
    } | undefined;
    expect(state?.applyResult).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: [newFile],
      verificationStatus: "not_run",
    });
    expect(existsSync(join(tempWorkspaceRoot, newFile))).toBe(true);
    expect((await api.getProjectGraph(project.projectId)).nodes.some(
      (node) => node.id === state?.nodeScaffoldPlan?.newNodeId,
    )).toBe(true);
  });

  it("executes greenfield initialization as ordered atomic tranches and undoes all atomically", async () => {
    const tempWorkspaceRoot = copyEmptyGraphWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const gateway = new GreenfieldInitializationGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Initialize the complete product graph and scaffold its files.",
    });
    const run = await api.confirmExecution(refinement.id);
    expect(
      (await waitForRunStatus(api, run.runId, "complete")).status,
      JSON.stringify(await api.getAgentRunEvents(run.runId)),
    ).toBe("complete");

    const graph = await api.getProjectGraph(project.projectId);
    expect(graph.nodes).toHaveLength(11);
    expect(graph.fileIndex).toHaveLength(8);
    expect(graph.nodes.every((node) => node.tags.includes("product-authored"))).toBe(true);
    expect(graph.edges).toHaveLength(1);
    for (const path of greenfieldFilePaths()) {
      expect(readFileSync(join(tempWorkspaceRoot, path), "utf8")).toContain("GREENFIELD_FILE");
    }
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId)).sort())
      .toEqual(greenfieldFilePaths().sort());
    const overlay = JSON.parse(readFileSync(
      join(tempWorkspaceRoot, ".projectos", "graph-product-overlay.json"),
      "utf8",
    )) as { createdNodes: unknown[] };
    expect(overlay.createdNodes).toHaveLength(11);

    const events = await api.getAgentRunEvents(run.runId);
    events.forEach((event) => expect(AgentRunEventSchema.safeParse(event).success).toBe(true));
    const progress = events.filter((event) => event.type === "initialization_tranche_progress");
    const committed = progress.filter((event) => event.payload.status === "committed");
    expect(committed).toHaveLength(2);
    expect(committed.map((event) => ({
      order: event.payload.order,
      nodes: event.payload.nodesCreated,
      files: event.payload.filesCreated,
      committedIds: event.payload.committedTrancheIds.length,
      backup: Boolean(event.payload.backupId),
    }))).toEqual([
      { order: 1, nodes: 8, files: 5, committedIds: 1, backup: true },
      { order: 2, nodes: 3, files: 3, committedIds: 2, backup: true },
    ]);
    expect(events.some((event) => event.type === "plan_completed")).toBe(true);

    await expect(api.undoGreenfieldInitialization(project.projectId, run.runId)).resolves.toMatchObject({
      restored: true,
      filesRestored: expect.arrayContaining(greenfieldFilePaths()),
    });
    expect((await api.getProjectGraph(project.projectId)).nodes).toEqual([]);
    expect((await api.getProjectGraph(project.projectId)).fileIndex).toEqual([]);
    expect((await api.getSemanticTree(project.projectId)).roots).toEqual([]);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "graph-product-overlay.json"))).toBe(false);
    expect(greenfieldFilePaths().every((path) => !existsSync(join(tempWorkspaceRoot, path)))).toBe(true);
  });

  it("requires explicit review before each greenfield tranche commit", async () => {
    const tempWorkspaceRoot = copyEmptyGraphWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new GreenfieldInitializationGateway(),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "review_first");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Initialize the complete product graph with explicit tranche review.",
    });
    const run = await api.confirmExecution(refinement.id);

    expect((await waitForRunStatus(api, run.runId, "awaiting_review")).status)
      .toBe("awaiting_review");
    expect((await api.getProjectGraph(project.projectId)).nodes).toHaveLength(0);
    expect((await api.getAgentRunEvents(run.runId)).filter(
      (event) => event.type === "initialization_tranche_progress" &&
        event.payload.status === "committed",
    )).toHaveLength(0);

    await expect(api.applyDiff(run.runId)).resolves.toMatchObject({
      applied: true,
      filesChanged: expect.any(Array),
      backupId: expect.any(String),
    });
    expect((await api.getProjectGraph(project.projectId)).nodes).toHaveLength(8);
    expect((await api.getAgentRun(run.runId)).status).toBe("awaiting_review");
    const afterFirstApprovalEvents = await api.getAgentRunEvents(run.runId);
    expect(afterFirstApprovalEvents.filter(
      (event) => event.type === "initialization_tranche_progress" &&
        event.payload.status === "committed",
    )).toHaveLength(1);
    expect([...afterFirstApprovalEvents].reverse().find(
      (event) => event.type === "run_completed",
    )?.payload).toMatchObject({
      outcome: "greenfield_tranche_validated_awaiting_apply",
      trancheOrder: 2,
      filesApplied: 5,
    });

    await expect(api.applyDiff(run.runId)).resolves.toMatchObject({
      applied: true,
      filesChanged: expect.arrayContaining(greenfieldFilePaths()),
      backupId: expect.any(String),
    });
    expect((await waitForRunStatus(api, run.runId, "complete")).status).toBe("complete");
    expect((await api.getProjectGraph(project.projectId)).nodes).toHaveLength(11);
    expect((await api.getAgentRunEvents(run.runId)).filter(
      (event) => event.type === "initialization_tranche_progress" &&
        event.payload.status === "committed",
    )).toHaveLength(2);
  });

  it("stops after committed greenfield checkpoints when a later graph revision turns stale", async () => {
    const tempWorkspaceRoot = copyEmptyGraphWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const gateway = new GreenfieldInitializationGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Initialize the product with checkpoints.",
    });
    const run = await api.confirmExecution(refinement.id);
    let overlayModified = false;
    api.streamAgentRun(run.runId, (event) => {
      if (
        !overlayModified &&
        event.type === "initialization_tranche_progress" &&
        event.payload.status === "committed"
      ) {
        overlayModified = true;
        const overlayPath = join(tempWorkspaceRoot, ".projectos", "graph-product-overlay.json");
        const overlay = JSON.parse(readFileSync(overlayPath, "utf8")) as {
          createdNodes: Array<{ name: string }>;
        };
        overlay.createdNodes[0]!.name = "Concurrent product rename";
        writeFileSync(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
      }
    });
    await waitForRunStatus(api, run.runId, "error");
    const events = await api.getAgentRunEvents(run.runId);
    const progress = events.filter((event) => event.type === "initialization_tranche_progress");
    expect(
      progress.filter((event) => event.payload.status === "committed"),
      JSON.stringify(events),
    ).toHaveLength(1);
    const failed = [...progress].reverse().find((event) => event.payload.status === "failed");
    expect(failed?.payload).toMatchObject({
      order: 2,
      nodesCreated: 0,
      filesCreated: 0,
      committedTrancheIds: [expect.any(String)],
    });
    expect(failed?.payload.reason).toContain("graph");
    expect((await api.getProjectGraph(project.projectId)).nodes).toHaveLength(8);
    expect(greenfieldFilePaths().filter((path) => existsSync(join(tempWorkspaceRoot, path))))
      .toHaveLength(5);
    expect(events.some((event) => event.type === "plan_completed")).toBe(false);

    const firstBackup = progress.find((event) => event.payload.status === "committed")?.payload.backupId;
    await expect(api.restoreApplyBackup(project.projectId, firstBackup!)).rejects.toMatchObject({
      code: "undo_stale",
    });
    expect((await api.getProjectGraph(project.projectId)).nodes).toHaveLength(8);
  });

  it("keeps an earlier greenfield checkpoint individually reversible after a later validation failure", async () => {
    const tempWorkspaceRoot = copyEmptyGraphWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    let firstTrancheCommitted = false;
    const gateway = new GreenfieldInitializationGateway(undefined, () => {
      if (firstTrancheCommitted) {
        throw new Error("Second tranche validation unavailable");
      }
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Initialize the product with reversible checkpoints.",
    });
    const run = await api.confirmExecution(refinement.id);
    api.streamAgentRun(run.runId, (event) => {
      if (
        event.type === "initialization_tranche_progress" &&
        event.payload.status === "committed"
      ) {
        firstTrancheCommitted = true;
      }
    });
    await waitForRunStatus(api, run.runId, "error");
    const progress = (await api.getAgentRunEvents(run.runId)).filter(
      (event) => event.type === "initialization_tranche_progress",
    );
    const committed = progress.filter((event) => event.payload.status === "committed");
    expect(committed).toHaveLength(1);
    expect(progress.at(-1)?.payload).toMatchObject({
      status: "failed",
      order: 2,
      committedTrancheIds: [committed[0]!.payload.trancheId],
    });
    expect((await api.getProjectGraph(project.projectId)).nodes).toHaveLength(8);

    await expect(
      api.restoreApplyBackup(project.projectId, committed[0]!.payload.backupId!),
    ).resolves.toMatchObject({
      restored: true,
      filesRestored: expect.arrayContaining(greenfieldFilePaths().slice(0, 5)),
    });
    expect((await api.getProjectGraph(project.projectId)).nodes).toEqual([]);
    expect(greenfieldFilePaths().every((path) => !existsSync(join(tempWorkspaceRoot, path)))).toBe(true);
  });

  it("deletes a leaf node and its owned file atomically, then restores the whole task", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const fixture = addDeletionFixture(tempWorkspaceRoot, "leaf");
    const importerPath = "app/layout.tsx";
    const importLine = "import { disposable } from './delete-leaf';\n";
    const importerBefore = `${importLine}${readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")}`;
    writeFileSync(join(tempWorkspaceRoot, importerPath), importerBefore, "utf8");
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const gateway = new NodeDeletionGateway(
      fixture.parentNodeId, fixture.rootNodeId, fixture.nodeIds, false, importerPath, importLine,
    );
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: fixture.parentNodeId,
      rawPrompt: "Delete the obsolete child node.",
    });
    const run = await api.confirmExecution(refinement.id);
    expect(
      (await waitForRunStatus(api, run.runId, "awaiting_review")).status,
      JSON.stringify(await api.getAgentRunEvents(run.runId)),
    ).toBe("awaiting_review");
    const state = getLocalApiInternals(api).orchestrator.getRun(run.runId) as {
      nodeDeletionPlan?: { nodeIds: string[]; ownedFilePaths: string[]; tasks: unknown[] };
      deletionChildren?: Array<{ runId: string }>;
    } | undefined;
    expect(state?.nodeDeletionPlan).toMatchObject({
      nodeIds: fixture.nodeIds,
      ownedFilePaths: fixture.filePaths,
    });
    expect(gateway.requests.some((request) =>
      isRecord(request.input) && request.input.mode === "validate_delegated_batch"
    )).toBe(true);
    const repairDelegation = (await api.getAgentRunEvents(run.runId)).find(
      (event) => event.type === "task_delegated" &&
        "filePath" in event.payload && event.payload.filePath === importerPath,
    );
    expect(repairDelegation?.type === "task_delegated" && "nodeId" in repairDelegation.payload
      ? repairDelegation.payload.nodeId
      : undefined).toBe("feat_home");
    const deletionChild = getLocalApiInternals(api).orchestrator.getRun(
      state!.deletionChildren![0]!.runId,
    ) as {
      run: AgentRun;
      diff?: GeneratedDiff;
      validatedDiffJson?: string;
    } | undefined;
    expect({
      taskCount: state?.nodeDeletionPlan?.tasks.length,
      childCount: state?.deletionChildren?.length,
      parentRunId: deletionChild?.run.parentRunId,
      scope: deletionChild?.run.scope,
      hasDiff: Boolean(deletionChild?.diff),
      validated: deletionChild?.validatedDiffJson === JSON.stringify(deletionChild?.diff),
    }).toEqual({
      taskCount: 2,
      childCount: 2,
      parentRunId: run.runId,
      scope: { kind: "leaf-delete", nodeId: fixture.rootNodeId, filePath: fixture.filePaths[0] },
      hasDiff: true,
      validated: true,
    });
    await expect(api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "node",
      nodeId: fixture.rootNodeId,
      position: { x: 0, y: 0 },
      size: { width: 240, height: 160 },
      note: { body: "Late conflicting artifact" },
    })).rejects.toMatchObject({ code: "diff_stale" });

    const applied = await api.applyDiff(run.runId);
    expect(applied).toMatchObject({ applied: true, outcome: "applied", backupId: expect.any(String) });
    expect(existsSync(join(tempWorkspaceRoot, fixture.filePaths[0]!))).toBe(false);
    expect(readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")).not.toContain(importLine);
    expect((await api.getProjectGraph(project.projectId)).nodes.some(
      (node) => fixture.nodeIds.includes(node.id),
    )).toBe(false);
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId)))
      .not.toContain(fixture.filePaths[0]);
    expect(JSON.parse(readFileSync(
      join(tempWorkspaceRoot, ".projectos", "graph-product-overlay.json"), "utf8",
    )).tombstoneNodeIds).toContain(fixture.rootNodeId);
    expect((await api.getAgentRunEvents(run.runId)).some(
      (event) => event.type === "verification_result",
    )).toBe(true);

    await expect(api.restoreApplyBackup(project.projectId, applied.backupId!)).resolves.toMatchObject({
      restored: true,
      filesRestored: [...fixture.filePaths, importerPath],
    });
    expect(existsSync(join(tempWorkspaceRoot, fixture.filePaths[0]!))).toBe(true);
    expect(readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")).toBe(importerBefore);
    expect((await api.getProjectGraph(project.projectId)).nodes.some(
      (node) => node.id === fixture.rootNodeId,
    )).toBe(true);
  });

  it("deletes a subtree only when explicit membership exactly matches server descendants", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const fixture = addDeletionFixture(tempWorkspaceRoot, "recursive");
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDeletionGateway(
        fixture.parentNodeId, fixture.rootNodeId, fixture.nodeIds, true,
      ),
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: fixture.parentNodeId,
      rawPrompt: "Recursively delete the obsolete child subtree.",
    });
    const run = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, run.runId, "awaiting_review");
    const applied = await api.applyDiff(run.runId);
    expect(applied.applied).toBe(true);
    expect((await api.getProjectGraph(project.projectId)).nodes.filter(
      (node) => fixture.nodeIds.includes(node.id),
    )).toEqual([]);
    await api.restoreApplyBackup(project.projectId, applied.backupId!);
    expect((await api.getProjectGraph(project.projectId)).nodes.filter(
      (node) => fixture.nodeIds.includes(node.id),
    ).map((node) => node.id)).toEqual(expect.arrayContaining(fixture.nodeIds));
  });

  it("rejects implicit subtree deletion and blocks node-scoped map artifacts clearly", async () => {
    const mismatchRoot = copySampleWorkspace();
    const mismatch = addDeletionFixture(mismatchRoot, "recursive");
    const mismatchApi = new ProjectOSLocalApi({
      sampleWorkspaceRoot: mismatchRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDeletionGateway(
        mismatch.parentNodeId, mismatch.rootNodeId, [mismatch.rootNodeId], true,
      ),
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
    });
    const mismatchProject = await mismatchApi.openSampleWorkspace();
    await enableModelExecution(mismatchApi, mismatchProject.projectId);
    const mismatchRefinement = await mismatchApi.refinePrompt({
      projectId: mismatchProject.projectId,
      nodeId: mismatch.parentNodeId,
      rawPrompt: "Delete the subtree.",
    });
    const mismatchRun = await mismatchApi.confirmExecution(mismatchRefinement.id);
    await waitForRunStatus(mismatchApi, mismatchRun.runId, "error");
    expect(JSON.stringify(await mismatchApi.getAgentRunEvents(mismatchRun.runId)))
      .toContain("membership does not match");
    expect(existsSync(join(mismatchRoot, mismatch.filePaths[0]!))).toBe(true);

    const artifactRoot = copySampleWorkspace();
    const artifactFixture = addDeletionFixture(artifactRoot, "leaf");
    const artifactApi = new ProjectOSLocalApi({
      sampleWorkspaceRoot: artifactRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDeletionGateway(
        artifactFixture.parentNodeId, artifactFixture.rootNodeId, artifactFixture.nodeIds, false,
      ),
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
    });
    const artifactProject = await artifactApi.openSampleWorkspace();
    const artifact = await artifactApi.createMapArtifact(artifactProject.projectId, {
      type: "note",
      scope: "node",
      nodeId: artifactFixture.rootNodeId,
      position: { x: 0, y: 0 },
      size: { width: 240, height: 160 },
      note: { body: "Keep this node" },
    });
    await enableModelExecution(artifactApi, artifactProject.projectId);
    const artifactRefinement = await artifactApi.refinePrompt({
      projectId: artifactProject.projectId,
      nodeId: artifactFixture.parentNodeId,
      rawPrompt: "Delete the obsolete child node.",
    });
    const artifactRun = await artifactApi.confirmExecution(artifactRefinement.id);
    await waitForRunStatus(artifactApi, artifactRun.runId, "error");
    expect(JSON.stringify(await artifactApi.getAgentRunEvents(artifactRun.runId))).toContain(artifact.id);
  });

  it("rejects node deletion when the graph ownership basis changes after authorization", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const fixture = addDeletionFixture(tempWorkspaceRoot, "leaf");
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDeletionGateway(
        fixture.parentNodeId, fixture.rootNodeId, fixture.nodeIds, false,
      ),
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: fixture.parentNodeId,
      rawPrompt: "Delete the obsolete child node.",
    });
    const run = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, run.runId, "awaiting_review");
    const graphPath = join(tempWorkspaceRoot, ".projectos", "graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));
    graph.nodes.find((node: { id: string }) => node.id === fixture.rootNodeId).name = "Changed after authorization";
    writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
    await expect(api.applyDiff(run.runId)).rejects.toMatchObject({ code: "diff_stale" });
    expect(existsSync(join(tempWorkspaceRoot, fixture.filePaths[0]!))).toBe(true);
  });

  it("impact-scans, repairs, and deletes one owned file in one reversible transaction", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const targetPath = "app/login/page.tsx";
    const importerPath = "app/layout.tsx";
    const importLine = "import LoginPage from '@/app/login/page'\n";
    const targetBefore = readFileSync(join(tempWorkspaceRoot, targetPath), "utf8");
    const importerBefore = `${importLine}${readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")}`;
    writeFileSync(join(tempWorkspaceRoot, importerPath), importerBefore, "utf8");
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const verificationCalls: string[] = [];
    const gateway = new ImpactDeleteGateway(targetPath, importerPath, importLine);
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
      verificationRunner: {
        async run(commands, cwd) {
          verificationCalls.push(cwd);
          return commands.map((command) => ({
            command,
            status: "failed" as const,
            exitCode: 1,
            durationMs: 2,
            timedOut: false,
            outputTruncated: false,
          }));
        },
      },
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    await api.updateSettings(project.projectId, {
      verification: { commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }] },
    });
    await approveConfiguredVerification(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Delete the login page and repair its direct importers.",
    });
    const parent = await api.confirmExecution(refinement.id);
    const deleteRun = await waitForRunStatus(api, parent.runId, "complete");
    expect(deleteRun.status, JSON.stringify(await api.getAgentRunEvents(parent.runId)))
      .toBe("complete");
    const parentState = getLocalApiInternals(api).orchestrator.getRun(parent.runId) as {
      delegationPlan?: {
        impactAnalysis?: { directImporters: string[]; reverseTransitiveClosure: string[] };
      };
      applyResult?: ApplyResult;
    } | undefined;
    const delegated = (await api.getAgentRunEvents(parent.runId)).filter(
      (event) => event.type === "task_delegated",
    );
    expect(parentState?.delegationPlan?.impactAnalysis).toEqual({
      kind: "file_delete",
      scanner: "typescript_javascript_static_imports_v1",
      targetPath,
      directImporters: [importerPath],
      reverseTransitiveClosure: [importerPath],
    });
    expect(delegated).toHaveLength(2);
    expect(gateway.requests.find((request) =>
      isRecord(request.input) && request.input.mode === "validate_delegated_batch"
    )?.input).toMatchObject({ writeCapability: false });
    expect(JSON.stringify(await api.getAgentRunEvents(parent.runId))).not.toContain(
      "export default function LoginPage",
    );
    const childRuns = await Promise.all(delegated.map((event) => {
      if (event.type !== "task_delegated" || !("filePath" in event.payload)) {
        throw new Error("Expected leaf deletion tasks");
      }
      return api.getAgentRun(event.payload.childRunId);
    }));
    expect(childRuns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: { kind: "leaf-delete", nodeId: "feat_login", filePath: targetPath },
        role: "leaf_file_deleter",
      }),
      expect.objectContaining({
        scope: { kind: "leaf-file", nodeId: "feat_home", filePath: importerPath },
        role: "leaf_file_editor",
      }),
    ]));
    const applied = parentState?.applyResult;
    if (!applied) throw new Error("Missing automatic delete apply result");
    expect(applied).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: [targetPath, importerPath],
      verificationStatus: "failed",
      backupId: expect.any(String),
    });
    expect(verificationCalls).toEqual([tempWorkspaceRoot]);
    expect(existsSync(join(tempWorkspaceRoot, targetPath))).toBe(false);
    expect(readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")).not.toContain(importLine);
    expect((await api.getProjectGraph(project.projectId)).fileIndex.some(
      (file) => file.path === targetPath,
    )).toBe(false);
    expect((await api.getProjectGraph(project.projectId)).nodes.find(
      (node) => node.id === "feat_login",
    )?.linkedFiles.some((file) => file.path === targetPath)).toBe(false);
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId)))
      .not.toContain(targetPath);
    const manifest = JSON.parse(readFileSync(join(
      tempWorkspaceRoot,
      ".projectos",
      "apply-backups",
      applied.backupId!,
      "manifest.json",
    ), "utf8")) as { files: Array<{ operation: string; path: string }> };
    expect(manifest.files.map((file) => [file.operation, file.path])).toEqual([
      ["delete", targetPath],
      ["modify", importerPath],
      ["internal", ".projectos/graph-product-overlay.json"],
      ["internal", ".projectos/semantic-tree.json"],
      ["internal", ".projectos/current-work.json"],
    ]);

    await expect(api.restoreApplyBackup(project.projectId, applied.backupId!))
      .resolves.toMatchObject({
        restored: true,
        filesRestored: [targetPath, importerPath],
      });
    expect(readFileSync(join(tempWorkspaceRoot, targetPath), "utf8")).toBe(targetBefore);
    expect(readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")).toBe(importerBefore);
    expect((await api.getProjectGraph(project.projectId)).fileIndex.find(
      (file) => file.path === targetPath,
    )?.nodeIds).toContain("feat_login");
    expect(flattenSemanticPaths(await api.getSemanticTree(project.projectId))).toContain(targetPath);
  });

  it("blocks deletion when materialized repairs leave a direct dependency", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const targetPath = "app/login/page.tsx";
    const importerPath = "app/layout.tsx";
    const importLine = "import LoginPage from '@/app/login/page'\n";
    const targetBefore = readFileSync(join(tempWorkspaceRoot, targetPath), "utf8");
    const importerBefore = `${importLine}${readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")}`;
    writeFileSync(join(tempWorkspaceRoot, importerPath), importerBefore, "utf8");
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new ImpactDeleteGateway(targetPath, importerPath, importLine, "leave_reference"),
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Delete the login page.",
    });
    const parent = await api.confirmExecution(refinement.id);
    const blockedDeleteRun = await waitForRunStatus(api, parent.runId, "awaiting_review");
    const blockedParentEvents = await api.getAgentRunEvents(parent.runId);
    const repairDelegation = blockedParentEvents.find(
      (event) => event.type === "task_delegated" &&
        "filePath" in event.payload && event.payload.filePath === importerPath,
    );
    const blockedDiagnostics = repairDelegation?.type === "task_delegated"
      ? await api.getAgentRunEvents(repairDelegation.payload.childRunId)
      : blockedParentEvents;
    expect(blockedDeleteRun.status, JSON.stringify(blockedDiagnostics))
      .toBe("awaiting_review");

    await expect(api.applyDiff(parent.runId)).rejects.toMatchObject({
      code: "proposal_validation_failed",
    });
    expect(readFileSync(join(tempWorkspaceRoot, targetPath), "utf8")).toBe(targetBefore);
    expect(readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")).toBe(importerBefore);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects deletion when a new direct importer appears after authorization", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const targetPath = "app/login/page.tsx";
    const importerPath = "app/layout.tsx";
    const lateImporterPath = "app/about/page.tsx";
    const importLine = "import LoginPage from '@/app/login/page'\n";
    const importerBefore = `${importLine}${readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")}`;
    const lateImporterBefore = readFileSync(join(tempWorkspaceRoot, lateImporterPath), "utf8");
    writeFileSync(join(tempWorkspaceRoot, importerPath), importerBefore, "utf8");
    const store = new ProjectOSWorkspaceStore();
    const kernel = new writeTransactionModule.RecoverableWriteTransactionKernel();
    const gateway = new ImpactDeleteGateway(
      targetPath,
      importerPath,
      importLine,
      "remove_reference",
      () => writeFileSync(
        join(tempWorkspaceRoot, lateImporterPath),
        `${importLine}${lateImporterBefore}`,
        "utf8",
      ),
    );
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      workspaceStore: store,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
      writeTransactionRuntime: { module: writeTransactionModule, kernel },
      workspaceTransactionCoordinator: new WorkspaceTransactionCoordinator(store, kernel),
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Delete the login page.",
    });
    const parent = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, parent.runId, "awaiting_review");

    await expect(api.applyDiff(parent.runId)).rejects.toMatchObject({ code: "diff_stale" });
    expect(existsSync(join(tempWorkspaceRoot, targetPath))).toBe(true);
    expect(readFileSync(join(tempWorkspaceRoot, importerPath), "utf8")).toBe(importerBefore);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("fails closed when impact-aware deletion cannot scan the workspace", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const targetPath = "app/login/page.tsx";
    const targetBefore = readFileSync(join(tempWorkspaceRoot, targetPath), "utf8");
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new ImpactDeleteGateway(targetPath, "app/api/auth/route.ts", ""),
      dependencyImpactScanner: {
        scan() {
          throw new Error("unsupported project dependency configuration");
        },
      },
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Delete the login page.",
    });
    const parent = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, parent.runId, "error");

    expect(JSON.stringify(await api.getAgentRunEvents(parent.runId))).toContain(
      "Impact-aware deletion unavailable",
    );
    expect(readFileSync(join(tempWorkspaceRoot, targetPath), "utf8")).toBe(targetBefore);
  });

  it("rejects a model-chosen delete repair set before binding child authorization", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const targetPath = "app/login/page.tsx";
    const targetBefore = readFileSync(join(tempWorkspaceRoot, targetPath), "utf8");
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new ImpactDeleteGateway(
        targetPath,
        "app/layout.tsx",
        "",
        "remove_reference",
        undefined,
        "lib/auth.ts",
      ),
      dependencyImpactScanner: new DependencyImpactScanner(),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Delete the login page and also repair lib/auth.ts.",
    });
    const parent = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, parent.runId, "error");

    expect(JSON.stringify(await api.getAgentRunEvents(parent.runId))).toContain(
      "Impact-aware deletion requires exactly one requested target",
    );
    expect(readFileSync(join(tempWorkspaceRoot, targetPath), "utf8")).toBe(targetBefore);
  });

  it("automatically commits a validated delegated group and exposes one stale-safe undo", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = new Map(delegatedPaths.map((filePath) => [
      filePath,
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"),
    ]));
    const verificationCalls: string[] = [];
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDelegationGateway(delegatedPaths),
      runEventPersistence: "memory",
      verificationRunner: {
        async run(commands, cwd) {
          verificationCalls.push(cwd);
          return commands.map((command) => ({
            command,
            status: "failed" as const,
            exitCode: 1,
            durationMs: 5,
            timedOut: false,
            outputTruncated: false,
          }));
        },
      },
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    await api.updateSettings(project.projectId, {
      verification: {
        commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }],
      },
    });
    await approveConfiguredVerification(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    expect((await waitForRunStatus(api, parent.runId, "complete")).status).toBe("complete");
    const parentState = getLocalApiInternals(api).orchestrator.getRun(parent.runId) as {
      applyResult?: ApplyResult;
    } | undefined;
    expect(parentState?.applyResult).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: delegatedPaths,
      verificationStatus: "failed",
    });
    expect(verificationCalls).toEqual([tempWorkspaceRoot]);
    const backupId = parentState?.applyResult?.backupId;
    expect(backupId).toBeTruthy();
    const events = await api.getAgentRunEvents(parent.runId);
    expect(events.some((event) => event.type === "plan_completed")).toBe(true);
    expect(events.some((event) =>
      event.type === "verification_completed" && event.payload?.status === "failed"
    )).toBe(true);
    expect(events.filter((event) => event.type === "child_run_outcome")).toHaveLength(2);

    writeFileSync(join(tempWorkspaceRoot, delegatedPaths[0]!), "newer user edit", "utf8");
    await expect(api.restoreApplyBackup(project.projectId, backupId!)).rejects.toMatchObject({
      code: "undo_stale",
    });
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[0]!), "utf8"))
      .toBe("newer user edit");
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[1]!), "utf8"))
      .toContain("Open demo workspace");
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[1]!), "utf8"))
      .not.toBe(before.get(delegatedPaths[1]!));
  });

  it("fails malformed batch validation closed before creating a backup or writing files", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = delegatedPaths.map((filePath) =>
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"));
    const gateway = new NodeDelegationGateway(delegatedPaths, [], {
      invalidProposalPaths: delegatedPaths,
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    expect((await waitForRunStatus(api, parent.runId, "error")).status).toBe("error");
    // Invalid leaf validation fails closed before batch validation is attempted.
    expect(gateway.requests.filter((request) =>
      isRecord(request.input) && request.input.mode === "validate_delegated_batch"
    )).toHaveLength(0);
    expect((await api.getAgentRunEvents(parent.runId)).some(
      (event) => event.type === "plan_completed",
    )).toBe(false);
    delegatedPaths.forEach((filePath, index) => {
      expect(readFileSync(join(tempWorkspaceRoot, filePath), "utf8")).toBe(before[index]);
    });
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rechecks snapshot freshness after batch validation and commits no agent writes when stale", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const untouchedForm = readFileSync(
      join(tempWorkspaceRoot, "components/LoginForm.tsx"),
      "utf8",
    );
    const gateway = new NodeDelegationGateway(delegatedPaths);
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    api.streamAgentRun(parent.runId, (event) => {
      if (event.type === "batch_validation_result") {
        writeFileSync(join(tempWorkspaceRoot, "app/login/page.tsx"), "concurrent user edit", "utf8");
      }
    });
    expect((await waitForRunStatus(api, parent.runId, "error")).status).toBe("error");
    expect(readFileSync(join(tempWorkspaceRoot, "app/login/page.tsx"), "utf8"))
      .toBe("concurrent user edit");
    expect(readFileSync(join(tempWorkspaceRoot, "components/LoginForm.tsx"), "utf8"))
      .toBe(untouchedForm);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rolls back a mid-group commit failure and emits recovery metadata if rollback also fails", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = new Map(delegatedPaths.map((filePath) => [
      filePath,
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"),
    ]));
    const api = new FailCommitAndRollbackApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDelegationGateway(delegatedPaths),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    expect((await waitForRunStatus(api, parent.runId, "error")).status).toBe("error");
    const events = await api.getAgentRunEvents(parent.runId);
    const recovery = events.find(
      (event) => event.type === "apply_result" && event.payload.outcome === "recovery_required",
    );
    expect(recovery?.type).toBe("apply_result");
    const backupId = recovery?.type === "apply_result" ? recovery.payload.backupId : undefined;
    expect(backupId).toBeTruthy();
    expect(existsSync(join(
      tempWorkspaceRoot,
      ".projectos",
      "apply-backups",
      backupId!,
      "recovery-manifest.json",
    ))).toBe(true);
    expect(events.some((event) =>
      event.type === "plan_partially_completed" &&
      event.payload.reason === "recovery_required"
    )).toBe(true);
    expect(events.some((event) => event.type === "plan_completed")).toBe(false);
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[1]!), "utf8"))
      .toBe(before.get(delegatedPaths[1]!));
  });

  it("rolls back every committed child when a later group commit fails", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = new Map(delegatedPaths.map((filePath) => [
      filePath,
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"),
    ]));
    const api = new FailSecondCommitApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDelegationGateway(delegatedPaths),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    expect((await waitForRunStatus(api, parent.runId, "error")).status).toBe("error");
    for (const filePath of delegatedPaths) {
      expect(readFileSync(join(tempWorkspaceRoot, filePath), "utf8"))
        .toBe(before.get(filePath));
    }
    const events = await api.getAgentRunEvents(parent.runId);
    expect(events.some((event) => event.type === "plan_completed")).toBe(false);
    expect(events.some((event) =>
      event.type === "plan_partially_completed" &&
      event.payload.reason === "group_apply_failed"
    )).toBe(true);
  });

  it("rejects a child proposal mutated after exact batch validation", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = delegatedPaths.map((filePath) =>
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"));
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDelegationGateway(delegatedPaths),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "review_first");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Update the login experience across its owned files.",
    });

    const parent = await api.confirmExecution(refinement.id);
    expect((await waitForRunStatus(api, parent.runId, "awaiting_review")).status)
      .toBe("awaiting_review");
    const delegated = (await api.getAgentRunEvents(parent.runId)).find(
      (event) => event.type === "task_delegated",
    );
    if (!delegated || delegated.type !== "task_delegated") {
      throw new Error("Expected a delegated child run");
    }
    const childState = getLocalApiInternals(api).orchestrator.getRun(
      delegated.payload.childRunId,
    ) as { diff?: GeneratedDiff } | undefined;
    childState!.diff!.files[0]!.after = "tampered after validation";

    await expect(api.applyDiff(parent.runId)).rejects.toMatchObject({
      code: "proposal_validation_failed",
    });
    delegatedPaths.forEach((filePath, index) => {
      expect(readFileSync(join(tempWorkspaceRoot, filePath), "utf8")).toBe(before[index]);
    });
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects a node plan that attempts to delegate outside the graph-owned scope", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new NodeDelegationGateway(["package.json"]),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Change an unrelated file.",
    });

    const parent = await api.confirmExecution(refinement.id);
    const failedParent = await waitForRunStatus(api, parent.runId, "error");
    const events = await api.getAgentRunEvents(parent.runId);

    expect(failedParent.status).toBe("error");
    expect(events.some((event) => event.type === "plan_created")).toBe(false);
    expect(events.some((event) => event.type === "task_delegated")).toBe(false);
    expect(events.some((event) => event.type === "step_failed")).toBe(true);
    expect(getLocalApiInternals(api).boundRunAuthorizations.size).toBe(0);
    expect(getLocalApiInternals(api).orchestrator.runs.size).toBe(1);
  });

  it("fails node planning closed after one sanitized retry", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const gateway = new NodeDelegationGateway(
      ["app/login/page.tsx"],
      ["MALFORMED_NODE_PLAN_ONE", "MALFORMED_NODE_PLAN_TWO"],
    );
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      nodeId: "feat_login",
      rawPrompt: "Plan a node change.",
    });

    const parent = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, parent.runId, "error");
    const events = await api.getAgentRunEvents(parent.runId);
    const planRequests = gateway.requests.filter((request) =>
      isRecord(request.input) && request.input.mode === "plan_node_delegation"
    );

    expect(planRequests).toHaveLength(2);
    expect(planRequests[1]?.input).toMatchObject({
      planRetry: { reason: "malformed_json" },
    });
    expect(events.some((event) => event.type === "plan_created")).toBe(false);
    expect(events.some((event) => event.type === "task_delegated")).toBe(false);
    expect(JSON.stringify(events)).not.toContain("MALFORMED_NODE_PLAN");
    expect(getLocalApiInternals(api).boundRunAuthorizations.size).toBe(0);
  });

  it("rejects an out-of-scope diff at apply before staging or backup", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const runId = "run_apply_scope_rejected";
    const selectedPath = "app/login/page.tsx";
    const otherPath = "lib/auth.ts";
    const before = readFileSync(join(tempWorkspaceRoot, otherPath), "utf8");
    authorizeTestRun(api, project.projectId, tempWorkspaceRoot, runId, selectedPath);

    await expect(applyAuthorizedGeneratedDiff(
      api,
      generatedRun(project.projectId, runId),
      {
        runId,
        summary: "Attempt an unauthorized connected-file edit",
        files: [{
          path: otherPath,
          changeType: "modify",
          before,
          after: `${before}\n// unauthorized\n`,
        }],
      },
    )).rejects.toMatchObject({ code: "diff_scope_violation" });

    expect(readFileSync(join(tempWorkspaceRoot, otherPath), "utf8")).toBe(before);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("applies an in-scope modify through the authorized apply path", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const runId = "run_apply_scope_allowed";
    const path = "app/login/page.tsx";
    const before = readFileSync(join(tempWorkspaceRoot, path), "utf8");
    const after = `${before}\n// authorized\n`;
    authorizeTestRun(api, project.projectId, tempWorkspaceRoot, runId, path);

    const result = await applyAuthorizedGeneratedDiff(
      api,
      generatedRun(project.projectId, runId),
      {
        runId,
        summary: "Apply an authorized selected-file edit",
        files: [{ path, changeType: "modify", before, after }],
      },
    );

    expect(result).toMatchObject({ applied: true, filesChanged: [path] });
    expect(readFileSync(join(tempWorkspaceRoot, path), "utf8")).toBe(after);
  });

  it("rejects an out-of-scope external diff from getDiff and apply", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const runId = "run_external_scope_rejected";
    const selectedPath = "app/login/page.tsx";
    const otherPath = "lib/auth.ts";
    const before = readFileSync(join(tempWorkspaceRoot, otherPath), "utf8");
    const run = generatedRun(project.projectId, runId);
    const diff: GeneratedDiff = {
      runId,
      summary: "External agent attempted a connected-file edit",
      files: [{
        path: otherPath,
        changeType: "modify",
        before,
        after: `${before}\n// unauthorized external edit\n`,
      }],
    };
    authorizeTestRun(api, project.projectId, tempWorkspaceRoot, runId, selectedPath);
    getLocalApiInternals(api).externalRunsByRunId.set(runId, {
      run,
      events: [],
      diff,
      config: externalAgentConfig(),
    });

    await expect(api.getDiff(runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    await expect(api.applyDiff(runId)).rejects.toMatchObject({
      code: "diff_scope_violation",
    });
    expect(readFileSync(join(tempWorkspaceRoot, otherPath), "utf8")).toBe(before);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects a stale generated diff without changing any file", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const current = readFileSync(join(tempWorkspaceRoot, path), "utf8");

    await expect(applyGeneratedDiffTransaction(api, generatedRun(project.projectId, "run_stale"), {
      runId: "run_stale",
      summary: "Stale change",
      files: [{ path, changeType: "modify", before: `${current}stale`, after: "replacement" }],
    })).rejects.toMatchObject({ code: "diff_stale" });

    expect(readFileSync(join(tempWorkspaceRoot, path), "utf8")).toBe(current);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects escaped and protected generated diff targets without writing", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const currentWorkPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const currentWork = readFileSync(currentWorkPath, "utf8");
    symlinkSync(
      join(tempWorkspaceRoot, "app", "login", "page.tsx"),
      join(tempWorkspaceRoot, "login-link.tsx"),
    );

    for (const path of ["../outside.ts", ".git/config", ".projectos/current-work.json", "login-link.tsx"]) {
      const runId = `run_protected_${path.length}`;
      await expect(applyGeneratedDiffTransaction(api, generatedRun(project.projectId, runId), {
        runId,
        summary: "Unsafe change",
        files: [{ path, changeType: "modify", before: "", after: "unsafe" }],
      })).rejects.toMatchObject({ code: "diff_apply_unsupported" });
    }

    expect(readFileSync(currentWorkPath, "utf8")).toBe(currentWork);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects run mismatches and canonical duplicate targets before staging", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const before = readFileSync(join(tempWorkspaceRoot, path), "utf8");

    await expect(applyGeneratedDiffTransaction(api, generatedRun(project.projectId, "expected_run"), {
      runId: "different_run",
      summary: "Mismatched run",
      files: [{ path, changeType: "modify", before, after: `${before}\nchanged\n` }],
    })).rejects.toMatchObject({ code: "diff_apply_failed" });

    await expect(applyGeneratedDiffTransaction(api, generatedRun(project.projectId, "run_duplicate"), {
      runId: "run_duplicate",
      summary: "Duplicate target",
      files: [path, "app/login/./page.tsx"].map((candidate) => ({
        path: candidate,
        changeType: "modify" as const,
        before,
        after: `${before}\nchanged\n`,
      })),
    })).rejects.toMatchObject({ code: "diff_apply_unsupported" });

    expect(readFileSync(join(tempWorkspaceRoot, path), "utf8")).toBe(before);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects create and delete generated changes in modify-only v1", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    for (const changeType of ["create", "delete"] as const) {
      const runId = `run_${changeType}`;
      await expect(applyGeneratedDiffTransaction(api, generatedRun(project.projectId, runId), {
        runId,
        summary: `${changeType} is unsupported`,
        files: [{
          path: changeType === "create" ? "new-file.ts" : "app/login/page.tsx",
          changeType,
          before: "before",
          after: "after",
        }],
      })).rejects.toMatchObject({ code: "diff_apply_unsupported" });
    }
    expect(existsSync(join(tempWorkspaceRoot, "new-file.ts"))).toBe(false);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rolls back every committed file when a later generated write fails", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new FailSecondCommitApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const paths = ["app/login/page.tsx", "lib/auth.ts"];
    const originals = paths.map((path) => readFileSync(join(tempWorkspaceRoot, path), "utf8"));
    const currentWorkPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const currentWork = readFileSync(currentWorkPath, "utf8");
    const runId = "run_rollback";

    await expect(applyGeneratedDiffTransaction(api, generatedRun(project.projectId, runId), {
      runId,
      summary: "Rollback a partial apply",
      files: paths.map((path, index) => ({
        path,
        changeType: "modify" as const,
        before: originals[index]!,
        after: `${originals[index]}\n// changed ${index}\n`,
      })),
    })).rejects.toMatchObject({ code: "diff_apply_failed" });

    for (const [index, path] of paths.entries()) {
      expect(readFileSync(join(tempWorkspaceRoot, path), "utf8")).toBe(originals[index]);
    }
    expect(readFileSync(currentWorkPath, "utf8")).toBe(currentWork);
    const backups = readdirSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"));
    expect(backups).toHaveLength(1);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups", backups[0]!, "manifest.json"))).toBe(true);
  });

  it("rolls source back when the journaled current-work commit fails", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new FailSecondCommitApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const target = join(tempWorkspaceRoot, path);
    const before = readFileSync(target, "utf8");
    const currentWorkPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const currentWorkBefore = readFileSync(currentWorkPath, { encoding: null });
    const runId = "run_current_work_rollback";

    await expect(applyGeneratedDiffTransaction(api, generatedRun(project.projectId, runId), {
      runId,
      summary: "Fail the current-work operation",
      files: [{
        path,
        changeType: "modify",
        before,
        after: `${before}\n// must roll back\n`,
      }],
    })).rejects.toMatchObject({ code: "diff_apply_failed" });

    expect(readFileSync(target, "utf8")).toBe(before);
    expect(readFileSync(currentWorkPath, { encoding: null })).toEqual(currentWorkBefore);
  });

  it("keeps apply bytes and current work together when undo metadata cannot commit", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ToggleCurrentWorkCommitFailureApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const path = "app/login/page.tsx";
    const target = join(tempWorkspaceRoot, path);
    const before = readFileSync(target, "utf8");
    const after = `${before}\n// applied before undo failure\n`;
    const runId = "run_undo_current_work_rollback";
    const applied = await applyGeneratedDiffTransaction(
      api,
      generatedRun(project.projectId, runId),
      {
        runId,
        summary: "Create an undo checkpoint",
        files: [{ path, changeType: "modify", before, after }],
      },
    );
    const currentWorkPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const currentWorkAfterApply = readFileSync(currentWorkPath, { encoding: null });
    api.failCurrentWorkCommits();

    await expect(api.restoreApplyBackup(project.projectId, applied.backupId!))
      .rejects.toMatchObject({ code: "diff_apply_failed" });

    expect(readFileSync(target, "utf8")).toBe(after);
    expect(readFileSync(currentWorkPath, { encoding: null })).toEqual(currentWorkAfterApply);
  });

  it("returns recovery_required with a usable backup when rollback fails", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new FailCommitAndRollbackApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const paths = ["app/login/page.tsx", "lib/auth.ts"];
    const originals = paths.map((path) => readFileSync(join(tempWorkspaceRoot, path), "utf8"));
    const runId = "run_recovery_required";

    const result = await applyGeneratedDiffTransaction(api, generatedRun(project.projectId, runId), {
      runId,
      summary: "Expose failed rollback recovery",
      files: paths.map((path, index) => ({
        path,
        changeType: "modify" as const,
        before: originals[index]!,
        after: `${originals[index]}\n// changed ${index}\n`,
      })),
    });

    expect(result).toMatchObject({
      runId,
      applied: false,
      filesChanged: [paths[0]],
      verificationStatus: "not_run",
      outcome: "recovery_required",
    });
    expect(result.backupId).toBeTypeOf("string");
    expect(result.reason).toContain(result.backupId!);
    const backupRoot = join(tempWorkspaceRoot, ".projectos", "apply-backups", result.backupId!);
    const manifest = JSON.parse(readFileSync(join(backupRoot, "manifest.json"), "utf8")) as {
      files: Array<{ path: string; backupFile: string }>;
    };
    expect(manifest.files
      .filter((file) => file.path !== ".projectos/current-work.json")
      .map((file) => file.path)).toEqual(paths);
    expect(manifest.files).toContainEqual(expect.objectContaining({
      path: ".projectos/current-work.json",
      operation: "internal",
      resource: "current_work",
    }));
    expect(readFileSync(join(backupRoot, manifest.files[0]!.backupFile), "utf8")).toBe(originals[0]);
  });

  it("persists map artifact create, update, and delete operations", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    const created = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "node",
      nodeId: "feat_login",
      position: { x: 120, y: 180 },
      size: { width: 280, height: 160 },
      note: { body: "Characterization note" },
    });
    const updated = await api.updateMapArtifact(project.projectId, created.id, {
      position: { x: 240, y: 320 },
      note: { body: "Updated characterization note" },
    });

    expect(updated).toMatchObject({
      id: created.id,
      type: "note",
      scope: "node",
      nodeId: "feat_login",
      position: { x: 240, y: 320 },
      note: { body: "Updated characterization note" },
    });

    const reopenedApi = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
    });
    const reopenedProject = await reopenedApi.openSampleWorkspace();
    expect(
      (await reopenedApi.getMapContent(reopenedProject.projectId)).artifacts.find(
        (artifact) => artifact.id === created.id,
      ),
    ).toMatchObject(updated);

    await reopenedApi.deleteMapArtifact(reopenedProject.projectId, created.id);
    expect(
      (await reopenedApi.getMapContent(reopenedProject.projectId)).artifacts.some(
        (artifact) => artifact.id === created.id,
      ),
    ).toBe(false);

    expect(await api.getMapContent(project.projectId)).toEqual(
      await reopenedApi.getMapContent(reopenedProject.projectId),
    );
  });

  it("persists stack ordering, active member, and detach semantics", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const stackId = "stack_characterization";
    const first = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 100, y: 100 },
      size: { width: 280, height: 160 },
      note: { body: "First stack member" },
    });
    await api.initMapArtifactStack(project.projectId, first.id, stackId);
    const second = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 999, y: 999 },
      size: { width: 400, height: 300 },
      note: { body: "Second stack member" },
      stackId,
    });

    expect(second).toMatchObject({
      stackId,
      stackOrder: 1,
      stackActive: true,
      position: first.position,
      size: first.size,
    });
    const reorderedActive = await api.reorderMapArtifactStack(
      project.projectId,
      stackId,
      { orderedArtifactIds: [second.id, first.id] },
    );
    expect(reorderedActive.id).toBe(second.id);
    expect(
      await api.setMapArtifactStackActive(project.projectId, stackId, first.id),
    ).toMatchObject({ id: first.id, stackActive: true });

    const detached = await api.detachMapArtifactFromStack(
      project.projectId,
      second.id,
      { position: { x: 640, y: 480 } },
    );
    expect(detached).toMatchObject({
      id: second.id,
      position: { x: 640, y: 480 },
    });
    expect(detached.stackId).toBeUndefined();

    const persisted = await api.getMapContent(project.projectId);
    expect(
      persisted.artifacts.find((artifact) => artifact.id === first.id)?.stackId,
    ).toBeUndefined();
    expect(
      persisted.artifacts.find((artifact) => artifact.id === second.id)?.stackId,
    ).toBeUndefined();
  });

  it("keeps work-group references valid when grouped artifacts form a stack", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const first = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 0, y: 0 },
      size: { width: 280, height: 160 },
      note: { body: "First grouped stack member" },
    });
    const second = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 280, y: 0 },
      size: { width: 280, height: 160 },
      note: { body: "Second grouped stack member" },
    });
    await api.applyMapWorkGroupMutation(project.projectId, {
      type: "merge_or_create_group",
      items: [
        { kind: "member", memberNodeId: first.id },
        { kind: "member", memberNodeId: second.id },
      ],
    });

    const stackId = "stack_grouped";
    await api.initMapArtifactStack(project.projectId, first.id, stackId);
    await api.attachMapArtifactToStack(project.projectId, second.id, {
      targetStackId: stackId,
    });

    const persisted = MapContentDocumentSchema.parse(
      await api.getMapContent(project.projectId),
    );
    expect(persisted.workGroups).toHaveLength(1);
    expect(persisted.workGroups[0]?.memberNodeIds).toEqual([stackId]);
    expect(
      persisted.artifacts.every((artifact) => artifact.workGroupId === persisted.workGroups[0]?.id),
    ).toBe(true);
  });

  it("persists image assets and workgroup lifecycle operations", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const imageDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=";
    const image = await api.createMapImageArtifact(project.projectId, {
      scope: "project",
      position: { x: 40, y: 40 },
      size: { width: 160, height: 120 },
      fileName: "characterization.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      dataUrl: imageDataUrl,
    });
    if (image.type !== "image") {
      throw new Error("Expected image artifact");
    }
    expect(image.image.assetPath).toMatch(/^map-assets\//u);
    const absoluteAssetPath = join(
      tempWorkspaceRoot,
      ".projectos",
      image.image.assetPath,
    );
    expect(existsSync(absoluteAssetPath)).toBe(true);
    expect(
      await api.getMapAssetDataUrl(project.projectId, image.image.assetPath),
    ).toBe(imageDataUrl);

    const first = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 0, y: 0 },
      size: { width: 280, height: 160 },
      note: { body: "WorkGroup first" },
    });
    const second = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 280, y: 0 },
      size: { width: 280, height: 160 },
      note: { body: "WorkGroup second" },
    });
    const grouped = await api.applyMapWorkGroupMutation(project.projectId, {
      type: "merge_or_create_group",
      items: [
        { kind: "member", memberNodeId: first.id },
        { kind: "member", memberNodeId: second.id },
      ],
    });
    const workGroup = grouped.workGroups.find((group) =>
      group.memberNodeIds.includes(first.id),
    );
    expect(workGroup?.memberNodeIds).toEqual([first.id, second.id]);
    const renamed = await api.updateMapWorkGroup(
      project.projectId,
      workGroup!.id,
      { title: "Characterized group" },
    );
    expect(
      renamed.workGroups.find((group) => group.id === workGroup!.id)?.title,
    ).toBe("Characterized group");

    await api.deleteMapArtifact(project.projectId, first.id);
    expect(
      (await api.getMapContent(project.projectId)).workGroups.some(
        (group) => group.id === workGroup!.id,
      ),
    ).toBe(false);
    await api.deleteMapArtifact(project.projectId, image.id);
    expect(existsSync(absoluteAssetPath)).toBe(false);
    await expect(
      api.getMapAssetDataUrl(project.projectId, image.image.assetPath),
    ).rejects.toMatchObject({ code: "map_asset_not_found" });
  });

  it("does not write an image asset when stack validation fails", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const note = await api.createMapArtifact(project.projectId, {
      type: "note",
      scope: "project",
      position: { x: 0, y: 0 },
      size: { width: 280, height: 160 },
      note: { body: "Non-image stack" },
    });
    await api.initMapArtifactStack(project.projectId, note.id, "stack_note");
    const assetDirectory = join(tempWorkspaceRoot, ".projectos", "map-assets");
    const before = existsSync(assetDirectory) ? readdirSync(assetDirectory) : [];

    await expect(api.createMapImageArtifact(project.projectId, {
      scope: "project",
      position: { x: 40, y: 40 },
      size: { width: 160, height: 120 },
      stackId: "stack_note",
      fileName: "orphan.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    })).rejects.toMatchObject({ code: "map_stack_type_mismatch" });

    expect(existsSync(assetDirectory) ? readdirSync(assetDirectory) : []).toEqual(before);
  });

  it("reports the seeded auth harness record and starts its debug fix stream", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    const record = await api.reportError(
      project.projectId,
      "Error: OAuth provider callback failed while resolving /api/auth for the login flow.",
    );
    const run = await api.startHarnessFix(record.errorId);
    const events = collectRunEvents(api, run.runId);

    expect(record.businessNodeId).toBe("feat_login");
    expect(record.hypotheses.some((hypothesis) => hypothesis.rejected)).toBe(true);
    expect(
      record.hypotheses.some(
        (hypothesis) => hypothesis.id === record.chosenRootCauseId,
      ),
    ).toBe(true);
    expect(run.runId).toBe("run_auth_bugfix");
    expect(run.kind).toBe("debug_fix");
    expect(events).toHaveLength(7);
    expect(events[0]?.type).toBe("run_started");
    expect(events.at(-1)?.type).toBe("run_completed");
    for (const event of events) {
      expect(AgentRunEventSchema.safeParse(event).success).toBe(true);
    }
    expect(validateAgentRunEventSequence(events)).toEqual([]);
  });

  it("recursively delegates a global change and atomically commits all leaf writes once", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = new Map(delegatedPaths.map((filePath) => [
      filePath,
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"),
    ]));
    const gateway = new RecursiveHierarchyGateway();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Update login consistently across the product.",
    });

    const root = await api.confirmExecution(refinement.id);
    expect(root).toMatchObject({
      scope: { kind: "global" },
      role: "global",
      relatedNodeIds: [],
      relatedFiles: [],
      rootRunId: root.runId,
    });
    expect((await waitForRunStatus(api, root.runId, "complete")).status).toBe("complete");

    const rootState = getLocalApiInternals(api).orchestrator.getRun(root.runId);
    expect(rootState?.globalContext).toMatchObject({
      scope: { kind: "global" },
      allowedReadPaths: [],
      allowedWritePaths: [],
    });
    expect(rootState?.wholeTreeTransactionPlan?.sourcePlanIds).toHaveLength(4);
    expect(rootState?.wholeTreeTransactionPlan?.leaves.map((leaf) => leaf.filePath))
      .toEqual(delegatedPaths);
    expect(rootState?.applyResult).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: delegatedPaths,
    });
    expect(getLocalApiInternals(api).boundRunAuthorizations.has(root.runId)).toBe(false);
    const hierarchyRuns = [...getLocalApiInternals(api).orchestrator.runs.values()]
      .map((state) => (state as { run: AgentRun }).run);
    expect(hierarchyRuns.map((run) => run.scope?.kind)).toEqual(
      expect.arrayContaining(["global", "context", "container", "component", "leaf-file"]),
    );
    for (const run of hierarchyRuns.filter((candidate) => candidate.scope?.kind !== "leaf-file")) {
      expect(run.relatedFiles).toEqual([]);
      expect(getLocalApiInternals(api).boundRunAuthorizations.has(run.runId)).toBe(false);
    }
    expect(getLocalApiInternals(api).boundRunAuthorizations.size).toBe(2);
    const persistedEvents = await Promise.all(
      hierarchyRuns.map((run) => api.getAgentRunEvents(run.runId)),
    );
    expect(JSON.stringify(persistedEvents)).not.toContain("<h1>Demo access</h1>");
    expect(JSON.stringify(persistedEvents)).not.toContain(
      "The demo workspace could not be opened. Try again.",
    );
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[0]!), "utf8"))
      .toContain("<h1>Welcome Back</h1>");
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[1]!), "utf8"))
      .toContain("Open demo workspace");
    const backupId = rootState?.applyResult?.backupId;
    expect(backupId).toBeTruthy();
    const manifest = JSON.parse(readFileSync(
      join(tempWorkspaceRoot, ".projectos", "apply-backups", backupId!, "manifest.json"),
      "utf8",
    )) as { files: unknown[]; transactionGroup?: { childRunIds: string[] } };
    expect(manifest.files).toHaveLength(3);
    expect(manifest.files).toContainEqual(expect.objectContaining({
      operation: "internal",
      resource: "current_work",
    }));
    expect(manifest.transactionGroup?.childRunIds).toHaveLength(2);
    expect(gateway.requests.filter((request) =>
      isRecord(request.input) && request.input.mode === "plan_graph_delegation"
    )).toHaveLength(4);
    expect(gateway.requests.filter((request) =>
      isRecord(request.input) && request.input.mode === "validate_whole_tree_batch"
    )).toHaveLength(1);

    const restored = await api.restoreApplyBackup(project.projectId, backupId!);
    expect(restored).toMatchObject({ restored: true, filesRestored: delegatedPaths });
    for (const filePath of delegatedPaths) {
      expect(readFileSync(join(tempWorkspaceRoot, filePath), "utf8")).toBe(before.get(filePath));
    }
  });

  it("pauses a zero-write global hierarchy before applying when review-first is configured", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = new Map(delegatedPaths.map((filePath) => [
      filePath,
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"),
    ]));
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new RecursiveHierarchyGateway(),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "review_first");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Update login consistently across the product.",
    });

    const root = await api.confirmExecution(refinement.id);
    expect((await waitForRunStatus(api, root.runId, "awaiting_review")).status)
      .toBe("awaiting_review");

    const internals = getLocalApiInternals(api);
    const rootState = internals.orchestrator.getRun(root.runId);
    expect(rootState?.globalContext).toMatchObject({
      scope: { kind: "global" },
      allowedReadPaths: [],
      allowedWritePaths: [],
    });
    expect(rootState?.wholeTreeTransactionPlan?.leaves.map((leaf) => leaf.filePath))
      .toEqual(delegatedPaths);
    expect(rootState?.applyResult).toBeUndefined();
    expect(internals.boundRunAuthorizations.has(root.runId)).toBe(false);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
    for (const filePath of delegatedPaths) {
      expect(readFileSync(join(tempWorkspaceRoot, filePath), "utf8")).toBe(before.get(filePath));
    }
  });

  it("keeps a failed whole-tree verification applied and undoable while erroring every run", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const delegatedPaths = ["app/login/page.tsx", "components/LoginForm.tsx"];
    const before = new Map(delegatedPaths.map((filePath) => [
      filePath,
      readFileSync(join(tempWorkspaceRoot, filePath), "utf8"),
    ]));
    const verificationCalls: string[] = [];
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new RecursiveHierarchyGateway(),
      runEventPersistence: "memory",
      verificationRunner: {
        async run(commands, cwd) {
          verificationCalls.push(cwd);
          return commands.map((command) => ({
            command,
            status: "failed" as const,
            exitCode: 1,
            durationMs: 5,
            timedOut: false,
            outputTruncated: false,
          }));
        },
      },
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    await api.updateSettings(project.projectId, {
      verification: {
        commands: [{ command: "npm", args: ["test"], timeoutMs: 10_000 }],
      },
    });
    await approveConfiguredVerification(api, project.projectId);
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Update login consistently across the product.",
    });

    const root = await api.confirmExecution(refinement.id);
    const terminalRun = await waitForTerminalRunStatus(api, root.runId);
    const rootState = getLocalApiInternals(api).orchestrator.getRun(root.runId);

    expect(terminalRun.status).toBe("error");
    expect(verificationCalls).toEqual([tempWorkspaceRoot]);
    expect(rootState?.applyResult).toMatchObject({
      applied: true,
      outcome: "applied",
      filesChanged: delegatedPaths,
      verificationStatus: "failed",
      backupId: expect.any(String),
    });
    const relatedRuns = [...getLocalApiInternals(api).orchestrator.runs.values()]
      .map((candidate) => candidate as { run: AgentRun })
      .filter((candidate) =>
        candidate.run.runId === root.runId || candidate.run.rootRunId === root.runId
      );
    expect(relatedRuns.length).toBeGreaterThan(1);
    expect(relatedRuns.every((candidate) => candidate.run.status === "error")).toBe(true);
    const events = await api.getAgentRunEvents(root.runId);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "verification_completed",
        payload: expect.objectContaining({ status: "failed" }),
      }),
      expect.objectContaining({
        type: "step_failed",
        step: expect.objectContaining({ kind: "verify_group", status: "error" }),
      }),
    ]));
    expect(events.some((event) =>
      event.type === "run_completed" &&
      event.payload?.outcome === "whole_tree_transaction_applied"
    )).toBe(false);
    expect(validateAgentRunEventSequence(events)).toEqual([]);
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[0]!), "utf8"))
      .toContain("<h1>Welcome Back</h1>");
    expect(readFileSync(join(tempWorkspaceRoot, delegatedPaths[1]!), "utf8"))
      .toContain("Open demo workspace");

    const backupId = rootState?.applyResult?.backupId;
    if (!backupId) throw new Error("Missing whole-tree backup after failed verification");
    await expect(api.restoreApplyBackup(project.projectId, backupId)).resolves.toMatchObject({
      restored: true,
      filesRestored: delegatedPaths,
    });
    for (const filePath of delegatedPaths) {
      expect(readFileSync(join(tempWorkspaceRoot, filePath), "utf8")).toBe(before.get(filePath));
    }
  });

  it("rechecks every recursive leaf snapshot before the one whole-tree commit", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const pagePath = join(tempWorkspaceRoot, "app/login/page.tsx");
    const formPath = join(tempWorkspaceRoot, "components/LoginForm.tsx");
    const formBefore = readFileSync(formPath, "utf8");
    const gateway = new RecursiveHierarchyGateway({
      onWholeTreeValidation: () => {
        writeFileSync(pagePath, "concurrent user edit", "utf8");
      },
    });
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: gateway,
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "automatic");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Update login consistently across the product.",
    });

    const root = await api.confirmExecution(refinement.id);
    expect((await waitForRunStatus(api, root.runId, "error")).status).toBe("error");
    expect(readFileSync(pagePath, "utf8")).toBe("concurrent user edit");
    expect(readFileSync(formPath, "utf8")).toBe(formBefore);
    expect(existsSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"))).toBe(false);
  });

  it("rejects graph-layer skipping even when a caller invokes delegation directly", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot: tempWorkspaceRoot,
      localContextAssembler: new LocalContextAssembler(),
      modelGateway: new RecursiveHierarchyGateway(),
      runEventPersistence: "memory",
    });
    const project = await api.openSampleWorkspace();
    await enableModelExecution(api, project.projectId, "review_first");
    const refinement = await api.refinePrompt({
      projectId: project.projectId,
      rawPrompt: "Update login consistently across the product.",
    });
    const root = await api.confirmExecution(refinement.id);
    await waitForRunStatus(api, root.runId, "awaiting_review");
    const rootState = getLocalApiInternals(api).orchestrator.getRun(root.runId) as {
      hierarchyPlan?: HierarchyDelegationPlan;
    } | undefined;
    const originalPlan = rootState?.hierarchyPlan;
    expect(originalPlan).toBeTruthy();
    const maliciousPlan: HierarchyDelegationPlan = {
      ...originalPlan!,
      planId: "plan_skip_graph_layer",
      tasks: [{
        taskId: "task_skip",
        targetKind: "planner",
        nodeId: "feat_login",
        level: "component",
        objective: "Skip directly to a component",
        acceptanceCriteria: ["The graph boundary is bypassed"],
      }],
    };
    const directApi = api as unknown as {
      createHierarchyChildRuns(
        workspace: unknown,
        parentRun: AgentRun,
        plan: HierarchyDelegationPlan,
      ): Promise<unknown>;
      requireLoadedWorkspace(projectId: string): unknown;
    };
    await expect(directApi.createHierarchyChildRuns(
      directApi.requireLoadedWorkspace(project.projectId),
      root,
      maliciousPlan,
    )).rejects.toMatchObject({ code: "diff_scope_violation" });
    expect(readFileSync(join(tempWorkspaceRoot, "app/login/page.tsx"), "utf8"))
      .toContain("<h1>Demo access</h1>");
  });

  it("throws typed errors for unknown diff, error, and harness ids", async () => {
    const tempWorkspaceRoot = copySampleWorkspace();
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();

    await expect(api.getDiff("missing-run")).rejects.toMatchObject({
      code: "run_not_found",
    } satisfies Partial<ProjectOSError>);
    await expect(api.reportError(project.projectId, "unmapped failure")).rejects.toMatchObject({
      code: "harness_record_not_found",
    } satisfies Partial<ProjectOSError>);
    await expect(api.startHarnessFix("missing-error")).rejects.toMatchObject({
      code: "harness_record_not_found",
    } satisfies Partial<ProjectOSError>);
  });
});

function collectRunEvents(api: ProjectOSLocalApi, runId: string): AgentRunEvent[] {
  const events: AgentRunEvent[] = [];
  const disposable = api.streamAgentRun(runId, (event) => {
    events.push(AgentRunEventSchema.parse(event));
  });
  disposable.dispose();
  return events;
}

type LocalApiTestInternals = {
  workspacesByProjectId: Map<string, {
    project: { projectId: string };
    mapContent: { artifacts: MapArtifact[] };
  }>;
  refinementsById: Map<string, {
    refinement: { affectedFiles: string[]; affectedNodeIds: string[] };
    requestedScope: {
      nodeId: string | undefined;
      selectedFilePath: string | undefined;
    };
    responseLanguage: string;
  }>;
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
  boundCreateRunAuthorizations: Map<string, { projectId: string }>;
  boundDeleteRunAuthorizations: Map<string, { projectId: string }>;
  boundImpactDeleteTransactions: Map<string, { projectId: string }>;
  boundNodeDeletionTransactions: Map<string, { projectId: string }>;
  activeNodeDeletionReservations: Map<string, Set<string>>;
  boundGreenfieldInitializations: Map<string, { projectId: string }>;
  activeGreenfieldInitializations: Map<string, string>;
  activeOrchestratorRuns: Map<string, { runId: string; unsubscribe?: () => void }>;
  pendingOrchestratorStarts: Map<string, {
    workspace: { project: { projectId: string } };
    runId: string;
  }>;
  fallbackNotices: Map<string, string>;
  externalRunsByRunId: Map<string, {
    run: AgentRun;
    events: AgentRunEvent[];
    diff?: GeneratedDiff;
    config: {
      id: string;
      name: string;
      protocol: "http";
      endpoint: string;
      authType: "none";
      eventFormat: "projectos_events";
    };
  }>;
  orchestrator: {
    runs: Map<string, unknown>;
    startRun(...args: unknown[]): Promise<void>;
    getRun(runId: string): {
      localContext?: unknown;
      nodeContext?: unknown;
      globalContext?: GlobalContextBundle;
      diff?: GeneratedDiff;
      validationResult?: { verdict: "valid" | "invalid" };
      wholeTreeTransactionPlan?: WholeTreeTransactionPlan;
      applyResult?: ApplyResult;
    } | undefined;
  };
  validateGeneratedDiffScope(runId: string, diff: GeneratedDiff): void;
};

function getLocalApiInternals(api: ProjectOSLocalApi): LocalApiTestInternals {
  return api as unknown as LocalApiTestInternals;
}

async function enableModelExecution(
  api: ProjectOSLocalApi,
  projectId: string,
  changeExecutionPolicy: "automatic" | "review_first" = "review_first",
): Promise<void> {
  await api.updateSettings(projectId, {
    presentationMode: false,
    execution: {
      mode: "model",
      defaultModelProfileId: "fixture-model",
      defaultAgentProfileId: "default-feature",
      thinkingDepth: "off",
      changeExecutionPolicy,
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

async function approveConfiguredVerification(
  api: ProjectOSLocalApi,
  projectId: string,
): Promise<void> {
  const approval = await api.getVerificationCommandApproval(projectId);
  if (approval.status === "approval_required") {
    await api.approveVerificationCommands(projectId, approval.commandSetHash);
  }
}

function copySampleWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-api-"));
  temporaryRoots.push(tempRoot);
  const tempWorkspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleWorkspaceRoot, tempWorkspaceRoot, { recursive: true });
  rmSync(join(tempWorkspaceRoot, ".projectos", "settings.json"), { force: true });
  rmSync(join(tempWorkspaceRoot, ".projectos", "apply-backups"), {
    recursive: true,
    force: true,
  });
  // Prevent bootstrap from seeding the dev sample's real model profile into tests.
  const project = JSON.parse(
    readFileSync(join(tempWorkspaceRoot, ".projectos", "project.json"), "utf8"),
  ) as { projectId: string };
  const fixtureSettings = createDefaultSettings(project.projectId, false);
  fixtureSettings.execution.mode = "fixture";
  fixtureSettings.modelProfiles = [];
  writeFileSync(
    join(tempWorkspaceRoot, ".projectos", "settings.json"),
    JSON.stringify(fixtureSettings, null, 2),
    "utf8",
  );
  return tempWorkspaceRoot;
}

function addOwnedDesignStyleFile(root: string, filePath: string, text: string): void {
  const absolutePath = join(root, filePath);
  mkdirSync(resolve(absolutePath, ".."), { recursive: true });
  writeFileSync(absolutePath, text, "utf8");
  const graphPath = join(root, ".projectos", "graph.json");
  const graph = JSON.parse(readFileSync(graphPath, "utf8")) as {
    nodes: Array<{
      id: string;
      linkedFiles: Array<{ path: string; role: string; summary: string }>;
    }>;
    fileIndex: Array<Record<string, unknown>>;
  };
  const owner = graph.nodes.find((node) => node.id === "feat_dashboard");
  if (!owner) throw new Error("Dashboard owner fixture was not found");
  owner.linkedFiles.push({
    path: filePath,
    role: "supporting",
    summary: "Disposable owned stylesheet for deterministic design-write coverage.",
  });
  graph.fileIndex.push({
    path: filePath,
    type: "style",
    nodeIds: ["feat_dashboard"],
    imports: [],
    exports: [],
    size: Buffer.byteLength(text),
    lastModified: new Date(0).toISOString(),
  });
  writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

  const treePath = join(root, ".projectos", "semantic-tree.json");
  const tree = JSON.parse(readFileSync(treePath, "utf8")) as {
    roots: Array<Record<string, unknown>>;
  };
  const visit = (nodes: Array<Record<string, unknown>>): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node["sourceNodeId"] === "feat_dashboard") return node;
      const children = node["children"];
      if (Array.isArray(children)) {
        const found = visit(children as Array<Record<string, unknown>>);
        if (found) return found;
      }
    }
    return undefined;
  };
  const treeOwner = visit(tree.roots);
  if (!treeOwner || !Array.isArray(treeOwner["children"])) {
    throw new Error("Dashboard semantic-tree owner fixture was not found");
  }
  (treeOwner["children"] as Array<Record<string, unknown>>).push({
    id: `tree_file_${filePath.replace(/[^a-z0-9]+/giu, "_").replace(/^_|_$/gu, "")}`,
    label: filePath,
    kind: "file",
    path: filePath,
    sourceNodeId: "feat_dashboard",
    status: "normal",
    children: [],
  });
  writeFileSync(treePath, `${JSON.stringify(tree, null, 2)}\n`, "utf8");
}

function copyEmptyGraphWorkspace(): string {
  const root = copySampleWorkspace();
  const graphPath = join(root, ".projectos", "graph.json");
  const graph = JSON.parse(readFileSync(graphPath, "utf8")) as {
    nodes: unknown[];
    edges: unknown[];
    fileIndex: unknown[];
    fileRelations?: unknown[];
    topology?: { rootIds: string[]; maxDepth: number; totalNodes: number };
  };
  graph.nodes = [];
  graph.edges = [];
  graph.fileIndex = [];
  graph.fileRelations = [];
  graph.topology = { rootIds: [], maxDepth: 0, totalNodes: 0 };
  writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  const treePath = join(root, ".projectos", "semantic-tree.json");
  const tree = JSON.parse(readFileSync(treePath, "utf8")) as { roots: unknown[] };
  tree.roots = [];
  writeFileSync(treePath, `${JSON.stringify(tree, null, 2)}\n`, "utf8");
  const currentWorkPath = join(root, ".projectos", "current-work.json");
  const currentWork = JSON.parse(readFileSync(currentWorkPath, "utf8")) as Record<string, unknown>;
  delete currentWork.focusedNodeId;
  delete currentWork.focusedFilePath;
  delete currentWork.activeRunId;
  delete currentWork.activeErrorId;
  currentWork.recentChanges = [];
  currentWork.unresolvedErrors = [];
  writeFileSync(currentWorkPath, `${JSON.stringify(currentWork, null, 2)}\n`, "utf8");
  rmSync(join(root, ".projectos", "demo-scenarios"), { recursive: true, force: true });
  rmSync(join(root, ".projectos", "harness"), { recursive: true, force: true });
  rmSync(join(root, ".projectos", "agent-runs"), { recursive: true, force: true });
  rmSync(join(root, ".projectos", "demo-reset.json"), { force: true });
  rmSync(join(root, ".projectos", "graph-product-overlay.json"), { force: true });
  for (const teamFile of [
    "team-acceptances.json",
    "team-collab.json",
    "team-decisions.json",
    "team-handoffs.json",
    "team-ideas.json",
  ]) {
    rmSync(join(root, ".projectos", teamFile), { force: true });
  }
  return root;
}

function greenfieldFilePaths(): string[] {
  return [1, 2].flatMap((container) =>
    [1, 2, 3, 4].map((component) => `greenfield-${container}-${component}.ts`));
}

function addDeletionFixture(
  workspaceRoot: string,
  mode: "leaf" | "recursive",
): { parentNodeId: string; rootNodeId: string; nodeIds: string[]; filePaths: string[] } {
  const graphPath = join(workspaceRoot, ".projectos", "graph.json");
  const treePath = join(workspaceRoot, ".projectos", "semantic-tree.json");
  const graph = JSON.parse(readFileSync(graphPath, "utf8")) as {
    nodes: Array<Record<string, unknown> & { id: string; children?: string[]; linkedFiles: Array<{ path: string }> }>;
    edges: Array<Record<string, unknown>>;
    fileIndex: Array<Record<string, unknown>>;
  };
  const tree = JSON.parse(readFileSync(treePath, "utf8")) as {
    roots: Array<Record<string, unknown>>;
  };
  const componentTemplate = structuredClone(graph.nodes.find((node) => node.id === "feat_login")!);
  const containerTemplate = structuredClone(graph.nodes.find((node) => node.id === "container_next_web")!);
  const componentId = mode === "leaf" ? "component_delete_leaf" : "component_delete_child";
  const rootNodeId = mode === "leaf" ? componentId : "container_delete_root";
  const parentNodeId = mode === "leaf" ? "container_next_web" : "system_saas_starter";
  const filePath = mode === "leaf" ? "app/delete-leaf.ts" : "app/delete-subtree.ts";
  const component = {
    ...componentTemplate,
    id: componentId,
    name: "Disposable component",
    parentId: mode === "leaf" ? parentNodeId : rootNodeId,
    children: [],
    linkedFiles: [{ path: filePath, role: "primary", summary: "Disposable source" }],
    upstream: [],
    downstream: [],
    refs: [],
  };
  if (mode === "recursive") {
    graph.nodes.push({
      ...containerTemplate,
      id: rootNodeId,
      name: "Disposable container",
      parentId: parentNodeId,
      children: [componentId],
      linkedFiles: [],
      upstream: [],
      downstream: [],
      refs: [],
    });
  }
  graph.nodes.push(component);
  const parent = graph.nodes.find((node) => node.id === parentNodeId)!;
  parent.children = [...(parent.children ?? []), rootNodeId];
  graph.edges.push({
    id: `edge_${rootNodeId}_fixture`, source: rootNodeId, target: "feat_home",
    relation: "uses", label: "fixture edge", confidence: 1, evidence: "S5b fixture wiring",
  });
  graph.fileIndex.push({
    path: filePath, type: "component", nodeIds: [componentId], imports: [], exports: [], status: "normal",
  });
  tree.roots.push({
    id: `tree_${rootNodeId}`,
    label: "Disposable subtree",
    kind: "feature",
    sourceNodeId: rootNodeId,
    status: "active",
    children: mode === "recursive" ? [{
      id: `tree_${componentId}`,
      label: "Disposable component",
      kind: "feature",
      sourceNodeId: componentId,
      status: "active",
      children: [{
        id: `tree_file_${componentId}`,
        label: filePath,
        kind: "file",
        path: filePath,
        sourceNodeId: componentId,
        status: "normal",
        children: [],
      }],
    }] : [{
      id: `tree_file_${componentId}`,
      label: filePath,
      kind: "file",
      path: filePath,
      sourceNodeId: componentId,
      status: "normal",
      children: [],
    }],
  });
  writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  writeFileSync(treePath, `${JSON.stringify(tree, null, 2)}\n`, "utf8");
  writeFileSync(join(workspaceRoot, filePath), "export const disposable = true;\n", "utf8");
  return {
    parentNodeId,
    rootNodeId,
    nodeIds: mode === "leaf" ? [componentId] : [rootNodeId, componentId],
    filePaths: [filePath],
  };
}

function generatedRun(projectId: string, runId: string): AgentRun {
  return {
    runId,
    projectId,
    kind: "feature_change",
    status: "awaiting_review",
    relatedNodeIds: ["feat_login"],
    relatedFiles: [],
    scope: { kind: "component", nodeId: "feat_login" },
    role: "node_planner",
    startedAt: "2026-07-17T00:00:00.000Z",
    completedAt: "2026-07-17T00:01:00.000Z",
  };
}

async function applyAuthorizedGeneratedDiff(
  api: ProjectOSLocalApi,
  run: AgentRun,
  diff: GeneratedDiff,
): Promise<ApplyResult> {
  const generatedApplyApi = api as unknown as {
    applyDiffFromGenerated(
      runId: string,
      generatedDiff: GeneratedDiff,
      agentRun: AgentRun,
    ): Promise<ApplyResult>;
  };
  return generatedApplyApi.applyDiffFromGenerated(run.runId, diff, run);
}

async function applyGeneratedDiffTransaction(
  api: ProjectOSLocalApi,
  run: AgentRun,
  diff: GeneratedDiff,
): Promise<ApplyResult> {
  const generatedApplyApi = api as unknown as {
    commitGeneratedDiffTransaction(
      runId: string,
      generatedDiff: GeneratedDiff,
      agentRun: AgentRun,
    ): Promise<ApplyResult>;
  };
  return generatedApplyApi.commitGeneratedDiffTransaction(run.runId, diff, run);
}

function authorizeTestRun(
  api: ProjectOSLocalApi,
  projectId: string,
  workspaceRoot: string,
  runId: string,
  selectedFilePath: string,
): void {
  const canonicalPath = realpathSync(join(workspaceRoot, selectedFilePath));
  const stats = lstatSync(canonicalPath);
  getLocalApiInternals(api).boundRunAuthorizations.set(runId, {
    projectId,
    nodeId: "feat_login",
    selectedFilePath,
    bundleHash: `sha256:${"0".repeat(64)}`,
    allowedWriteTarget: {
      relativePath: selectedFilePath,
      canonicalPath,
      device: stats.dev,
      inode: stats.ino,
    },
  });
}

function externalAgentConfig() {
  return {
    id: "external-test",
    name: "External Test",
    protocol: "http" as const,
    endpoint: "https://agent.example",
    authType: "none" as const,
    eventFormat: "projectos_events" as const,
  };
}

async function waitForRunStatus(
  api: ProjectOSLocalApi,
  runId: string,
  status: AgentRun["status"],
): Promise<AgentRun> {
  const deadline = Date.now() + 5_000;
  let run = await api.getAgentRun(runId);
  while (run.status !== status && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    run = await api.getAgentRun(runId);
  }
  return run;
}

async function waitForTerminalRunStatus(
  api: ProjectOSLocalApi,
  runId: string,
): Promise<AgentRun> {
  const deadline = Date.now() + 5_000;
  let run = await api.getAgentRun(runId);
  while (run.status !== "complete" && run.status !== "error" && Date.now() < deadline) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    run = await api.getAgentRun(runId);
  }
  return run;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function flattenSemanticPaths(tree: Awaited<ReturnType<ProjectOSLocalApi["getSemanticTree"]>>): string[] {
  const paths: string[] = [];
  const visit = (node: (typeof tree.roots)[number]) => {
    if (node.path) paths.push(node.path);
    node.children.forEach(visit);
  };
  tree.roots.forEach(visit);
  return paths;
}

class GreenfieldInitializationGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];
  private batchCount = 0;

  constructor(
    private readonly beforeSecondTrancheCommit?: () => void,
    private readonly onValidateCreatedFile?: () => void,
  ) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    let output: string;
    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Initialize the complete product graph and files.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: [],
        affectedFiles: [],
        confidence: 1,
      });
    } else if (mode === "plan_graph_delegation") {
      output = JSON.stringify(makeGreenfieldProposal());
    } else if (mode === "create_file") {
      const context = isRecord(input.createContext) ? input.createContext : {};
      const scope = isRecord(context.scope) ? context.scope : {};
      const path = typeof scope.intendedFilePath === "string" ? scope.intendedFilePath : "missing.ts";
      output = JSON.stringify({
        summary: `Create ${path}`,
        path,
        content: `export const GREENFIELD_FILE = ${JSON.stringify(path)};\n`,
      });
    } else if (mode === "validate_created_file") {
      this.onValidateCreatedFile?.();
      const proposal = isRecord(input.proposal) && Array.isArray(input.proposal.files)
        ? input.proposal.files[0]
        : undefined;
      const path = isRecord(proposal) && typeof proposal.path === "string" ? proposal.path : "missing.ts";
      const criteria = Array.isArray(input.acceptanceCriteria)
        ? input.acceptanceCriteria.filter((value): value is string => typeof value === "string")
        : [];
      output = JSON.stringify({
        path,
        verdict: "valid",
        criteria: criteria.map((criterion) => ({
          criterion,
          status: "satisfied",
          explanation: "The bounded file implements its declared responsibility.",
        })),
        scopeAssessment: { status: "compliant", explanation: "Exactly one authorized file is proposed." },
        summary: "The greenfield file is valid.",
        rationale: "The proposal matches its server-owned file task.",
      });
    } else if (mode === "validate_delegated_batch") {
      this.batchCount += 1;
      if (this.batchCount === 2) this.beforeSecondTrancheCommit?.();
      const plan = isRecord(input.delegationPlan) && Array.isArray(input.delegationPlan.tasks)
        ? input.delegationPlan.tasks
        : [];
      const evidence = Array.isArray(input.childEvidence) ? input.childEvidence : [];
      output = JSON.stringify({
        verdict: "valid",
        tasks: plan.map((rawTask, index) => {
          const task = isRecord(rawTask) ? rawTask : {};
          const child = isRecord(evidence[index]) ? evidence[index] : {};
          const criteria = Array.isArray(task.acceptanceCriteria)
            ? task.acceptanceCriteria.filter((value): value is string => typeof value === "string")
            : [];
          return {
            taskId: task.taskId,
            childRunId: child.childRunId,
            path: task.filePath,
            status: "consistent",
            criteria: criteria.map((criterion) => ({
              criterion,
              status: "satisfied",
              explanation: "The independently validated leaf satisfies this criterion.",
            })),
            summary: "The leaf is consistent with the tranche.",
          };
        }),
        crossFileAssessment: { status: "consistent", summary: "All tranche files are mutually consistent." },
        summary: "The initialization tranche is valid.",
        rationale: "Every server-derived task passed independent validation.",
      });
    } else {
      output = "{}";
    }
    return {
      requestId: `request_greenfield_${this.requests.length}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

function makeGreenfieldProposal(): Record<string, unknown> {
  const nodes: Array<Record<string, unknown>> = [{
    tempRef: "context_product",
    parentTempRef: null,
    node: {
      name: "Greenfield Product",
      summary: "The initialized product boundary.",
      responsibility: "Own the complete greenfield product.",
      level: "context",
      tags: ["greenfield"],
    },
    files: [],
  }];
  for (let container = 1; container <= 2; container += 1) {
    nodes.push({
      tempRef: `container_${container}`,
      parentTempRef: "context_product",
      node: {
        name: `Product Area ${container}`,
        summary: `Owns product area ${container}.`,
        responsibility: `Coordinate product area ${container}.`,
        level: "container",
        tags: [],
      },
      files: [],
    });
    for (let component = 1; component <= 4; component += 1) {
      const path = `greenfield-${container}-${component}.ts`;
      nodes.push({
        tempRef: `component_${container}_${component}`,
        parentTempRef: `container_${container}`,
        node: {
          name: `Capability ${container}.${component}`,
          summary: `Implements capability ${container}.${component}.`,
          responsibility: `Own capability ${container}.${component}.`,
          level: "component",
          tags: [],
        },
        files: [{
          filePath: path,
          responsibility: `Implement capability ${container}.${component}.`,
          objective: `Create ${path}.`,
          acceptanceCriteria: [`${path} exports GREENFIELD_FILE`],
        }],
      });
    }
  }
  return {
    version: "0.1.0",
    objective: "Initialize the complete greenfield product.",
    nodes,
    wiring: [{
      tempRef: "edge_product_flow",
      sourceTempRef: "component_1_1",
      targetTempRef: "component_2_4",
      relation: "data_flows_to",
      label: "Product flow",
      purpose: "Connect the entry and completion capabilities.",
    }],
    rationale: "Two product areas provide a bounded initial architecture.",
  };
}

class NodeScaffoldGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor(private readonly path: string) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    let output: string;
    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Add a new login guidance component and scaffold its file.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["container_next_web"],
        affectedFiles: [],
        confidence: 1,
      });
    } else if (mode === "plan_graph_delegation") {
      output = JSON.stringify({
        operation: "add_node",
        node: {
          name: "Login guidance",
          summary: "Shows contextual guidance during login.",
          responsibility: "Own contextual guidance in the login journey.",
        },
        wiring: [{
          direction: "from_new",
          existingNodeId: "feat_login",
          relation: "uses",
          label: "supports login",
          purpose: "Provide guidance beside the existing login feature.",
        }],
        files: [{
          path: this.path,
          responsibility: "Render login guidance",
          objective: "Create the bounded login guidance component",
          acceptanceCriteria: ["The file exports LoginGuidance"],
        }],
        rationale: "A separate component owns the new product responsibility.",
      });
    } else if (mode === "create_file") {
      output = JSON.stringify({
        summary: "Create login guidance",
        path: this.path,
        content: "export function LoginGuidance() { return <aside>Use your account email.</aside>; }\n",
      });
    } else if (mode === "validate_created_file") {
      output = JSON.stringify({
        path: this.path,
        verdict: "valid",
        criteria: [{
          criterion: "The file exports LoginGuidance",
          status: "satisfied",
          explanation: "The file exports the requested component.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the server-authorized scaffold path is proposed.",
        },
        summary: "The scaffold file satisfies its responsibility.",
        rationale: "The component is bounded and exported.",
      });
    } else {
      output = "{}";
    }
    return {
      requestId: `request_scaffold_${this.requests.length}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class ComponentFileCreateGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor(private readonly path: string) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    let output: string;
    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Create a component-owned helper for reusable login copy.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["feat_login"],
        affectedFiles: [],
        confidence: 1,
      });
    } else if (mode === "plan_node_delegation") {
      output = JSON.stringify({
        objective: "Create reusable login copy",
        tasks: [{
          path: this.path,
          operation: "create",
          responsibility: "Provide reusable login copy for the login component",
          objective: "Add a bounded component-owned login copy module",
          acceptanceCriteria: ["The new module exports reusable login copy"],
        }],
        rationale: "A dedicated helper keeps login copy owned by the component.",
      });
    } else if (mode === "create_file") {
      output = JSON.stringify({
        summary: "Add reusable login copy",
        path: this.path,
        content: "export const LOGIN_COPY = 'Welcome back';\n",
      });
    } else if (mode === "validate_created_file") {
      output = JSON.stringify({
        path: this.path,
        verdict: "valid",
        criteria: [{
          criterion: "The new module exports reusable login copy",
          status: "satisfied",
          explanation: "The module exports LOGIN_COPY.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "The proposal contains exactly the authorized new file.",
        },
        summary: "The new file satisfies its responsibility.",
        rationale: "The exported constant provides the requested reusable copy.",
      });
    } else if (mode === "validate_delegated_batch") {
      const plan = isRecord(input.delegationPlan) && Array.isArray(input.delegationPlan.tasks)
        ? input.delegationPlan.tasks[0]
        : undefined;
      const task = isRecord(plan) ? plan : {};
      const evidence = Array.isArray(input.childEvidence) && isRecord(input.childEvidence[0])
        ? input.childEvidence[0]
        : {};
      output = JSON.stringify({
        verdict: "valid",
        tasks: [{
          taskId: task.taskId,
          childRunId: evidence.childRunId,
          path: task.filePath,
          status: "consistent",
          criteria: [{
            criterion: "The new module exports reusable login copy",
            status: "satisfied",
            explanation: "The independently validated proposal satisfies the task.",
          }],
          summary: "The created-file proposal is consistent.",
        }],
        crossFileAssessment: { status: "consistent", summary: "One scoped create task." },
        summary: "The create batch is valid.",
        rationale: "The proposal, responsibility, and scope agree.",
      });
    } else {
      output = "{}";
    }
    return {
      requestId: `request_create_${this.requests.length}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class ImpactDeleteGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor(
    private readonly targetPath: string,
    private readonly importerPath: string,
    private readonly importLine: string,
    private readonly repairMode: "remove_reference" | "leave_reference" = "remove_reference",
    private readonly onBatchValidation?: () => void,
    private readonly modelChosenRepairPath?: string,
  ) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    const localContext = isRecord(input.localContext) ? input.localContext : undefined;
    const scope = localContext && isRecord(localContext.scope) ? localContext.scope : undefined;
    const selectedPath = scope && typeof scope.selectedFilePath === "string"
      ? scope.selectedFilePath
      : isRecord(input.fileEditPlan) && typeof input.fileEditPlan.path === "string"
        ? input.fileEditPlan.path
        : undefined;
    let output: string;

    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Delete the login page and repair its direct importers.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["feat_login"],
        affectedFiles: [this.targetPath],
        confidence: 1,
      });
    } else if (mode === "plan_node_delegation") {
      output = JSON.stringify({
        objective: "Delete the login page without leaving direct dependencies",
        tasks: [
          {
            path: this.targetPath,
            operation: "delete",
            objective: "Remove the component-owned login page",
            acceptanceCriteria: ["The login page file is removed"],
          },
          ...(this.modelChosenRepairPath ? [{
            path: this.modelChosenRepairPath,
            objective: "Apply a model-chosen repair",
            acceptanceCriteria: ["The model-chosen repair is present"],
          }] : []),
        ],
        rationale: "The server will derive and authorize the importer repair set.",
      });
    } else if (mode === "locate_plan" && selectedPath === this.importerPath) {
      const criteria = [
        `No import or require in '${this.importerPath}' resolves to '${this.targetPath}'.`,
        `The remaining behavior in '${this.importerPath}' is internally consistent after the dependency is removed.`,
      ];
      output = JSON.stringify({
        path: this.importerPath,
        objective: `Remove the direct dependency on deleted module '${this.targetPath}' from '${this.importerPath}'.`,
        targetDescription: "The exact static import of the deleted module",
        anchors: ["LoginPage import"],
        constraints: ["Modify only the server-authorized direct importer"],
        acceptanceCriteria: criteria,
        rationale: "The import must be removed before the owned module is deleted.",
      });
    } else if (mode === "validate_proposal" && selectedPath === this.importerPath) {
      const fileEditPlan = isRecord(input.fileEditPlan) ? input.fileEditPlan : {};
      const criteria = Array.isArray(fileEditPlan.acceptanceCriteria)
        ? fileEditPlan.acceptanceCriteria.filter((item): item is string => typeof item === "string")
        : [];
      output = JSON.stringify({
        path: this.importerPath,
        verdict: "valid",
        criteria: criteria.map((criterion) => ({
          criterion,
          status: "satisfied",
          explanation: "The scoped proposal addresses the delegated repair criterion.",
        })),
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the server-authorized importer is modified.",
        },
        summary: "The repair proposal is scoped to the direct importer.",
        rationale: "The exact importer change is bounded and independently reviewed.",
      });
    } else if (mode === "validate_delegated_batch") {
      const plan = isRecord(input.delegationPlan) && Array.isArray(input.delegationPlan.tasks)
        ? input.delegationPlan.tasks
        : [];
      const evidence = Array.isArray(input.childEvidence) ? input.childEvidence : [];
      output = JSON.stringify({
        verdict: "valid",
        tasks: plan.map((rawTask, index) => {
          const task = isRecord(rawTask) ? rawTask : {};
          const child = isRecord(evidence[index]) ? evidence[index] : {};
          const criteria = Array.isArray(task.acceptanceCriteria)
            ? task.acceptanceCriteria.filter((item): item is string => typeof item === "string")
            : [];
          return {
            taskId: task.taskId,
            childRunId: child.childRunId,
            path: task.filePath,
            status: "consistent",
            criteria: criteria.map((criterion) => ({
              criterion,
              status: "satisfied",
              explanation: "The delete or repair proposal satisfies its bounded task.",
            })),
            summary: "The proposal is consistent with the server-derived impact task.",
          };
        }),
        crossFileAssessment: {
          status: "consistent",
          summary: "The target deletion and direct-importer repairs are mutually consistent.",
        },
        summary: "The impact-aware delete batch is valid.",
        rationale: "Every server-authorized task was independently reviewed together.",
      });
      this.onBatchValidation?.();
    } else if (selectedPath === this.importerPath) {
      output = this.repairMode === "remove_reference"
        ? JSON.stringify({
            summary: "Remove the direct login-page dependency",
            path: this.importerPath,
            edits: [{ search: this.importLine, replace: "" }],
          })
        : JSON.stringify({
            summary: "Make an unrelated importer edit",
            path: this.importerPath,
            edits: [{
              search: "title: 'SaaS Starter'",
              replace: "title: 'SaaS Starter App'",
            }],
          });
    } else {
      output = "{}";
    }

    return {
      requestId: `request_delete_${this.requests.length}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class NodeDeletionGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor(
    private readonly parentNodeId: string,
    private readonly rootNodeId: string,
    private readonly nodeIds: string[],
    private readonly recursive: boolean,
    private readonly importerPath?: string,
    private readonly importLine?: string,
  ) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    const localContext = isRecord(input.localContext) ? input.localContext : undefined;
    const scope = localContext && isRecord(localContext.scope) ? localContext.scope : undefined;
    const selectedPath = scope && typeof scope.selectedFilePath === "string"
      ? scope.selectedFilePath
      : isRecord(input.fileEditPlan) && typeof input.fileEditPlan.path === "string"
        ? input.fileEditPlan.path
        : undefined;
    let output = "{}";
    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Delete the obsolete product node.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: [this.parentNodeId],
        affectedFiles: [],
        confidence: 1,
      });
    } else if (mode === "plan_graph_delegation") {
      output = JSON.stringify({
        operation: "delete_node",
        rootNodeId: this.rootNodeId,
        recursive: this.recursive,
        nodeIds: this.nodeIds,
        rationale: "The obsolete product subtree should be removed atomically.",
      });
    } else if (mode === "locate_plan" && selectedPath === this.importerPath) {
      output = JSON.stringify({
        path: this.importerPath,
        objective: "Remove imports of the deleted product file",
        targetDescription: "The exact static import of the deleted module",
        anchors: ["disposable import"],
        constraints: ["Modify only the server-authorized importer"],
        acceptanceCriteria: [
          `No import or require in '${this.importerPath}' resolves to a deleted module.`,
          `Remaining behavior in '${this.importerPath}' stays internally consistent.`,
        ],
        rationale: "The importer must be repaired before atomic deletion.",
      });
    } else if (mode === "validate_proposal" && selectedPath === this.importerPath) {
      const plan = isRecord(input.fileEditPlan) ? input.fileEditPlan : {};
      const criteria = Array.isArray(plan.acceptanceCriteria) ? plan.acceptanceCriteria : [];
      output = JSON.stringify({
        path: this.importerPath,
        verdict: "valid",
        criteria: criteria.map((criterion) => ({
          criterion,
          status: "satisfied",
          explanation: "The deleted-module import is removed.",
        })),
        scopeAssessment: { status: "compliant", explanation: "Only the importer is modified." },
        summary: "The impact repair is valid.",
        rationale: "The exact dependency is removed.",
      });
    } else if (mode === "validate_delegated_batch") {
      const plan = isRecord(input.delegationPlan) && Array.isArray(input.delegationPlan.tasks)
        ? input.delegationPlan.tasks
        : [];
      const evidence = Array.isArray(input.childEvidence) ? input.childEvidence : [];
      output = JSON.stringify({
        verdict: "valid",
        tasks: plan.map((rawTask, index) => {
          const task = isRecord(rawTask) ? rawTask : {};
          const child = isRecord(evidence[index]) ? evidence[index] : {};
          const criteria = Array.isArray(task.acceptanceCriteria)
            ? task.acceptanceCriteria.filter((item): item is string => typeof item === "string")
            : [];
          return {
            taskId: task.taskId,
            childRunId: child.childRunId,
            path: task.filePath,
            status: "consistent",
            criteria: criteria.map((criterion) => ({
              criterion,
              status: "satisfied",
              explanation: "The server-bound delete or repair is consistent.",
            })),
            summary: "The node-deletion file task is consistent.",
          };
        }),
        crossFileAssessment: { status: "consistent", summary: "The complete deletion batch is consistent." },
        summary: "The node deletion batch is valid.",
        rationale: "All owned-file deletes and repairs were validated together.",
      });
    } else if (selectedPath === this.importerPath && this.importLine) {
      output = JSON.stringify({
        summary: "Remove dependency on deleted node file",
        path: this.importerPath,
        edits: [{ search: this.importLine, replace: "" }],
      });
    }
    return {
      requestId: `request_node_delete_${crypto.randomUUID()}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class AutomaticChangeGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor() {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const mode = isRecord(request.input) && typeof request.input.mode === "string"
      ? request.input.mode
      : undefined;
    let output: string;
    if (request.requestKind === "prompt_refinement") {
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
      requestId: `request_${this.requests.length}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class NodeDelegationGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];
  private planAttempt = 0;
  private batchAttempt = 0;

  constructor(
    private readonly delegatedPaths: string[],
    private readonly planOutputs: string[] = [],
    private readonly options: {
      batchOutputs?: string[];
      onBatchValidation?: () => void;
      noChangePaths?: string[];
      invalidProposalPaths?: string[];
    } = {},
  ) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    const localContext = isRecord(input.localContext) ? input.localContext : undefined;
    const scope = localContext && isRecord(localContext.scope)
      ? localContext.scope
      : undefined;
    const selectedPath = scope && typeof scope.selectedFilePath === "string"
      ? scope.selectedFilePath
      : isRecord(input.fileEditPlan) && typeof input.fileEditPlan.path === "string"
        ? input.fileEditPlan.path
        : undefined;
    const criterion = selectedPath
      ? `Delegated change for ${selectedPath} is present`
      : "Every delegated file has a scoped task";
    let output: string;

    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Update the login experience across its owned files.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: ["feat_login"],
        affectedFiles: [],
        confidence: 1,
      });
    } else if (mode === "plan_node_delegation") {
      output = this.planOutputs[this.planAttempt++] ?? JSON.stringify({
          objective: "Update the login experience across delegated files",
          tasks: this.delegatedPaths.map((path) => ({
            path,
            objective: `Apply the delegated login change in ${path}`,
            acceptanceCriteria: [`Delegated change for ${path} is present`],
          })),
          rationale: "The tasks map the node request to its owned files.",
        });
    } else if (mode === "locate_plan" && selectedPath) {
      if (this.options.noChangePaths?.includes(selectedPath)) {
        output = JSON.stringify({
          path: selectedPath,
          objective: `Verify ${selectedPath} already satisfies the delegated change`,
          targetDescription: "The exact delegated file target",
          anchors: [selectedPath === "app/login/page.tsx" ? "LoginPage heading" : "getCurrentUser role"],
          constraints: ["Modify only the authorized file"],
          acceptanceCriteria: [criterion],
          rationale: "The selected file already satisfies every acceptance criterion.",
          changeRequired: false,
        });
      } else {
      output = JSON.stringify({
        path: selectedPath,
        objective: `Apply the delegated login change in ${selectedPath}`,
        targetDescription: "The exact delegated file target",
        anchors: [
          selectedPath === "app/login/page.tsx"
            ? "LoginPage heading"
            : "Enter demo workspace button",
        ],
        constraints: ["Modify only the authorized file"],
        acceptanceCriteria: [criterion],
        rationale: "The server-authorized file owns this part of the delegated task.",
      });
      }
    } else if (mode === "validate_proposal" && selectedPath) {
      if (this.options.invalidProposalPaths?.includes(selectedPath)) {
        output = JSON.stringify({
          path: selectedPath,
          verdict: "invalid",
          criteria: [{
            criterion,
            status: "failed",
            explanation: "Injected proposal validation failure for malformed batch test.",
          }],
          scopeAssessment: {
            status: "compliant",
            explanation: "Only the server-authorized file is modified.",
          },
          summary: "The delegated proposal failed independent validation.",
          rationale: "Injected failure to force a model batch validation fallback.",
        });
      } else {
        output = JSON.stringify({
          path: selectedPath,
          verdict: "valid",
          criteria: [{
            criterion,
            status: "satisfied",
            explanation: "The scoped proposal implements the delegated objective.",
          }],
          scopeAssessment: {
            status: "compliant",
            explanation: "Only the server-authorized file is modified.",
          },
          summary: "The delegated proposal is scoped and satisfies its criterion.",
          rationale: "The proposed exact replacement matches the delegated task.",
        });
      }
    } else if (mode === "validate_delegated_batch") {
      const plan = isRecord(input.delegationPlan) && Array.isArray(input.delegationPlan.tasks)
        ? input.delegationPlan
        : undefined;
      const planTasks: unknown[] = plan ? plan.tasks as unknown[] : [];
      const evidence = Array.isArray(input.childEvidence) ? input.childEvidence : [];
      output = this.options.batchOutputs?.[this.batchAttempt++] ?? JSON.stringify({
        verdict: "valid",
        tasks: planTasks.map((rawTask, index) => {
          const task = isRecord(rawTask) ? rawTask : {};
          const child = isRecord(evidence[index]) ? evidence[index] : {};
          const criteria = Array.isArray(task.acceptanceCriteria)
            ? task.acceptanceCriteria.filter((item): item is string => typeof item === "string")
            : [];
          return {
            taskId: task.taskId,
            childRunId: child.childRunId,
            path: task.filePath,
            status: "consistent",
            criteria: criteria.map((item) => ({
              criterion: item,
              status: "satisfied",
              explanation: "The independently validated proposal satisfies this criterion.",
            })),
            summary: "The child proposal is consistent with its delegated task.",
          };
        }),
        crossFileAssessment: {
          status: "consistent",
          summary: "The delegated proposals are mutually consistent.",
        },
        summary: "The complete delegated batch is valid.",
        rationale: "All tasks and interfaces were reviewed together.",
      });
      this.options.onBatchValidation?.();
    } else if (selectedPath === "app/login/page.tsx") {
      output = JSON.stringify({
        summary: "Update the delegated login heading",
        path: selectedPath,
        edits: [{ search: "<h1>Demo access</h1>", replace: "<h1>Welcome Back</h1>" }],
      });
    } else if (selectedPath === "components/LoginForm.tsx") {
      output = JSON.stringify({
        summary: "Update the delegated demo-entry label",
        path: selectedPath,
        edits: [
          {
            search: "Enter demo workspace",
            replace: "Open demo workspace",
          },
        ],
      });
    } else {
      output = JSON.stringify({ summary: "No valid delegated target", files: [] });
    }

    return {
      requestId: `request_node_${this.requests.length}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class RecursiveHierarchyGateway extends ModelGateway {
  readonly requests: ModelGatewayRequest[] = [];

  constructor(private readonly options: { onWholeTreeValidation?: () => void } = {}) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    this.requests.push(request);
    const input = isRecord(request.input) ? request.input : {};
    const mode = typeof input.mode === "string" ? input.mode : undefined;
    const localContext = isRecord(input.localContext) ? input.localContext : undefined;
    const scope = localContext && isRecord(localContext.scope) ? localContext.scope : undefined;
    const selectedPath = scope && typeof scope.selectedFilePath === "string"
      ? scope.selectedFilePath
      : isRecord(input.fileEditPlan) && typeof input.fileEditPlan.path === "string"
        ? input.fileEditPlan.path
        : undefined;
    let output: string;

    if (request.requestKind === "prompt_refinement") {
      output = JSON.stringify({
        understood: "Update login consistently across the product.",
        ambiguities: [],
        suggestions: [],
        affectedNodeIds: [],
        affectedFiles: [],
        confidence: 1,
      });
    } else if (mode === "plan_graph_delegation") {
      const immediateTargets = isRecord(input.immediateTargets) ? input.immediateTargets : {};
      const kind = immediateTargets.kind;
      const level = immediateTargets.level;
      if (kind === "leaf-file") {
        output = JSON.stringify({
          objective: "Update both login implementation files",
          tasks: [
            "app/login/page.tsx",
            "components/LoginForm.tsx",
          ].map((path) => ({
            path,
            objective: `Apply the login change in ${path}`,
            acceptanceCriteria: [`Delegated change for ${path} is present`],
          })),
          rationale: "The component owns both leaf files.",
        });
      } else {
        const nodeId = level === "context"
          ? "system_saas_starter"
          : level === "container"
            ? "container_next_web"
            : "feat_login";
        output = JSON.stringify({
          objective: `Delegate the login change to ${nodeId}`,
          tasks: [{
            nodeId,
            objective: `Plan the login change in ${nodeId}`,
            acceptanceCriteria: ["The delegated login behavior is updated"],
          }],
          rationale: "The task follows one immediate architecture layer.",
        });
      }
    } else if (mode === "locate_plan" && selectedPath) {
      output = JSON.stringify({
        path: selectedPath,
        objective: `Apply the login change in ${selectedPath}`,
        targetDescription: "The exact delegated file target",
        anchors: [
          selectedPath === "app/login/page.tsx"
            ? "LoginPage heading"
            : "Enter demo workspace button",
        ],
        constraints: ["Modify only the authorized file"],
        acceptanceCriteria: [`Delegated change for ${selectedPath} is present`],
        rationale: "The authorized leaf owns this part of the task.",
      });
    } else if (mode === "validate_proposal" && selectedPath) {
      output = JSON.stringify({
        path: selectedPath,
        verdict: "valid",
        criteria: [{
          criterion: `Delegated change for ${selectedPath} is present`,
          status: "satisfied",
          explanation: "The exact proposal implements the delegated change.",
        }],
        scopeAssessment: {
          status: "compliant",
          explanation: "Only the server-authorized leaf changes.",
        },
        summary: "The leaf proposal is valid.",
        rationale: "The proposal satisfies its exact delegated task.",
      });
    } else if (mode === "validate_whole_tree_batch") {
      const transactionPlan = isRecord(input.transactionPlan) &&
          Array.isArray(input.transactionPlan.leaves)
        ? input.transactionPlan
        : undefined;
      const leaves = transactionPlan ? transactionPlan.leaves as unknown[] : [];
      output = JSON.stringify({
        verdict: "valid",
        tasks: leaves.map((rawLeaf) => {
          const leaf = isRecord(rawLeaf) ? rawLeaf : {};
          const criteria = Array.isArray(leaf.acceptanceCriteria)
            ? leaf.acceptanceCriteria.filter((item): item is string => typeof item === "string")
            : [];
          return {
            taskId: leaf.transactionTaskId,
            childRunId: leaf.childRunId,
            path: leaf.filePath,
            status: "consistent",
            criteria: criteria.map((criterion) => ({
              criterion,
              status: "satisfied",
              explanation: "The leaf proposal satisfies this criterion.",
            })),
            summary: "The leaf is consistent with the whole-tree plan.",
          };
        }),
        crossFileAssessment: {
          status: "consistent",
          summary: "All recursively delegated leaves are mutually consistent.",
        },
        summary: "The whole-tree batch is valid.",
        rationale: "Every leaf and interface was reviewed as one transaction.",
      });
      this.options.onWholeTreeValidation?.();
    } else if (selectedPath === "app/login/page.tsx") {
      output = JSON.stringify({
        summary: "Update the login heading",
        path: selectedPath,
        edits: [{ search: "<h1>Demo access</h1>", replace: "<h1>Welcome Back</h1>" }],
      });
    } else if (selectedPath === "components/LoginForm.tsx") {
      output = JSON.stringify({
        summary: "Update the demo-entry label",
        path: selectedPath,
        edits: [
          {
            search: "Enter demo workspace",
            replace: "Open demo workspace",
          },
        ],
      });
    } else {
      output = JSON.stringify({ summary: "No valid target", files: [] });
    }
    return {
      requestId: `request_recursive_${this.requests.length}`,
      provider: "test",
      model: "fixture-model",
      output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class MalformedRefinementGateway extends ModelGateway {
  constructor(private readonly output: string) {
    super({ secretStore: new InMemorySecretStore() });
  }

  override async complete(
    _profile: Parameters<ModelGateway["complete"]>[0],
    _request: ModelGatewayRequest,
  ): Promise<ModelGatewayResponse> {
    return {
      requestId: "request-malformed-refinement",
      provider: "test",
      model: "fixture-model",
      output: this.output,
      usage: { inputTokens: 10, outputTokens: 10 },
      latencyMs: 1,
    };
  }
}

class RecordingWorkspaceStore extends ProjectOSWorkspaceStore {
  constructor(private readonly events: string[]) {
    super();
  }

  override async writeCurrentWork(
    workspaceRoot: string,
    currentWork: CurrentWorkState,
  ): Promise<CurrentWorkState> {
    this.events.push("current-work");
    return super.writeCurrentWork(workspaceRoot, currentWork);
  }
}

class RecordingCommitApi extends ProjectOSLocalApi {
  constructor(
    options: ConstructorParameters<typeof ProjectOSLocalApi>[0],
    private readonly events: string[],
  ) {
    super(options);
  }

  protected override commitStagedFile(
    temporaryPath: string,
    targetPath: string,
  ): void {
    this.events.push("commit");
    super.commitStagedFile(temporaryPath, targetPath);
  }
}

class FailSecondCommitApi extends ProjectOSLocalApi {
  private commitCount = 0;

  protected override commitStagedFile(
    temporaryPath: string,
    targetPath: string,
  ): void {
    this.commitCount += 1;
    if (this.commitCount === 2) {
      throw new Error("Injected second-file commit failure");
    }
    super.commitStagedFile(temporaryPath, targetPath);
  }
}

class ToggleCurrentWorkCommitFailureApi extends ProjectOSLocalApi {
  private failCurrentWork = false;

  failCurrentWorkCommits(): void {
    this.failCurrentWork = true;
  }

  protected override commitStagedFile(
    temporaryPath: string,
    targetPath: string,
  ): void {
    if (this.failCurrentWork && targetPath.endsWith("current-work.json")) {
      throw new Error("Injected current-work commit failure");
    }
    super.commitStagedFile(temporaryPath, targetPath);
  }
}

class FailCommitAndRollbackApi extends ProjectOSLocalApi {
  private commitCount = 0;

  protected override commitStagedFile(
    temporaryPath: string,
    targetPath: string,
  ): void {
    this.commitCount += 1;
    if (this.commitCount >= 2) {
      throw new Error("Injected commit and rollback failure");
    }
    super.commitStagedFile(temporaryPath, targetPath);
  }
}
