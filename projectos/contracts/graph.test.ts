import { describe, expect, it } from "vitest";

import {
  PROJECT_GRAPH_LIMITS,
  ProjectGraphSchema,
  type ProjectGraph,
} from "./graph.js";

function architectureGraph(): ProjectGraph {
  return {
    version: "0.3.0",
    projectId: "project_1",
    projectName: "Example",
    projectType: "nextjs-app",
    analyzedAt: "2026-07-14T00:00:00.000Z",
    analysisStatus: "complete",
    architecture: {
      notation: "c4",
      defaultLevel: "component",
      layers: [
        { id: "experience", label: "Experience", order: 0, description: "User-facing entry points" },
        { id: "application", label: "Application", order: 1, description: "Application responsibilities" },
      ],
    },
    nodes: [
      {
        id: "component_web",
        type: "capability",
        name: "Web Experience",
        status: "active",
        description: "Customer-facing browser experience",
        summary: "Renders public and authenticated product flows.",
        responsibility: "Renders public and authenticated product flows.",
        elementType: "component",
        level: "component",
        layer: "experience",
        technology: "React",
        linkedFiles: [],
        upstream: [],
        downstream: ["component_identity"],
        confidence: 1,
        tags: [],
        children: ["code_render"],
      },
      {
        id: "component_identity",
        type: "capability",
        name: "Identity & Access",
        status: "active",
        description: "Authentication boundary",
        summary: "Verifies credentials and sessions.",
        responsibility: "Verifies credentials and sessions.",
        elementType: "component",
        level: "component",
        layer: "application",
        technology: "Next.js",
        linkedFiles: [],
        upstream: ["component_web"],
        downstream: [],
        confidence: 1,
        tags: [],
      },
      {
        id: "code_render",
        type: "capability",
        name: "页面渲染",
        status: "active",
        description: "将产品状态呈现为用户可见页面",
        summary: "负责页面渲染。",
        responsibility: "将产品状态呈现为用户可见页面。",
        elementType: "code_element",
        level: "code",
        layer: "experience",
        technology: "React",
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 1,
        tags: [],
        parentId: "component_web",
        children: [],
      },
    ],
    edges: [
      {
        id: "edge_web_identity",
        source: "component_web",
        target: "component_identity",
        relation: "calls",
        label: "submits credentials",
        technology: "HTTPS / JSON",
        confidence: 1,
        evidence: "app/login/page.tsx -> app/api/auth/route.ts",
      },
    ],
    fileIndex: [],
  };
}

