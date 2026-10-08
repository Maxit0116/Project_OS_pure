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

function makeTempRepo(options?: {
  packageJson?: string;
  extraFiles?: Array<{ relativePath: string; body: string }>;
}): { root: string; projectId: string } {
  const root = mkdtempSync(join(tmpdir(), "structure-graph-ai-scan-"));
  mkdirSync(join(root, "src", "auth"), { recursive: true });
  mkdirSync(join(root, "src", "billing"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    options?.packageJson ?? '{"name":"demo","type":"module"}\n',
  );
  writeFileSync(join(root, "README.md"), "# Demo\nA small Node billing and auth service.\n");
  writeFileSync(join(root, "src", "auth", "session.ts"), "export const token = 't';\n");
  writeFileSync(
    join(root, "src", "auth", "login.ts"),
    "import { token } from './session';\nexport function login() { return token; }\n",
  );
  writeFileSync(join(root, "src", "billing", "plan.ts"), "export const plan = 'pro';\n");
  writeFileSync(
    join(root, "src", "billing", "checkout.ts"),
    "import { plan } from './plan';\nexport function checkout() { return plan; }\n",
  );
  writeFileSync(
    join(root, "src", "app.ts"),
    "import { login } from './auth/login';\nexport const boot = login;\n",
  );
  for (const file of options?.extraFiles ?? []) {
    const absolute = join(root, file.relativePath);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, file.body);
  }
  return { root, projectId: "proj_test_structure" };
}

function mockProfile(): ModelProfile {
  return {
    id: "model_mock",
    name: "Mock",
    provider: "custom",
    apiFormat: "openai_chat",
    model: "mock",
    baseUrl: "http://127.0.0.1:9",
    apiKeyRef: "secret://mock",
    isDefault: true,
  } as ModelProfile;
}

function gatewayResponse(output: string) {
  return {
    requestId: "req_1",
    provider: "mock",
    model: "mock-model",
    output,
    usage: { inputTokens: 10, outputTokens: 20 },
    latencyMs: 1,
  };
}

