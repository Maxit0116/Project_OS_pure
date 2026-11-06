import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createDefaultSettings } from "../contracts/settings.js";
import { ProjectOSWorkspaceStore } from "../persistence/workspace-store.js";
import type { ProjectGraph } from "../contracts/graph.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import type { ModelGateway } from "./model-gateway/index.js";
import { ensureWorkspaceBootstrapped } from "./workspace-bootstrap.js";
import { validateWorkspaceFixtures } from "../validation/validate-fixtures.js";

function makeUnfamiliarRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "structure-open-workspace-"));
  mkdirSync(join(root, "src", "auth"), { recursive: true });
  mkdirSync(join(root, "src", "billing"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"stranger","type":"module"}\n');
  writeFileSync(join(root, "README.md"), "# Stranger\nAuth and billing service.\n");
  writeFileSync(join(root, "src", "auth", "session.ts"), "export const token = 't';\n");
  writeFileSync(
    join(root, "src", "auth", "login.ts"),
    "import { token } from './session';\nexport function login() { return token; }\n",
  );
  writeFileSync(join(root, "src", "billing", "plan.ts"), "export const plan = 'pro';\n");
  writeFileSync(
    join(root, "src", "billing", "checkout.ts"),
    "import { plan } from './plan';\nexport function pay() { return plan; }\n",
  );
  return root;
}

