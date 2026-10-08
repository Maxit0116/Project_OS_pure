import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createDefaultSettings } from "../contracts/settings.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import type { ModelGateway } from "./model-gateway/index.js";
import { ensureWorkspaceBootstrapped } from "./workspace-bootstrap.js";

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

function roundA(): string {
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
    edges: [
      {
        id: "e1",
        source: "system_root",
        target: "container_app",
        relation: "depends_on",
        label: "contains",
        evidence: "src hosts runtime",
      },
    ],
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

function mockGateway(authName = "Identity access") {
  const complete = vi.fn(async (_profile, request) => {
    const task = (request.input as { task?: string }).task;
    return {
      requestId: "req",
      provider: "mock",
      model: "mock",
      output: task === "structure_graph_round_a" ? roundA() : roundB(authName),
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
    const upgraded = await api.getProjectGraph(project.projectId);
    const tree = await api.getSemanticTree(project.projectId);

    expect(complete.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(upgraded.analysisStatus).toBe("complete");
    expect(upgraded.nodes.some((node) => node.name === "Identity access")).toBe(true);
    expect(tree.roots.some((node) => node.label === "App container")).toBe(true);

    complete.mockClear();
    await api.openWorkspace(root);
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
    expect(
      (await api.getProjectGraph(project.projectId)).nodes.some((node) => node.name === "Identity access"),
    ).toBe(true);

    const second = mockGateway("Rescanned identity");
    const api2 = new ProjectOSLocalApi({ modelGateway: second.gateway });
    await api2.openWorkspace(root);
    const rescanned = await api2.analyzeWorkspace(project.projectId, { mode: "regenerate" });
    expect(rescanned.nodes.some((node) => node.name === "Rescanned identity")).toBe(true);
  });

  it("refine keeps existing component ids", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);
    const { gateway } = mockGateway();
    const api = new ProjectOSLocalApi({ modelGateway: gateway });
    const project = await api.openWorkspace(root);
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
    const deepened = await api.analyzeWorkspace(project.projectId, {
      mode: "deepen",
      nodeIds: ["container_app"],
    });
    expect(deepened.nodes.some((node) => node.id === "system_root")).toBe(true);
    expect(deepened.nodes.some((node) => node.level === "component")).toBe(true);
  });
});