function roundAJson(options?: { withDataStore?: boolean }): string {
  const nodes: Record<string, unknown>[] = [
    {
      id: "system_root",
      name: "Demo service",
      level: "context",
      elementType: "software_system",
      description: "Product boundary for the demo service",
      summary: "Hosts auth and billing",
      responsibility: "Owns the product",
      layer: "application",
    },
    {
      id: "container_app",
      name: "Node runtime",
      level: "container",
      elementType: "container",
      parentId: "system_root",
      description: "Application container for the Node service",
      summary: "Runs HTTP entrypoints",
      responsibility: "Hosts application modules",
      layer: "application",
      technology: "Node.js / Express",
    },
  ];
  const edges: Record<string, unknown>[] = [
    {
      id: "e1",
      source: "system_root",
      target: "container_app",
      relation: "depends_on",
      label: "contains",
      evidence: "src/ hosts the runtime",
    },
  ];
  if (options?.withDataStore) {
    nodes.push(
      {
        id: "container_db",
        name: "Primary database",
        level: "container",
        elementType: "data_store",
        parentId: "system_root",
        description: "PostgreSQL persistence for auth and billing",
        summary: "Stores durable records",
        responsibility: "Owns relational data",
        layer: "infrastructure",
        technology: "PostgreSQL",
      },
      {
        id: "ext_stripe",
        name: "Stripe",
        level: "context",
        elementType: "external_system",
        description: "External payment processor SaaS",
        summary: "Charges cards",
        responsibility: "Processes payments",
        layer: "infrastructure",
        technology: "Stripe",
      },
    );
    edges.push({
      id: "e2",
      source: "container_app",
      target: "container_db",
      relation: "reads_from",
      label: "reads/writes",
      evidence: "prisma/schema.prisma",
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
    nodes,
    edges,
  });
}

function roundBJson(): string {
  return JSON.stringify({
    components: [
      {
        id: "component_auth",
        name: "Identity access",
        parentId: "container_app",
        description: "Login and session tokens",
        summary: "Authenticates members",
        responsibility: "Owns sign-in",
        layer: "application",
        pathHints: ["src/auth"],
      },
      {
        id: "component_billing",
        name: "Billing checkout",
        parentId: "container_app",
        description: "Plans and checkout flow",
        summary: "Charges subscribers",
        responsibility: "Owns billing",
        layer: "application",
        pathHints: ["src/billing"],
      },
      {
        id: "component_app",
        name: "Service bootstrap",
        parentId: "container_app",
        description: "Process entrypoint",
        summary: "Wires modules together",
        responsibility: "Owns startup",
        layer: "application",
        pathHints: ["src/app.ts", "package.json"],
      },
    ],
    edges: [],
  });
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
        { id: "experience", label: "Experience", order: 0, description: "User-facing clients" },
        { id: "application", label: "Application", order: 1, description: "Core product logic" },
        { id: "infrastructure", label: "Infrastructure", order: 2, description: "Platform concerns" },
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
        linkedFiles: [{ path: "src/app.ts", role: "primary" }],
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
      { path: "src/app.ts", type: "lib", nodeIds: ["component_core"], imports: [], exports: [] },
    ],
    topology: { rootIds: ["system_root"], maxDepth: 2, totalNodes: 3 },
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
    expect(parsed.fileIndex.some((entry) => entry.path.includes("does-not-exist"))).toBe(false);
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
    expect(context).toContain("src/app.ts");
  });

  it("runs two-round AI scan and mounts files plus code edges", async () => {
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({
      projectId,
      projectName: "demo",
      projectType: "node",
      workspaceRoot: root,
    });
    const complete = vi.fn(async (_profile, request) => {
      const task = (request.input as { task?: string }).task;
      return gatewayResponse(task === "structure_graph_round_a" ? roundAJson() : roundBJson());
    });
    const scanned = await runStructureGraphAiScan({
      workspaceRoot: root,
      projectId,
      displayName: "demo",
      graph: heuristic,
      profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
    });

    expect(complete).toHaveBeenCalledTimes(2);
    expect(scanned.analysisStatus).toBe("complete");
    expect(scanned.nodes.filter((node) => node.level === "component").length).toBe(3);
    expect(scanned.nodes.some((node) => node.name === "Identity access")).toBe(true);
    const auth = scanned.nodes.find((node) => node.id === "component_auth")!;
    expect(auth.linkedFiles.length).toBeGreaterThanOrEqual(2);
    expect(scanned.fileIndex.some((entry) => entry.imports.length > 0)).toBe(true);
    expect(scanned.nodes.some((node) => node.tags.includes("bootstrap"))).toBe(false);
  });

  it("preserves data_store / external_system and enriches technology from repo signals", async () => {
    const { root, projectId } = makeTempRepo({
      packageJson: JSON.stringify({
        name: "demo",
        dependencies: {
          next: "14.0.0",
          "@prisma/client": "5.0.0",
          kafkajs: "2.2.0",
          stripe: "14.0.0",
        },
      }),
      extraFiles: [
        {
          relativePath: "prisma/schema.prisma",
          body: `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n`,
        },
      ],
    });
    const heuristic = buildHeuristicProjectGraph({
      projectId,
      projectName: "demo",
      projectType: "node",
      workspaceRoot: root,
    });
    const complete = vi.fn(async (_profile, request) => {
      const task = (request.input as { task?: string }).task;
      return gatewayResponse(
        task === "structure_graph_round_a"
          ? roundAJson({ withDataStore: true })
          : roundBJson(),
      );
    });
    const scanned = await runStructureGraphAiScan({
      workspaceRoot: root,
      projectId,
      displayName: "demo",
      graph: heuristic,
      profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
    });

    const db = scanned.nodes.find((node) => node.id === "container_db")!;
    expect(db.elementType).toBe("data_store");
    expect(db.technology).toMatch(/PostgreSQL/i);

    const stripe = scanned.nodes.find((node) => node.id === "ext_stripe")!;
    expect(stripe.elementType).toBe("external_system");

    const app = scanned.nodes.find((node) => node.id === "container_app")!;
    expect(app.technology).toBeTruthy();

    const roundAPrompt = String(complete.mock.calls[0]?.[1]?.systemPrompt ?? "");
    expect(roundAPrompt).toMatch(/data_store|PostgreSQL|external_system/i);
  });

  it("skips the gateway when the graph is already complete unless forced", async () => {
    const { root, projectId } = makeTempRepo();
    const completeGraph = parseProjectGraphFromModelOutput(
      validModelGraphJson({ projectId, projectName: "demo" }),
      { workspaceRoot: root, projectId, projectName: "demo" },
    );
    const complete = vi.fn();
    const skipped = await runStructureGraphAiScan({
      workspaceRoot: root,
      projectId,
      displayName: "demo",
      graph: completeGraph,
      profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
    });
    expect(complete).not.toHaveBeenCalled();
    expect(skipped.analysisStatus).toBe("complete");

    complete.mockImplementation(async (_profile, request) => {
      const task = (request.input as { task?: string }).task;
      return gatewayResponse(task === "structure_graph_round_a" ? roundAJson() : roundBJson());
    });
    await runStructureGraphAiScan({
      workspaceRoot: root,
      projectId,
      displayName: "demo",
      graph: completeGraph,
      profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
      force: true,
    });
    expect(complete).toHaveBeenCalled();
  });
});
