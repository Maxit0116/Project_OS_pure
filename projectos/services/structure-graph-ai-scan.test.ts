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
  resolveArchitecture,
  elementTypeFromId,
  isRetryableGateFailure,
  repairUnknownParents,
  runStructureGraphAiScan,
} from "./structure-graph-ai-scan.js";
import { buildHeuristicProjectGraph } from "./workspace-bootstrap.js";
import type { FunctionalNode } from "../contracts/graph.js";
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

  it("asks for the components once more when the quality gate refuses them, saying why", async () => {
    // more-itertools, packaged app: round B gave CI, docs and metadata components that own no code
    // and the whole map fell back to a placeholder.
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
    const noCode = JSON.stringify({
      // More components than the repository can give two files each: the gate refuses (thin_file_mounts).
      components: ["CI pipeline", "Documentation site", "Project metadata", "Issue templates", "Release notes", "Changelog", "Funding", "Code of conduct"].map((name, index) => ({
        id: `component_${index}`, name, parentId: "container_app", description: name, summary: name,
        responsibility: name, layer: "application", pathHints: [`.github/${index}`],
      })),
      edges: [],
    });
    const prompts: string[] = [];
    let roundBCalls = 0;
    const complete = vi.fn(async (_profile, request) => {
      const task = (request.input as { task?: string }).task;
      if (task === "structure_graph_round_a") return gatewayResponse(roundAJson());
      roundBCalls += 1;
      prompts.push(String(request.systemPrompt ?? "") + JSON.stringify(request.input ?? ""));
      return gatewayResponse(roundBCalls === 1 ? noCode : roundBJson());
    });
    const scanned = await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: heuristic, profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
    });
    expect(complete).toHaveBeenCalledTimes(3);
    expect(scanned.analysisStatus).toBe("complete");
    expect(scanned.nodes.some((node) => node.name === "Identity access")).toBe(true);
    expect(prompts[0]).not.toContain("PREVIOUS ATTEMPT REFUSED");
    expect(prompts[1]).toContain("PREVIOUS ATTEMPT REFUSED");
    expect(prompts[1]).toContain("thin_file_mounts");
    expect(prompts[1]).toContain("use fewer, each owning at least two source files");
  });

  it("reads the element type from `type`, `kind` or the id when the model leaves out level and elementType", async () => {
    // more-itertools, live: every round A node came as { id: "person_developer", type: "person" } with no
    // level, so none was a context or container and the map was refused (missing_container).
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
    const original = JSON.parse(roundAJson()) as { nodes: Array<Record<string, unknown>> };
    const stripped = {
      ...original,
      nodes: original.nodes.map((node, index) => {
        const { level: _level, elementType, ...rest } = node;
        return index % 2 === 0 ? { ...rest, type: elementType } : rest;
      }),
    };
    const complete = vi.fn(async (_profile, request) => {
      const task = (request.input as { task?: string }).task;
      return gatewayResponse(task === "structure_graph_round_a" ? JSON.stringify(stripped) : roundBJson());
    });
    const scanned = await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: heuristic, profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
    });
    expect(scanned.analysisStatus).toBe("complete");
    for (const node of original.nodes) {
      expect(scanned.nodes.find((candidate) => candidate.id === node.id)?.level).toBe(node.level);
    }
    expect(elementTypeFromId("person_developer")).toBe("person");
    expect(elementTypeFromId("container_tests")).toBe("container");
    expect(elementTypeFromId("auth_service")).toBeUndefined();
  });

  it("attaches a component whose parent container does not exist instead of refusing the whole map", async () => {
    // FastAPI template, live: "Unknown parent node 'container_packages_react_email'" threw the map away.
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
    const b = JSON.parse(roundBJson()) as { components: Array<Record<string, unknown>> };
    b.components[0] = { ...b.components[0], parentId: "container_packages_react_email" };
    b.components[1] = { ...b.components[1], parentId: "container_node_runtime" };
    const complete = vi.fn(async (_profile, request) => {
      const task = (request.input as { task?: string }).task;
      return gatewayResponse(task === "structure_graph_round_a" ? roundAJson() : JSON.stringify(b));
    });
    const scanned = await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: heuristic, profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
    });
    expect(scanned.analysisStatus).toBe("complete");
    expect(scanned.nodes.find((node) => node.id === "component_auth")?.parentId).toBe("container_app");
    // The missing parent shares the word "node" with the "Node runtime" container: it is chosen by name.
    expect(scanned.nodes.find((node) => node.id === "component_billing")?.parentId).toBe("container_app");
  });

  it("repairs a dangling parent by the words it shares with a container, a container to the system", () => {
    const node = (id: string, level: string, parentId?: string, name = id) =>
      ({ id, name, level, ...(parentId ? { parentId } : {}) }) as unknown as FunctionalNode;
    const repaired = repairUnknownParents([
      node("sys", "context"),
      node("container_web", "container", "sys", "Web frontend"),
      node("container_api", "container", "sys", "Backend API"),
      node("c1", "component", "container_web_dashboard"),
      node("c2", "component", "container_backend_services"),
      node("c3", "component", "container_unrelated_thing"),
      node("c4", "container", "gone"),
      node("p1", "context", "gone"),
    ], "sys", "container_web");
    const by = (id: string) => repaired.find((candidate) => candidate.id === id);
    expect(by("c1")?.parentId).toBe("container_web");
    expect(by("c2")?.parentId).toBe("container_api");
    expect(by("c3")?.parentId).toBe("container_web");
    expect(by("c4")?.parentId).toBe("sys");
    expect(by("p1")).not.toHaveProperty("parentId");
  });

  it("writes the map in the interface language, not the README's, and asks for plain words", async () => {
    // An English repository's map used to be English for a person reading the app in Chinese.
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
    const prompts: string[] = [];
    const complete = vi.fn(async (_profile, request) => {
      const task = (request.input as { task?: string }).task;
      prompts.push(String(request.systemPrompt ?? ""));
      return gatewayResponse(task === "structure_graph_round_a" ? roundAJson() : roundBJson());
    });
    // The mocked answers are English, which the quality gate rightly refuses for a Chinese map; only
    // what was asked matters here.
    await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: heuristic, profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway, language: "zh-CN",
    }).catch(() => undefined);
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt).toContain("Language for names: Chinese");
      expect(prompt).toContain("Write for a reader who does not code");
      expect(prompt).toContain("never just a protocol");
      expect(prompt).toContain("names the function");
    }
    expect(prompts[0]).toContain("the language the person reads the app in");
  });

  it("rewrites the map's text in another language and keeps ids, structure and untranslated text", async () => {
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
    const english = await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: heuristic, profile: mockProfile(),
      gateway: { complete: vi.fn(async (_p, request) => gatewayResponse((request.input as { task?: string }).task === "structure_graph_round_a" ? roundAJson() : roundBJson())) } as unknown as ModelGateway,
    });
    const sent: Array<Record<string, Record<string, string>>> = [];
    const complete = vi.fn(async (_profile, request) => {
      const items = (request.input as { items: Record<string, Record<string, string>> }).items;
      sent.push(items);
      // Translate every text to "<field> zh" and leave out one node entirely, as a model may.
      const answer = Object.fromEntries(
        Object.entries(items)
          .filter(([key]) => key !== "n:component_billing")
          .map(([key, fields]) => [key, Object.fromEntries(Object.entries(fields).map(([field, text]) => [field, `${text} (中文)`]))]),
      );
      return gatewayResponse(JSON.stringify({ items: answer }));
    });
    const rewritten = await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: english, profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway, language: "zh-CN", scanMode: "translate",
    });
    expect(complete).toHaveBeenCalledTimes(Math.ceil(sent.flatMap((batch) => Object.keys(batch)).length / 20));
    expect(rewritten.nodes.map((node) => node.id)).toEqual(english.nodes.map((node) => node.id));
    expect(rewritten.edges.map((edge) => edge.id)).toEqual(english.edges.map((edge) => edge.id));
    expect(rewritten.fileIndex).toEqual(english.fileIndex);
    expect(rewritten.nodes.find((node) => node.id === "component_auth")?.name).toBe("Identity access (中文)");
    // The one the model left out keeps its text.
    expect(rewritten.nodes.find((node) => node.id === "component_billing")?.name).toBe("Billing checkout");
  });

  it("rewrites only the connection labels, as functions, showing the model what each connects", async () => {
    const { root, projectId } = makeTempRepo();
    const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
    const scanned = await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: heuristic, profile: mockProfile(),
      gateway: { complete: vi.fn(async (_p, request) => gatewayResponse((request.input as { task?: string }).task === "structure_graph_round_a" ? roundAJson() : roundBJson())) } as unknown as ModelGateway,
    });
    expect((scanned.edges ?? []).length).toBeGreaterThan(0);
    const requests: Array<{ systemPrompt: string; items: Record<string, Record<string, unknown>> }> = [];
    const complete = vi.fn(async (_profile, request) => {
      const items = (request.input as { items: Record<string, Record<string, unknown>> }).items;
      requests.push({ systemPrompt: String(request.systemPrompt ?? ""), items });
      return gatewayResponse(JSON.stringify({ items: Object.fromEntries(Object.keys(items).map((key) => [key, { label: `Look up ${key}` }])) }));
    });
    const rewritten = await runStructureGraphAiScan({
      workspaceRoot: root, projectId, displayName: "demo", graph: scanned, profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway, language: "en", scanMode: "connections",
    });
    const edges = scanned.edges ?? [];
    expect(requests.flatMap((request) => Object.keys(request.items)).sort()).toEqual(edges.map((edge) => `e:${edge.id}`).sort());
    // The model sees both ends and the label it is replacing, and is told what a good label is.
    const first = edges[0]!;
    const shown = requests[0]!.items[`e:${first.id}`]!;
    const nameOf = (id: string) => scanned.nodes.find((node) => node.id === id)?.name;
    expect(shown).toMatchObject({ from: { name: nameOf(first.source) }, to: { name: nameOf(first.target) } });
    expect(requests[0]!.systemPrompt).toContain("names the function");
    expect(requests[0]!.systemPrompt).toContain("English");
    // Only labels change.
    expect(rewritten.edges?.map((edge) => edge.label)).toEqual(edges.map((edge) => `Look up e:${edge.id}`));
    expect(rewritten.nodes).toEqual(scanned.nodes);
    expect(rewritten.edges?.map((edge) => edge.id)).toEqual(edges.map((edge) => edge.id));
  });

  it("asks only once more, and not at all for a failure another round cannot fix", () => {
    expect(isRetryableGateFailure(["components_without_code:3"])).toBe(true);
    expect(isRetryableGateFailure(["thin_file_mounts:1<4"])).toBe(true);
    expect(isRetryableGateFailure(["language_mismatch_expected_en", "invalid_edges:2"])).toBe(false);
  });

  describe("what the scan asks of the model, and what it shows it", () => {
    const run = async (root: string, projectId: string, roundB: (request: any) => string) => {
      const requests: any[] = [];
      const complete = vi.fn(async (_profile, request) => {
        requests.push(request);
        const task = (request.input as { task?: string }).task;
        return gatewayResponse(task === "structure_graph_round_a" ? roundAJson() : roundB(request));
      });
      const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
      const scanned = await runStructureGraphAiScan({
        workspaceRoot: root,
        projectId,
        displayName: "demo",
        graph: heuristic,
        profile: mockProfile(),
        gateway: { complete } as unknown as ModelGateway,
      });
      return { scanned, requests };
    };

    it("asks without hidden reasoning, which only spent the output budget and made calls slow", async () => {
      const { root, projectId } = makeTempRepo();
      const { requests } = await run(root, projectId, () => roundBJson());
      expect(requests.length).toBe(2);
      for (const request of requests) expect(request.thinkingDepth).toBe("off");
    });

    it("tells the model how many components this repository can have, and where its files are", async () => {
      const { root, projectId } = makeTempRepo();
      const { requests } = await run(root, projectId, () => roundBJson());
      const roundB = requests.find((request) => request.input.task === "structure_graph_round_b");
      expect(roundB.systemPrompt).toMatch(/\d+–\d+ in total for this repository \(\d+ source files\)/u);
      expect(roundB.systemPrompt).toContain("Never more components than half the number of source files");
      expect(roundB.input.directories.some((entry: string) => entry.startsWith("src/auth/"))).toBe(true);
    });

    it("builds the map from the whole tree, not from the first 400 files in directory order", async () => {
      const { root, projectId } = makeTempRepo();
      mkdirSync(join(root, "aaa-docs"), { recursive: true });
      for (let index = 0; index < 450; index += 1) {
        writeFileSync(join(root, "aaa-docs", `page-${String(index).padStart(3, "0")}.md`), "# page\n");
      }
      mkdirSync(join(root, "zzz-engine", "core"), { recursive: true });
      for (let index = 0; index < 8; index += 1) {
        writeFileSync(join(root, "zzz-engine", "core", `part${index}.ts`), `export const p${index} = ${index};\n`);
      }
      const { scanned, requests } = await run(root, projectId, () =>
        JSON.stringify({
          components: [
            { id: "component_engine", name: "Engine core", parentId: "container_app", description: "The engine", summary: "Runs the engine", responsibility: "Owns the engine", layer: "application", pathHints: ["zzz-engine/core"] },
            { id: "component_auth", name: "Identity access", parentId: "container_app", description: "Login", summary: "Authenticates", responsibility: "Owns sign-in", layer: "application", pathHints: ["src/auth"] },
            { id: "component_billing", name: "Billing", parentId: "container_app", description: "Plans", summary: "Charges", responsibility: "Owns billing", layer: "application", pathHints: ["src/billing"] },
          ],
          edges: [],
        }),
      );

      const roundB = requests.find((request) => request.input.task === "structure_graph_round_b");
      expect(roundB.input.files).toContain("zzz-engine/core/");
      expect(roundB.input.directories.some((entry: string) => entry.startsWith("zzz-engine/core/"))).toBe(true);
      const engine = scanned.nodes.find((node) => node.id === "component_engine")!;
      expect(engine.linkedFiles.length).toBeGreaterThanOrEqual(8);
      expect(scanned.fileIndex.some((entry) => entry.path === "zzz-engine/core/part7.ts")).toBe(true);
    });

    it("keeps a model's capability-named components for a small project instead of a placeholder map", async () => {
      // more-itertools shape: a few source files, more components than files can fill in pairs.
      const root = mkdtempSync(join(tmpdir(), "structure-graph-small-"));
      mkdirSync(join(root, "lib"), { recursive: true });
      mkdirSync(join(root, "tests"), { recursive: true });
      writeFileSync(join(root, "README.md"), "# Tiny\nA small Python library.\n");
      writeFileSync(join(root, "lib", "__init__.py"), "from .more import *\nfrom .recipes import *\n");
      writeFileSync(join(root, "lib", "more.py"), "def chunked(x): return x\n");
      writeFileSync(join(root, "lib", "recipes.py"), "def take(n, it): return it\n");
      writeFileSync(join(root, "tests", "test_more.py"), "from lib.more import chunked\n");
      writeFileSync(join(root, "tests", "test_recipes.py"), "from lib.recipes import take\n");
      writeFileSync(join(root, "tests", "__init__.py"), "");
      writeFileSync(join(root, "setup.py"), "from setuptools import setup\nsetup()\n");
      const { scanned } = await run(root, "proj_small", () =>
        JSON.stringify({
          components: [
            { id: "c_api", name: "Public API", parentId: "container_app", description: "d", summary: "s", responsibility: "r", layer: "application", pathHints: ["lib/__init__.py"] },
            { id: "c_more", name: "Combinators", parentId: "container_app", description: "d", summary: "s", responsibility: "r", layer: "application", pathHints: ["lib/more.py"] },
            { id: "c_recipes", name: "Recipes", parentId: "container_app", description: "d", summary: "s", responsibility: "r", layer: "application", pathHints: ["lib/recipes.py"] },
            { id: "c_tests", name: "Test suite", parentId: "container_app", description: "d", summary: "s", responsibility: "r", layer: "application", pathHints: ["tests"] },
          ],
          edges: [],
        }),
      );
      expect(scanned.analysisStatus).toBe("complete");
      expect(scanned.nodes.some((node) => node.name === "Combinators")).toBe(true);
    });
  });

  describe("an architecture block the model filled with project metadata", () => {
    // Observed on the Python library more-itertools: round A returned `architecture: {projectId, repo,
    // name, description, round, language}`. The assembled graph then failed validation ("notation:
    // Invalid literal value, expected c4; defaultLevel: Required; layers: Required") and the scan kept
    // a placeholder map although the model had produced a good one.
    const metadataBlock = {
      projectId: "30f3ac2a",
      repo: "repo",
      name: "demo",
      description: "A demo",
      round: "A",
      language: "en",
    };

    it("still produces the map from the nodes the model returned", async () => {
      const { root, projectId } = makeTempRepo();
      const heuristic = buildHeuristicProjectGraph({
        projectId,
        projectName: "demo",
        projectType: "node",
        workspaceRoot: root,
      });
      const complete = vi.fn(async (_profile, request) => {
        const task = (request.input as { task?: string }).task;
        if (task !== "structure_graph_round_a") return gatewayResponse(roundBJson());
        return gatewayResponse(
          JSON.stringify({ ...JSON.parse(roundAJson()), architecture: metadataBlock }),
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

      expect(scanned.analysisStatus).toBe("complete");
      expect(scanned.nodes.some((node) => node.name === "Identity access")).toBe(true);
      expect(scanned.architecture?.notation).toBe("c4");
    });

    it("keeps the layers and level that are usable and replaces the rest", () => {
      const resolved = resolveArchitecture(
        {
          ...metadataBlock,
          defaultLevel: "context",
          layers: [
            { id: "core", label: "Core", order: 0, description: "Core logic" },
            { id: "", label: "broken", order: "x" },
          ],
        },
        "en",
      );
      expect(resolved.defaultLevel).toBe("context");
      expect(resolved.layers.map((layer) => layer.id)).toEqual(["core"]);
    });

    it.each([undefined, null, "c4", 7, [], {}])("falls back to the defaults for %j", (raw) => {
      const resolved = resolveArchitecture(raw, "en");
      expect(resolved.notation).toBe("c4");
      expect(resolved.layers.length).toBeGreaterThan(0);
    });
  });

  describe("a model reply cut off at its output limit", () => {
    const cutOff = (output: string) => ({
      ...gatewayResponse(output),
      finishReason: "length",
      usage: { inputTokens: 10, outputTokens: 8_192 },
    });
    const run = async (complete: ReturnType<typeof vi.fn>) => {
      const { root, projectId } = makeTempRepo();
      const heuristic = buildHeuristicProjectGraph({ projectId, projectName: "demo", projectType: "node", workspaceRoot: root });
      return runStructureGraphAiScan({
        workspaceRoot: root,
        projectId,
        displayName: "demo",
        graph: heuristic,
        profile: mockProfile(),
        gateway: { complete } as unknown as ModelGateway,
      });
    };

    it("asks again with a larger budget instead of patching the cut-off JSON shut", async () => {
      let roundBCalls = 0;
      const complete = vi.fn(async (_profile, request) => {
        const task = (request.input as { task?: string }).task;
        if (task === "structure_graph_round_a") return gatewayResponse(roundAJson());
        roundBCalls += 1;
        // First answer: cut mid-object, as a reasoning model that spent its budget thinking leaves it.
        return roundBCalls === 1 ? cutOff(roundBJson().slice(0, 140)) : gatewayResponse(roundBJson());
      });

      const scanned = await run(complete);

      expect(roundBCalls).toBe(2);
      const budgets = complete.mock.calls
        .filter((call) => (call[1].input as { task?: string }).task !== "structure_graph_round_a")
        .map((call) => call[1].maxOutputTokens);
      expect(budgets).toEqual([8_192, 16_384]);
      expect(scanned.nodes.filter((node) => node.level === "component")).toHaveLength(3);
    });

    it("fails, so the current graph is kept, when the larger budget is cut off too", async () => {
      const complete = vi.fn(async (_profile, request) => {
        const task = (request.input as { task?: string }).task;
        if (task === "structure_graph_round_a") return gatewayResponse(roundAJson());
        return {
          ...cutOff(roundBJson().slice(0, 140)),
          usage: { inputTokens: 10, outputTokens: 16_384 },
        };
      });

      await expect(run(complete)).rejects.toMatchObject({ code: "model_output_invalid" });
    });

    it("does not retry a reply that finished normally", async () => {
      const complete = vi.fn(async (_profile, request) => {
        const task = (request.input as { task?: string }).task;
        return gatewayResponse(task === "structure_graph_round_a" ? roundAJson() : roundBJson());
      });
      await run(complete);
      expect(complete).toHaveBeenCalledTimes(2);
    });
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
