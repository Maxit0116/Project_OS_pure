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
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"stranger","type":"module"}\n');
  writeFileSync(join(root, "src", "main.ts"), "export function main() { return 1; }\n");
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

function modelGraphOutput(projectId: string, projectName: string): string {
  return JSON.stringify({
    version: "0.3.0",
    projectId,
    projectName,
    projectType: "node",
    analyzedAt: new Date().toISOString(),
    analysisStatus: "complete",
    architecture: {
      notation: "c4",
      defaultLevel: "component",
      layers: [
        {
          id: "experience",
          label: "Experience",
          order: 0,
          description: "User-facing clients",
        },
        {
          id: "application",
          label: "Application",
          order: 1,
          description: "Core product logic",
        },
        {
          id: "infrastructure",
          label: "Infrastructure",
          order: 2,
          description: "Platform concerns",
        },
      ],
    },
    nodes: [
      {
        id: "system_root",
        type: "capability",
        name: projectName,
        status: "active",
        description: `${projectName} software system`,
        summary: `Product boundary for ${projectName}`,
        responsibility: "Owns the product boundary",
        elementType: "software_system",
        level: "context",
        layer: "application",
        linkedFiles: [],
        upstream: [],
        downstream: ["container_app"],
        confidence: 0.8,
        tags: ["ai-scan"],
        children: ["container_app"],
      },
      {
        id: "container_app",
        type: "capability",
        name: "App container",
        status: "active",
        description: "Application container",
        summary: "Hosts the Node runtime",
        responsibility: "Runs the service",
        elementType: "container",
        level: "container",
        layer: "application",
        linkedFiles: [],
        upstream: ["system_root"],
        downstream: ["component_core"],
        confidence: 0.8,
        tags: ["ai-scan"],
        parentId: "system_root",
        children: ["component_core"],
      },
      {
        id: "component_core",
        type: "capability",
        name: "Main module",
        status: "active",
        description: "Primary module",
        summary: "Entry logic",
        responsibility: "Owns src/main.ts",
        elementType: "component",
        level: "component",
        layer: "application",
        linkedFiles: [{ path: "src/main.ts", role: "primary" }],
        upstream: ["container_app"],
        downstream: [],
        confidence: 0.75,
        tags: ["ai-scan"],
        parentId: "container_app",
        children: [],
      },
    ],
    edges: [
      {
        id: "edge_system_app",
        source: "system_root",
        target: "container_app",
        relation: "depends_on",
        label: "system → app",
        confidence: 0.8,
        evidence: "package.json and src/main.ts",
      },
    ],
    fileIndex: [
      {
        path: "src/main.ts",
        type: "lib",
        nodeIds: ["component_core"],
        imports: [],
        exports: [],
      },
      {
        path: "package.json",
        type: "config",
        nodeIds: ["component_core"],
        imports: [],
        exports: [],
      },
    ],
    topology: { rootIds: ["system_root"], maxDepth: 2, totalNodes: 3 },
    analysisError: null,
  });
}

describe("openWorkspace structure graph AI scan", () => {
  it("upgrades heuristic graph when mock gateway returns a valid C4 map", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);

    const complete = vi.fn(async (profile, request) => {
      const projectId =
        typeof request.projectId === "string" ? request.projectId : bootstrap.projectId;
      return {
        requestId: "req_open",
        provider: "mock",
        model: profile.model,
        output: modelGraphOutput(projectId, "stranger"),
        usage: { inputTokens: 1, outputTokens: 2 },
        latencyMs: 1,
      };
    });
    const gateway = { complete } as unknown as ModelGateway;
    const api = new ProjectOSLocalApi({ modelGateway: gateway });

    const project = await api.openWorkspace(root);
    const upgraded = await api.getProjectGraph(project.projectId);
    const tree = await api.getSemanticTree(project.projectId);

    expect(complete).toHaveBeenCalled();
    expect(upgraded.analysisStatus).toBe("complete");
    expect(upgraded.nodes.some((node) => node.name === "Main module")).toBe(true);
    expect(tree.roots.some((node) => node.label === "App container")).toBe(true);

    // Second open should not burn another scan once complete.
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
    const gateway = { complete } as unknown as ModelGateway;
    const api = new ProjectOSLocalApi({ modelGateway: gateway });
    const project = await api.openWorkspace(root);
    const loaded = await api.getProjectGraph(project.projectId);

    expect(complete).toHaveBeenCalled();
    expect(loaded.analysisStatus).toBe("partial");
    expect(
      JSON.parse(readFileSync(join(root, ".projectos", "graph.json"), "utf8")).analysisStatus,
    ).toBe("partial");
  });

  it("analyzeWorkspace force-rescans even when graph is already complete", async () => {
    const root = makeUnfamiliarRepo();
    const bootstrap = ensureWorkspaceBootstrapped(root);
    writeMockModelSettings(root, bootstrap.projectId);

    let call = 0;
    const complete = vi.fn(async (_profile, request) => {
      call += 1;
      const projectId =
        typeof request.projectId === "string" ? request.projectId : bootstrap.projectId;
      const output = JSON.parse(modelGraphOutput(projectId, "stranger")) as {
        nodes: Array<{ name: string }>;
      };
      output.nodes[2]!.name = call === 1 ? "Main module" : "Rescanned module";
      return {
        requestId: `req_${call}`,
        provider: "mock",
        model: "mock",
        output: JSON.stringify(output),
        usage: { inputTokens: 1, outputTokens: 2 },
        latencyMs: 1,
      };
    });
    const gateway = { complete } as unknown as ModelGateway;
    const api = new ProjectOSLocalApi({ modelGateway: gateway });
    const project = await api.openWorkspace(root);
    expect((await api.getProjectGraph(project.projectId)).nodes.some((n) => n.name === "Main module")).toBe(
      true,
    );

    const rescanned = await api.analyzeWorkspace(project.projectId);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(rescanned.nodes.some((node) => node.name === "Rescanned module")).toBe(true);
  });
});