function writeMockModelSettings(root: string, projectId: string): void {
  const settings = createDefaultSettings(projectId, false);
  settings.modelProfiles = [
    {
      id: "model_mock",
      name: "Mock",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "mock",
      baseUrl: "http://127.0.0.1:9",
      apiKeyRef: "secret://mock",
      isDefault: true,
    },
  ];
  settings.execution.defaultModelProfileId = "model_mock";
  writeFileSync(
    join(root, ".projectos", "settings.json"),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
}

function roundA(options?: { includeDanglingEdge?: boolean }): string {
  const edges: Record<string, unknown>[] = [
    {
      id: "e1",
      source: "system_root",
      target: "container_app",
      relation: "depends_on",
      label: "contains",
      evidence: "src hosts runtime",
    },
  ];
  if (options?.includeDanglingEdge) {
    edges.push({
      id: "edge_api_engine",
      source: "",
      target: "",
      relation: "depends_on",
      label: " → ",
      evidence: "Inferred from repository structure",
    });
  }
  return JSON.stringify({
    architecture: {
      notation: "c4",
      defaultLevel: "context",
      layers: [
        { id: "experience", label: "Experience", order: 0, description: "Users" },
        { id: "application", label: "Application", order: 1, description: "Core" },
        { id: "infrastructure", label: "Infrastructure", order: 2, description: "Platform" },
      ],
    },
    nodes: [
      {
        id: "system_root",
        name: "Stranger service",
        level: "context",
        elementType: "software_system",
        description: "Product boundary",
        summary: "Hosts auth and billing",
        responsibility: "Owns the product",
        layer: "application",
      },
      {
        id: "container_app",
        name: "App container",
        level: "container",
        elementType: "container",
        parentId: "system_root",
        description: "Node application container",
        summary: "Hosts the Node runtime",
        responsibility: "Runs the service",
        layer: "application",
      },
    ],
    edges,
  });
}

function roundB(componentAuthName = "Identity access"): string {
  return JSON.stringify({
    components: [
      {
        id: "component_auth",
        name: componentAuthName,
        parentId: "container_app",
        description: "Login and sessions",
        summary: "Authenticates members",
        responsibility: "Owns sign-in",
        layer: "application",
        pathHints: ["src/auth"],
      },
      {
        id: "component_billing",
        name: "Billing checkout",
        parentId: "container_app",
        description: "Plans and payments",
        summary: "Charges subscribers",
        responsibility: "Owns billing",
        layer: "application",
        pathHints: ["src/billing"],
      },
      {
        id: "component_app",
        name: "Service bootstrap",
        parentId: "container_app",
        description: "Entrypoint wiring",
        summary: "Boots the process",
        responsibility: "Owns startup",
        layer: "application",
        pathHints: ["package.json"],
      },
    ],
    edges: [],
  });
}

function mockGateway(
  authName = "Identity access",
  options?: { includeDanglingEdge?: boolean },
) {
  const complete = vi.fn(async (_profile, request) => {
    const task = (request.input as { task?: string }).task;
    return {
      requestId: "req",
      provider: "mock",
      model: "mock",
      output:
        task === "structure_graph_round_a"
          ? roundA({ includeDanglingEdge: options?.includeDanglingEdge })
          : roundB(authName),
      usage: { inputTokens: 1, outputTokens: 2 },
      latencyMs: 1,
    };
  });
  return { complete, gateway: { complete } as unknown as ModelGateway };
}

describe("openWorkspace structure graph AI scan", () => {
  it("upgrades heuristic graph when mock gateway returns L2 rounds", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const { complete, gateway } = mockGateway();
    const api = new ProjectOSLocalApi({ modelGateway: gateway });

    const project = await api.openWorkspace(root);
    expect(project.workspaceRoot).toBe(root);
    // TTFT: heuristic graph is available before AI scan finishes.
    const immediate = await api.getProjectGraph(project.projectId);
    expect(immediate.analysisStatus).toBe("partial");
    await api.awaitStructureScan(project.projectId);
    const upgraded = await api.getProjectGraph(project.projectId);
    const tree = await api.getSemanticTree(project.projectId);

    expect(complete.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(upgraded.analysisStatus).toBe("complete");
    expect(upgraded.nodes.some((node) => node.name === "Identity access")).toBe(true);
    expect(tree.roots.some((node) => node.label === "App container")).toBe(true);

    complete.mockClear();
    await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    expect(complete).not.toHaveBeenCalled();
  });

  it("keeps heuristic graph when gateway fails", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const complete = vi.fn(async () => {
      throw new Error("model unavailable");
    });
    const api = new ProjectOSLocalApi({
      modelGateway: { complete } as unknown as ModelGateway,
    });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    const loaded = await api.getProjectGraph(project.projectId);
    expect(complete).toHaveBeenCalled();
    expect(loaded.analysisStatus).toBe("partial");
    expect(
      JSON.parse(readFileSync(join(root, ".projectos", "graph.json"), "utf8")).analysisStatus,
    ).toBe("partial");
  });

  it("analyzeWorkspace regenerate replaces names on a complete graph", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const first = mockGateway("Identity access");
    const api = new ProjectOSLocalApi({ modelGateway: first.gateway });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    expect(
      (await api.getProjectGraph(project.projectId)).nodes.some((node) => node.name === "Identity access"),
    ).toBe(true);

    const second = mockGateway("Rescanned identity");
    const api2 = new ProjectOSLocalApi({ modelGateway: second.gateway });
    await api2.openWorkspace(root);
    await api2.awaitStructureScan(project.projectId);
    const rescanned = await api2.analyzeWorkspace(project.projectId, { mode: "regenerate" });
    expect(rescanned.nodes.some((node) => node.name === "Rescanned identity")).toBe(true);
  });

  it("analyzeWorkspace regenerate drops dangling AI edges and keeps disk valid", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const first = mockGateway("Identity access");
    const api = new ProjectOSLocalApi({ modelGateway: first.gateway });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);

    const dirty = mockGateway("Rescanned identity", { includeDanglingEdge: true });
    const api2 = new ProjectOSLocalApi({ modelGateway: dirty.gateway });
    await api2.openWorkspace(root);
    await api2.awaitStructureScan(project.projectId);
    const rescanned = await api2.analyzeWorkspace(project.projectId, { mode: "regenerate" });

    expect(rescanned.edges.some((edge) => edge.id === "edge_api_engine")).toBe(false);
    expect(rescanned.edges.every((edge) => edge.source && edge.target)).toBe(true);

    const onDisk = JSON.parse(
      readFileSync(join(root, ".projectos", "graph.json"), "utf8"),
    ) as { edges: Array<{ id: string; source: string; target: string }> };
    expect(onDisk.edges.some((edge) => edge.id === "edge_api_engine")).toBe(false);
    expect(onDisk.edges.every((edge) => edge.source.length > 0 && edge.target.length > 0)).toBe(
      true,
    );
    expect(validateWorkspaceFixtures(root).ok).toBe(true);
    expect(() => new ProjectOSWorkspaceStore().loadWorkspace(root)).not.toThrow();
  });

  it("loadWorkspace auto-repairs dangling edges left on disk", () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    const graphPath = join(root, ".projectos", "graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8")) as {
      edges: Array<Record<string, unknown>>;
    };
    graph.edges.push({
      id: "edge_api_engine",
      source: "",
      target: "",
      relation: "depends_on",
      label: " → ",
      confidence: 0.7,
      evidence: "Inferred from repository structure",
    });
    writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

    expect(validateWorkspaceFixtures(root).ok).toBe(false);
    const loaded = new ProjectOSWorkspaceStore().loadWorkspace(root);
    expect(loaded.project.projectId).toBe(bootstrap.projectId);
    expect(loaded.graph.edges.some((edge) => edge.id === "edge_api_engine")).toBe(false);
    expect(validateWorkspaceFixtures(root).ok).toBe(true);
  });

  it("cancelStructureScan keeps the previous graph", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const first = mockGateway("Identity access");
    const api = new ProjectOSLocalApi({ modelGateway: first.gateway });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    const before = await api.getProjectGraph(project.projectId);
    const beforeNames = before.nodes.map((node) => node.name).sort();

    const cancellableGateway = {
      complete: async (
        profile: unknown,
        request: { input?: unknown },
        options?: { signal?: AbortSignal },
      ) => {
        const task =
          typeof request.input === "object" &&
          request.input &&
          "task" in request.input
            ? String((request.input as { task?: string }).task ?? "")
            : "";
        if (task === "structure_graph_round_a") {
          await new Promise<never>((_resolve, reject) => {
            const fail = () => {
              reject(
                Object.assign(new Error("Model request cancelled"), {
                  name: "AbortError",
                }),
              );
            };
            if (options?.signal?.aborted) {
              fail();
              return;
            }
            options?.signal?.addEventListener("abort", fail, { once: true });
          });
        }
        return first.gateway.complete(
          profile as never,
          request as never,
        );
      },
    };

    const api2 = new ProjectOSLocalApi({
      modelGateway: cancellableGateway as unknown as ModelGateway,
    });
    // Graph is already complete on disk — open must not start a background scan.
    await api2.openWorkspace(root);

    const analyzePromise = api2.analyzeWorkspace(project.projectId, {
      mode: "regenerate",
    });
    await vi.waitFor(async () => {
      const progress = await api2.getStructureScanProgress(project.projectId);
      expect(progress?.status).toBe("running");
    });
    expect(await api2.cancelStructureScan(project.projectId)).toBe(true);
    // Cancel settles progress immediately — before the in-flight model call ends.
    expect((await api2.getStructureScanProgress(project.projectId))?.status).toBe(
      "cancelled",
    );
    await expect(analyzePromise).rejects.toMatchObject({
      code: "operation_cancelled",
    });

    const after = await api2.getProjectGraph(project.projectId);
    expect(after.nodes.map((node) => node.name).sort()).toEqual(beforeNames);
  });

  it("emits structure-scan progress steps during regenerate", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const { gateway } = mockGateway();
    const api = new ProjectOSLocalApi({ modelGateway: gateway });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);

    const types: string[] = [];
    const sub = api.streamStructureScan(project.projectId, (event) => {
      types.push(event.type);
    });
    await api.analyzeWorkspace(project.projectId, { mode: "regenerate" });
    sub.dispose();

    expect(types).toContain("scan_planned");
    expect(types).toContain("step_started");
    expect(types).toContain("step_completed");
    expect(types).toContain("scan_completed");
    const progress = await api.getStructureScanProgress(project.projectId);
    expect(progress?.status).toBe("success");
    expect(progress?.steps.some((step) => step.id === "map_context")).toBe(true);
  });

  it("refine keeps existing component ids", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const { gateway } = mockGateway();
    const api = new ProjectOSLocalApi({ modelGateway: gateway });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    const before = await api.getProjectGraph(project.projectId);
    const refined = await api.analyzeWorkspace(project.projectId, { mode: "refine" });
    expect(refined.nodes.some((node) => node.id === "component_auth")).toBe(true);
    expect(before.nodes.map((node) => node.id).sort()).toEqual(
      expect.arrayContaining(["component_auth", "container_app"]),
    );
  });

  it("deepen requires a selected node and keeps other names", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const { gateway } = mockGateway();
    const api = new ProjectOSLocalApi({ modelGateway: gateway });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    const deepened = await api.analyzeWorkspace(project.projectId, {
      mode: "deepen",
      nodeIds: ["container_app"],
    });
    expect(deepened.nodes.some((node) => node.id === "system_root")).toBe(true);
    expect(deepened.nodes.some((node) => node.level === "component")).toBe(true);
  });

  it("does not persist a cut-off regenerate and omits model text from the error", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const secret = "sk-proj-disk-secret";
    const complete = vi.fn(async () => ({
      requestId: "req_cut",
      provider: "mock",
      model: "mock",
      output: `{"nodes":[{"id":"cut","name":"${secret}`,
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: 1,
    }));
    const api = new ProjectOSLocalApi({
      modelGateway: { complete } as unknown as ModelGateway,
    });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    const before = readFileSync(join(root, ".projectos", "graph.json"), "utf8");

    await expect(api.analyzeWorkspace(project.projectId, {
      mode: "regenerate",
      force: true,
    })).rejects.toMatchObject({
      code: "agent_orchestration_failed",
      message: expect.stringMatching(/cut off before a complete JSON object/u),
    });
    expect(readFileSync(join(root, ".projectos", "graph.json"), "utf8")).toBe(before);
    await expect(api.analyzeWorkspace(project.projectId, {
      mode: "regenerate",
      force: true,
    })).rejects.toThrowError(expect.not.stringContaining(secret));
  });

  it("writes the finished graph to disk before a later semantic-tree read", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const api = new ProjectOSLocalApi({ modelGateway: mockGateway("Disk identity").gateway });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    const before = readFileSync(join(root, ".projectos", "graph.json"), "utf8");
    const scanned = await api.analyzeWorkspace(project.projectId, {
      mode: "regenerate",
      force: true,
    });
    const onDisk = readFileSync(join(root, ".projectos", "graph.json"), "utf8");
    expect(onDisk).not.toBe(before);
    expect(onDisk).toContain("Disk identity");
    expect(scanned.nodes.some((node) => node.name === "Disk identity")).toBe(true);
    const tree = await api.getSemanticTree(project.projectId);
    expect(tree.roots.length).toBeGreaterThan(0);
    expect(readFileSync(join(root, ".projectos", "graph.json"), "utf8")).toBe(onDisk);
  });

  it("keeps graph and tree paired when reopen aborts before the locked publish", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const store = new ProjectOSWorkspaceStore();
    const originalPair = store.writeScannedGraphPair.bind(store);
    let observe: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      observe = resolve;
    });
    let pause = true;
    store.writeScannedGraphPair = async (workspaceRoot, graph, semanticTree, options) => {
      if (pause && graph.nodes.some((node) => node.name === "Stale scan")) {
        pause = false;
        observe?.();
        while (options?.confirm?.() !== false) {
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
      return originalPair(workspaceRoot, graph, semanticTree, options);
    };
    let calls = 0;
    let releaseFresh: (() => void) | undefined;
    const freshAllowed = new Promise<void>((resolve) => {
      releaseFresh = resolve;
    });
    const complete = vi.fn(async (_profile, request: { input?: { task?: string } }) => {
      calls += 1;
      const call = calls;
      if (call > 2) await freshAllowed;
      const task = request.input?.task;
      const name = call <= 2 ? "Stale scan" : "Fresh scan";
      return {
        requestId: `req_${call}`,
        provider: "mock",
        model: "mock",
        output: task === "structure_graph_round_a" ? roundA() : roundB(name),
        usage: { inputTokens: 1, outputTokens: 2 },
        latencyMs: 1,
      };
    });
    const api = new ProjectOSLocalApi({
      modelGateway: { complete } as unknown as ModelGateway,
      workspaceStore: store,
    });
    const graphPath = join(root, ".projectos", "graph.json");
    const treePath = join(root, ".projectos", "semantic-tree.json");

    const project = await api.openWorkspace(root);
    await waiting;
    expect(readFileSync(graphPath, "utf8")).not.toContain("Stale scan");
    expect(readFileSync(treePath, "utf8")).not.toContain("Stale scan");

    const reopened = api.openWorkspace(root);
    await reopened;
    const afterAbortGraph = readFileSync(graphPath, "utf8");
    const afterAbortTree = readFileSync(treePath, "utf8");
    expect(afterAbortGraph).not.toContain("Stale scan");
    expect(afterAbortTree).not.toContain("Stale scan");
    const memory = await api.getProjectGraph(project.projectId);
    const memoryTree = await api.getSemanticTree(project.projectId);
    expect(JSON.stringify(memory)).not.toContain("Stale scan");
    expect(JSON.stringify(memoryTree)).not.toContain("Stale scan");
    expect(memory.analysisStatus).toBe("partial");

    releaseFresh?.();
    const fresh = await api.analyzeWorkspace(project.projectId, {
      mode: "regenerate",
      force: true,
    });
    const graphDisk = readFileSync(graphPath, "utf8");
    const treeDisk = readFileSync(treePath, "utf8");
    expect(fresh.nodes.some((node) => node.name === "Fresh scan")).toBe(true);
    expect(graphDisk).toContain("Fresh scan");
    expect(treeDisk).toContain("Fresh scan");
    expect(graphDisk).not.toContain("Stale scan");
    expect((await api.getProjectGraph(project.projectId)).nodes.some((node) => node.name === "Fresh scan")).toBe(true);
    expect(JSON.stringify(await api.getSemanticTree(project.projectId))).toContain("Fresh scan");
  });

  it("reports an honest error when restoring the previous map fails", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const store = new ProjectOSWorkspaceStore();
    const originalPair = store.writeScannedGraphPair.bind(store);
    const originalGraph = store.writeGraph.bind(store);
    store.writeScannedGraphPair = async (workspaceRoot, graph, semanticTree, options) => {
      if (graph.nodes.some((node) => node.name === "Broken scan")) {
        await originalGraph(workspaceRoot, graph, options);
        throw new Error("tree device sk-proj-tree-secret");
      }
      return originalPair(workspaceRoot, graph, semanticTree, options);
    };
    store.writeGraph = async (workspaceRoot, graph, options) => {
      if (!graph.nodes.some((node) => node.name === "Broken scan")) {
        throw new Error("restore sk-proj-restore-secret");
      }
      return originalGraph(workspaceRoot, graph, options);
    };
    let calls = 0;
    const complete = vi.fn(async (_profile, request: { input?: { task?: string } }) => {
      calls += 1;
      const task = request.input?.task;
      return {
        requestId: `req_${calls}`,
        provider: "mock",
        model: "mock",
        output: task === "structure_graph_round_a" ? roundA() : roundB("Broken scan"),
        usage: { inputTokens: 1, outputTokens: 2 },
        latencyMs: 1,
      };
    });
    const api = new ProjectOSLocalApi({
      modelGateway: { complete } as unknown as ModelGateway,
      workspaceStore: store,
    });
    const project = await api.openWorkspace(root);
    await api.awaitStructureScan(project.projectId);
    await expect(api.analyzeWorkspace(project.projectId, {
      mode: "regenerate",
      force: true,
    })).rejects.toMatchObject({
      code: "persistence_write_failed",
      message: "Structure scan failed and the previous map could not be restored.",
    });
  });

  it("does not let an older cancelled scan restore over a newer successful pair", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const store = new ProjectOSWorkspaceStore();
    const originalPair = store.writeScannedGraphPair.bind(store);
    let releaseOlder: (() => void) | undefined;
    const olderHeld = new Promise<void>((resolve) => {
      releaseOlder = resolve;
    });
    let olderEntered: (() => void) | undefined;
    const olderWaiting = new Promise<void>((resolve) => {
      olderEntered = resolve;
    });
    store.writeScannedGraphPair = async (workspaceRoot, graph, semanticTree, options) => {
      if (graph.nodes.some((node) => node.name === "Older scan")) {
        olderEntered?.();
        await olderHeld;
      }
      return originalPair(workspaceRoot, graph, semanticTree, options);
    };
    const olderApi = new ProjectOSLocalApi({
      modelGateway: mockGateway("Older scan").gateway,
      workspaceStore: store,
    });
    const newerApi = new ProjectOSLocalApi({
      modelGateway: mockGateway("Newer scan").gateway,
      workspaceStore: store,
    });
    const graphPath = join(root, ".projectos", "graph.json");
    const treePath = join(root, ".projectos", "semantic-tree.json");

    const project = await olderApi.openWorkspace(root);
    await olderWaiting;
    const newerProject = await newerApi.openWorkspace(root);
    await newerApi.awaitStructureScan(newerProject.projectId);
    expect((await newerApi.getProjectGraph(newerProject.projectId)).nodes
      .some((node) => node.name === "Newer scan")).toBe(true);

    const cancelPromise = olderApi.cancelStructureScan(project.projectId);
    releaseOlder?.();
    expect(await cancelPromise).toBe(true);
    await olderApi.awaitStructureScan(project.projectId);

    const graphDisk = readFileSync(graphPath, "utf8");
    const treeDisk = readFileSync(treePath, "utf8");
    expect(graphDisk).toContain("Newer scan");
    expect(treeDisk).toContain("Newer scan");
    expect(graphDisk).not.toContain("Older scan");
    expect(treeDisk).not.toContain("Older scan");
    expect(JSON.stringify(await newerApi.getProjectGraph(newerProject.projectId))).toContain("Newer scan");
    expect(JSON.stringify(await newerApi.getSemanticTree(newerProject.projectId))).toContain("Newer scan");

    await olderApi.openWorkspace(root);
    const reloaded = await olderApi.getProjectGraph(project.projectId);
    expect(reloaded.nodes.some((node) => node.name === "Newer scan")).toBe(true);
    expect(JSON.stringify(reloaded)).not.toContain("Older scan");
    expect(JSON.stringify(await olderApi.getSemanticTree(project.projectId))).toContain("Newer scan");
    expect(readFileSync(graphPath, "utf8")).toBe(graphDisk);
    expect(readFileSync(treePath, "utf8")).toBe(treeDisk);
  });
});