describe("ProjectGraphSchema architecture model", () => {
  it("accepts C4 levels, SWE layers, responsibilities, and labelled relationships", () => {
    const parsed = ProjectGraphSchema.parse(architectureGraph());

    expect(parsed.architecture?.defaultLevel).toBe("component");
    expect(parsed.nodes[0]?.responsibility).toContain("product flows");
    expect(parsed.edges[0]?.label).toBe("submits credentials");
  });

  it("requires meaningful labels and evidence for v0.3 relationships", () => {
    const graph = architectureGraph();
    const edge = graph.edges[0];
    if (!edge) throw new Error("Architecture fixture is missing its relationship");
    graph.edges[0] = { ...edge, label: "", evidence: "" };

    const result = ProjectGraphSchema.safeParse(graph);

    expect(result.success).toBe(false);
  });

  it("rejects architecture nodes that reference an unknown layer", () => {
    const graph = architectureGraph();
    const node = graph.nodes[0];
    if (!node) throw new Error("Architecture fixture is missing its first node");
    graph.nodes[0] = { ...node, layer: "unknown" };

    const result = ProjectGraphSchema.safeParse(graph);

    expect(result.success).toBe(false);
  });

  it("accepts a responsibility-based code graph owned by a component", () => {
    const parsed = ProjectGraphSchema.parse(architectureGraph());

    expect(parsed.nodes.find((node) => node.id === "code_render")?.parentId).toBe(
      "component_web",
    );
  });

  it("accepts scoped file relationships whose file nodes are projected at runtime", () => {
    const graph = architectureGraph();
    const component = graph.nodes.find((node) => node.id === "component_web");
    if (!component) throw new Error("Architecture fixture is missing its web component");
    component.linkedFiles = [
      { path: "app/login/page.tsx", role: "primary" },
      { path: "app/api/auth/route.ts", role: "supporting" },
    ];
    graph.fileIndex = [
      {
        path: "app/login/page.tsx",
        type: "page",
        nodeIds: ["component_web"],
        imports: [],
        exports: ["default"],
      },
      {
        path: "app/api/auth/route.ts",
        type: "api",
        nodeIds: ["component_web"],
        imports: [],
        exports: ["POST"],
      },
    ];
    graph.fileRelations = [
      {
        id: "file_login_auth",
        sourcePath: "app/login/page.tsx",
        targetPath: "app/api/auth/route.ts",
        relation: "calls",
        label: "提交登录信息",
        purpose: "用于验证凭据并创建会话",
        confidence: 1,
        evidence: "app/login/page.tsx -> app/api/auth/route.ts",
      },
    ];

    const parsed = ProjectGraphSchema.parse(graph);

    expect(parsed.fileRelations?.[0]?.label).toBe("提交登录信息");
    expect(parsed.fileRelations?.[0]?.purpose).toBe("用于验证凭据并创建会话");
  });

  it("rejects file relationships that reference files outside the file index", () => {
    const graph = architectureGraph();
    graph.fileRelations = [
      {
        id: "file_login_auth",
        sourcePath: "app/login/page.tsx",
        targetPath: "app/api/auth/route.ts",
        relation: "calls",
        label: "提交登录信息",
        confidence: 1,
        evidence: "app/login/page.tsx -> app/api/auth/route.ts",
      },
    ];

    expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
  });

  it("rejects duplicate file index paths", () => {
    const graph = architectureGraph();
    graph.fileIndex = [
      {
        path: "app/login/page.tsx",
        type: "page",
        nodeIds: ["component_web"],
        imports: [],
        exports: ["default"],
      },
      {
        path: "app/login/page.tsx",
        type: "page",
        nodeIds: ["component_identity"],
        imports: [],
        exports: ["default"],
      },
    ];

    expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
  });

  it("rejects file relationships that cross feature module ownership", () => {
    const graph = architectureGraph();
    const web = graph.nodes.find((node) => node.id === "component_web");
    const identity = graph.nodes.find((node) => node.id === "component_identity");
    if (!web || !identity) throw new Error("Architecture fixture is missing components");
    web.linkedFiles = [{ path: "app/login/page.tsx", role: "primary" }];
    identity.linkedFiles = [{ path: "app/api/auth/route.ts", role: "primary" }];
    graph.fileIndex = [
      {
        path: "app/login/page.tsx",
        type: "page",
        nodeIds: ["component_web"],
        imports: [],
        exports: ["default"],
      },
      {
        path: "app/api/auth/route.ts",
        type: "api",
        nodeIds: ["component_identity"],
        imports: [],
        exports: ["POST"],
      },
    ];
    graph.fileRelations = [
      {
        id: "file_login_auth",
        sourcePath: "app/login/page.tsx",
        targetPath: "app/api/auth/route.ts",
        relation: "calls",
        label: "提交登录信息",
        confidence: 1,
        evidence: "app/login/page.tsx -> app/api/auth/route.ts",
      },
    ];

    expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
  });

  it("rejects code elements without a reciprocal component parent", () => {
    const graph = architectureGraph();
    const codeNode = graph.nodes.find((node) => node.id === "code_render");
    if (!codeNode) throw new Error("Architecture fixture is missing its code node");
    codeNode.parentId = "component_identity";

    expect(ProjectGraphSchema.safeParse(graph).success).toBe(false);
  });

  it("rejects reciprocal parent links that form an architecture cycle", () => {
    const graph = architectureGraph();
    const web = graph.nodes.find((node) => node.id === "component_web");
    const identity = graph.nodes.find((node) => node.id === "component_identity");
    if (!web || !identity) throw new Error("Architecture fixture is missing components");
    web.parentId = identity.id;
    web.children = [...(web.children ?? []), identity.id];
    identity.parentId = web.id;
    identity.children = [web.id];

    const result = ProjectGraphSchema.safeParse(graph);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(["parentId"]),
            message: expect.stringContaining("cycle"),
          }),
        ]),
      );
    }
  });

  it("rejects a graph whose node array exceeds the contract limit", () => {
    const graph = architectureGraph();
    graph.version = "0.2.0";
    graph.architecture = undefined;
    graph.edges = [];
    graph.nodes = Array.from(
      { length: PROJECT_GRAPH_LIMITS.nodes + 1 },
      (_, index) => ({
        id: `node_${index}`,
        type: "capability" as const,
        name: `Node ${index}`,
        status: "active" as const,
        description: `Description ${index}`,
        summary: `Summary ${index}`,
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 1,
        tags: [],
      }),
    );
    Object.defineProperty(graph.nodes, 0, {
      configurable: true,
      get() {
        throw new Error("Oversized node arrays must be rejected before item parsing");
      },
    });

    const result = ProjectGraphSchema.safeParse(graph);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "too_big",
            path: ["nodes"],
          }),
        ]),
      );
    }
  });

  it("accepts a large graph below the contract limit", () => {
    const graph = architectureGraph();
    graph.version = "0.2.0";
    graph.architecture = undefined;
    graph.edges = [];
    graph.nodes = Array.from({ length: 3_000 }, (_, index) => ({
      id: `node_${index}`,
      type: "capability" as const,
      name: `Node ${index}`,
      status: "active" as const,
      description: `Description ${index}`,
      summary: `Summary ${index}`,
      linkedFiles: [],
      upstream: [],
      downstream: [],
      confidence: 1,
      tags: [],
    }));

    const parsed = ProjectGraphSchema.parse(graph);

    expect(parsed.nodes).toHaveLength(3_000);
  });

  it("accepts a file relationship when its endpoints share any component owner", () => {
    const graph = architectureGraph();
    const web = graph.nodes.find((node) => node.id === "component_web");
    const identity = graph.nodes.find((node) => node.id === "component_identity");
    if (!web || !identity) throw new Error("Architecture fixture is missing components");
    web.linkedFiles = [
      { path: "app/shared/source.ts", role: "primary" },
      { path: "app/shared/target.ts", role: "supporting" },
    ];
    identity.linkedFiles = [{ path: "app/shared/source.ts", role: "supporting" }];
    graph.fileIndex = [
      {
        path: "app/shared/source.ts",
        type: "lib",
        nodeIds: ["component_web", "component_identity"],
        imports: [],
        exports: ["source"],
      },
      {
        path: "app/shared/target.ts",
        type: "lib",
        nodeIds: ["component_web"],
        imports: [],
        exports: ["target"],
      },
    ];
    graph.fileRelations = [
      {
        id: "file_shared",
        sourcePath: "app/shared/source.ts",
        targetPath: "app/shared/target.ts",
        relation: "calls",
        label: "共享组件内部调用",
        confidence: 1,
        evidence: "app/shared/source.ts -> app/shared/target.ts",
      },
    ];

    expect(ProjectGraphSchema.safeParse(graph).success).toBe(true);
  });
});
