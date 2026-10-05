import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ProjectGraph } from "../contracts/graph.js";
import type { ModelProfile } from "../contracts/settings.js";
import {
  assessGraphCompleteness,
  buildRepoScanContext,
  graphNeedsAiScan,
  parseProjectGraphFromModelOutput,
  runStructureGraphAiScan,
} from "./structure-graph-ai-scan.js";
import { buildHeuristicProjectGraph } from "./workspace-bootstrap.js";
import type { ModelGateway } from "./model-gateway/index.js";

function makeTempRepo(): { root: string; projectId: string } {
  const root = mkdtempSync(join(tmpdir(), "structure-graph-ai-scan-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"demo","type":"module"}\n');
  writeFileSync(join(root, "README.md"), "# Demo\n");
  writeFileSync(join(root, "src", "index.ts"), "export const ok = true;\n");
  return { root, projectId: "proj_test_structure" };
}

function validModelGraphJson(input: {
  projectId: string;
  projectName: string;
}): string {
  return JSON.stringify({
    version: "0.3.0",
    projectId: input.projectId,
    projectName: input.projectName,
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
        name: input.projectName,
        status: "active",
        description: `${input.projectName} software system`,
        summary: `Product boundary for ${input.projectName}`,
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
        name: "Application runtime",
        status: "active",
        description: "Node application container",
        summary: "Runs the main Node service",
        responsibility: "Hosts application entrypoints",
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
        name: "Core module",
        status: "active",
        description: "Primary application module",
        summary: "Implements demo entry logic",
        responsibility: "Owns src entrypoints",
        elementType: "component",
        level: "component",
        layer: "application",
        linkedFiles: [{ path: "src/index.ts", role: "primary" }],
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
        purpose: "Containment",
        confidence: 0.8,
        evidence: "src/ hosts the Node entrypoint",
      },
    ],
    fileIndex: [
      {
        path: "src/index.ts",
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
      {
        path: "README.md",
        type: "other",
        nodeIds: ["component_core"],
        imports: [],
        exports: [],
      },
    ],
    topology: {
      rootIds: ["system_root"],
      maxDepth: 2,
      totalNodes: 3,
    },
    analysisError: null,
  });
}

describe("structure-graph-ai-scan", () => {
  it("flags heuristic bootstrap graphs as needing AI scan", () => {
    const { root, projectId } = makeTempRepo();
    const graph = buildHeuristicProjectGraph({
      projectId,
      projectName: "demo",
      projectType: "node",
      workspaceRoot: root,
    });
    expect(graph.analysisStatus).toBe("partial");
    expect(graphNeedsAiScan(graph)).toBe(true);
    expect(assessGraphCompleteness(graph).complete).toBe(false);
  });

  it("does not rescan a complete non-bootstrap graph", () => {
    const { root, projectId } = makeTempRepo();
    const parsed = parseProjectGraphFromModelOutput(
      validModelGraphJson({ projectId, projectName: "demo" }),
      { workspaceRoot: root, projectId, projectName: "demo" },
    );
    expect(parsed.analysisStatus).toBe("complete");
    expect(graphNeedsAiScan(parsed)).toBe(false);
  });

  it("strips invented file paths during parse", () => {
    const { root, projectId } = makeTempRepo();
    const raw = JSON.parse(
      validModelGraphJson({ projectId, projectName: "demo" }),
    ) as ProjectGraph;
    raw.fileIndex.push({
      path: "does-not-exist/secret.ts",
      type: "lib",
      nodeIds: ["component_core"],
      imports: [],
      exports: [],
    });
    raw.nodes[2]!.linkedFiles.push({
      path: "does-not-exist/secret.ts",
      role: "supporting",
    });
    const parsed = parseProjectGraphFromModelOutput(JSON.stringify(raw), {
      workspaceRoot: root,
      projectId,
      projectName: "demo",
    });
    expect(parsed.fileIndex.some((entry) => entry.path.includes("does-not-exist"))).toBe(
      false,
    );
    expect(
      parsed.nodes
        .flatMap((node) => node.linkedFiles)
        .some((file) => file.path.includes("does-not-exist")),
    ).toBe(false);
  });

  it("builds repo scan context with file samples", () => {
    const { root, projectId } = makeTempRepo();
    const graph = buildHeuristicProjectGraph({
      projectId,
      projectName: "demo",
      projectType: "node",
      workspaceRoot: root,
    });
    const context = buildRepoScanContext({
      workspaceRoot: root,
      displayName: "demo",
      graph,
    });
    expect(context).toContain("package.json");
    expect(context).toContain("src/index.ts");
  });

  it("runs AI scan through a mock gateway and returns a complete graph", async () => {
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({
      projectId,
      projectName: "demo",
      projectType: "node",
      workspaceRoot: root,
    });
    const complete = vi.fn(async () => ({
      requestId: "req_1",
      provider: "mock",
      model: "mock-model",
      output: validModelGraphJson({ projectId, projectName: "demo" }),
      usage: { inputTokens: 10, outputTokens: 20 },
      latencyMs: 1,
    }));
    const gateway = { complete } as unknown as ModelGateway;
    const profile = {
      id: "model_mock",
      name: "Mock",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "mock",
      baseUrl: "http://127.0.0.1:9",
      apiKeyRef: "secret://mock",
      isDefault: true,
    } as ModelProfile;

    const scanned = await runStructureGraphAiScan({
      workspaceRoot: root,
      projectId,
      displayName: "demo",
      graph: heuristic,
      profile,
      gateway,
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(scanned.analysisStatus).toBe("complete");
    expect(scanned.nodes.some((node) => node.tags.includes("ai-scan"))).toBe(true);
    expect(scanned.nodes.some((node) => node.tags.includes("bootstrap"))).toBe(false);
  });

  it("skips the gateway when the graph is already complete unless forced", async () => {
    const { root, projectId } = makeTempRepo();
    const completeGraph = parseProjectGraphFromModelOutput(
      validModelGraphJson({ projectId, projectName: "demo" }),
      { workspaceRoot: root, projectId, projectName: "demo" },
    );
    const complete = vi.fn();
    const gateway = { complete } as unknown as ModelGateway;
    const profile = {
      id: "model_mock",
      name: "Mock",
      provider: "custom",
      apiFormat: "openai_chat",
      model: "mock",
      baseUrl: "http://127.0.0.1:9",
      apiKeyRef: "secret://mock",
      isDefault: true,
    } as ModelProfile;

    const skipped = await runStructureGraphAiScan({
      workspaceRoot: root,
      projectId,
      displayName: "demo",
      graph: completeGraph,
      profile,
      gateway,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(skipped.analysisStatus).toBe("complete");

    complete.mockResolvedValue({
      requestId: "req_2",
      provider: "mock",
      model: "mock-model",
      output: validModelGraphJson({ projectId, projectName: "demo" }),
      usage: { inputTokens: 10, outputTokens: 20 },
      latencyMs: 1,
    });
    await runStructureGraphAiScan({
      workspaceRoot: root,
      projectId,
      displayName: "demo",
      graph: completeGraph,
      profile,
      gateway,
      force: true,
    });
    expect(complete).toHaveBeenCalledOnce();
  });
});
