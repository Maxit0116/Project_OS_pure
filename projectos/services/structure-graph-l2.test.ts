import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessL2GraphQuality,
  assignFilesToComponents,
  collectWorkspaceTechSignals,
  detectReadmeLanguage,
  enrichNodesForC4Shapes,
  isDirShellName,
  mergeStructureGraphs,
  parseGoImports,
  parsePackageImports,
  parsePythonRelativeImports,
  parseRelativeImports,
  parseRustImports,
  pruneDanglingEdges,
  resolveImportPath,
} from "./structure-graph-l2.js";
import type { FunctionalEdge, FunctionalNode, ProjectGraph } from "../contracts/graph.js";

describe("structure-graph-l2 helpers", () => {
  it("detects Chinese README language", () => {
    const root = mkdtempSync(join(tmpdir(), "l2-lang-zh-"));
    writeFileSync(join(root, "README.md"), "# 情侣录音\n这是一个跨平台应用。\n");
    expect(detectReadmeLanguage(root)).toBe("zh-CN");
  });

  it("detects English README language", () => {
    const root = mkdtempSync(join(tmpdir(), "l2-lang-en-"));
    writeFileSync(join(root, "README.md"), "# Demo\nA small Node service.\n");
    expect(detectReadmeLanguage(root)).toBe("en");
  });

  it("flags directory-shell names", () => {
    expect(isDirShellName("android module")).toBe(true);
    expect(isDirShellName("Identity & access")).toBe(false);
  });

  it("assigns unmatched source files onto components whose hints miss", () => {
    const assigned = assignFilesToComponents({
      files: ["qimen/chart.py", "qimen/palace.py", "qimen/stem.py"],
      components: [
        { id: "c_chart", pathHints: ["src/missing"] },
        { id: "c_palace", pathHints: ["lib/nope"] },
      ],
    });
    expect(assigned.get("c_chart")?.length).toBeGreaterThan(0);
    expect(assigned.get("c_palace")?.length).toBeGreaterThan(0);
    expect([...(assigned.get("c_chart") ?? []), ...(assigned.get("c_palace") ?? [])].sort()).toEqual([
      "qimen/chart.py",
      "qimen/palace.py",
      "qimen/stem.py",
    ]);
  });

  it("resolves Python, Go, and Rust imports onto repo files", () => {
    const python = parsePythonRelativeImports("from .palace import Palace\nfrom ..stem.table import Table\n");
    expect(python).toEqual([".palace", "..stem.table"]);
    const pyFiles = new Set(["qimen/chart.py", "qimen/palace.py", "qimen/stem/table.py"]);
    expect(resolveImportPath("qimen/chart.py", ".palace", pyFiles)).toBe("qimen/palace.py");
    expect(resolveImportPath("qimen/core/chart.py", "..stem.table", pyFiles)).toBe(
      "qimen/stem/table.py",
    );

    expect(parseGoImports('import "example.com/qimen/chart"\n')).toContain("example.com/qimen/chart");
    const goFiles = new Set(["qimen/chart.go", "qimen/palace.go"]);
    expect(resolveImportPath("qimen/palace.go", "example.com/qimen/chart", goFiles)).toBe(
      "qimen/chart.go",
    );

    expect(parseRustImports("use crate::chart::stem;\nmod palace;\n")).toEqual([
      "crate::chart::stem",
      "mod:palace",
    ]);
    const rustFiles = new Set(["src/chart/stem.rs", "src/palace.rs"]);
    expect(resolveImportPath("src/main.rs", "crate::chart::stem", rustFiles)).toBe(
      "src/chart/stem.rs",
    );
    expect(resolveImportPath("src/main.rs", "mod:palace", rustFiles)).toBe("src/palace.rs");
  });

  it("assigns files by longest path hint", () => {
    const assigned = assignFilesToComponents({
      files: ["src/auth/login.ts", "src/auth/session.ts", "src/billing/plan.ts", "README.md"],
      components: [
        { id: "c_auth", pathHints: ["src/auth"] },
        { id: "c_bill", pathHints: ["src/billing"] },
      ],
    });
    expect(assigned.get("c_auth")).toEqual(["src/auth/login.ts", "src/auth/session.ts"]);
    expect(assigned.get("c_bill")).toEqual(["src/billing/plan.ts"]);
  });

  it("parses and resolves relative imports", () => {
    const specs = parseRelativeImports(`import { x } from "./session";\nrequire("./plan");`);
    expect(specs).toContain("./session");
    const files = new Set(["src/auth/login.ts", "src/auth/session.ts"]);
    expect(resolveImportPath("src/auth/login.ts", "./session", files)).toBe(
      "src/auth/session.ts",
    );
  });

  it("resolves Kotlin package imports onto repo files", () => {
    const source = `package com.couplerecording.app.ui\nimport com.couplerecording.app.data.AppRepository\n`;
    const files = new Set([
      "android/app/src/main/kotlin/com/couplerecording/app/ui/AppViewModel.kt",
      "android/app/src/main/kotlin/com/couplerecording/app/data/AppRepository.kt",
    ]);
    expect(parsePackageImports(source)).toContain("com.couplerecording.app.data.AppRepository");
    expect(
      resolveImportPath(
        "android/app/src/main/kotlin/com/couplerecording/app/ui/AppViewModel.kt",
        "com.couplerecording.app.data.AppRepository",
        files,
      ),
    ).toBe("android/app/src/main/kotlin/com/couplerecording/app/data/AppRepository.kt");
  });

  it("fails L2 quality on dir-shell names", () => {
    const graph = {
      nodes: [
        { id: "s", level: "context", elementType: "software_system", name: "App", linkedFiles: [] },
        { id: "c", level: "container", name: "src", linkedFiles: [] },
        { id: "m", level: "component", name: "src module", linkedFiles: [] },
      ],
      fileIndex: [],
      fileRelations: [],
    } as unknown as ProjectGraph;
    const result = assessL2GraphQuality(graph, { sourceFileCount: 20, language: "en" });
    expect(result.complete).toBe(false);
    expect(result.reasons.some((reason) => reason.startsWith("dir_shell"))).toBe(true);
    expect(result.reasons.some((reason) => reason.startsWith("components_without_code"))).toBe(
      true,
    );
  });

  it("collects C4 tech signals from prisma, package.json, and queue deps", () => {
    const root = mkdtempSync(join(tmpdir(), "l2-tech-"));
    mkdirSync(join(root, "prisma"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "demo",
        dependencies: {
          next: "14.0.0",
          kafkajs: "2.0.0",
          "@prisma/client": "5.0.0",
          stripe: "14.0.0",
        },
      }),
    );
    writeFileSync(
      join(root, "prisma", "schema.prisma"),
      `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n`,
    );
    writeFileSync(join(root, "src", "app.ts"), "export {};\n");

    const signals = collectWorkspaceTechSignals(root);
    expect(signals.webTechnologies).toContain("Next.js");
    expect(signals.queueTechnologies).toContain("Kafka");
    expect(signals.dataStoreTechnologies).toContain("PostgreSQL");
    expect(signals.externalSystemNames).toContain("Stripe");
    expect(signals.dataStorePathHints.some((hint) => hint.includes("prisma"))).toBe(true);
  });

  it("marks database containers as data_store and fills technology", () => {
    const root = mkdtempSync(join(tmpdir(), "l2-enrich-"));
    mkdirSync(join(root, "prisma"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: { next: "14.0.0", ioredis: "5.0.0", kafkajs: "2.0.0" },
      }),
    );
    writeFileSync(
      join(root, "prisma", "schema.prisma"),
      `datasource db {\n  provider = "sqlite"\n  url = "file:./dev.db"\n}\n`,
    );

    const baseNode = (partial: Partial<FunctionalNode>): FunctionalNode =>
      ({
        id: "n",
        type: "capability",
        name: "Node",
        status: "active",
        description: "A node",
        summary: "A node",
        responsibility: "Owns something",
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 0.8,
        tags: [],
        ...partial,
      }) as FunctionalNode;

    const enriched = enrichNodesForC4Shapes({
      workspaceRoot: root,
      nodes: [
        baseNode({
          id: "db",
          name: "Primary database",
          description: "Stores application records via Prisma",
          summary: "SQLite persistence",
          level: "container",
          elementType: "container",
          layer: "infrastructure",
        }),
        baseNode({
          id: "web",
          name: "Web app",
          description: "Browser-facing Next.js frontend",
          summary: "Customer UI",
          level: "container",
          elementType: "container",
          layer: "experience",
        }),
        baseNode({
          id: "bus",
          name: "Event bus",
          description: "Async Kafka message queue",
          summary: "Publishes domain events",
          level: "container",
          elementType: "container",
          layer: "infrastructure",
        }),
        baseNode({
          id: "mobile",
          name: "Mobile client",
          description: "React Native mobile app",
          summary: "iOS and Android",
          level: "container",
          elementType: "container",
          layer: "experience",
        }),
        baseNode({
          id: "stripe_ext",
          name: "Stripe",
          description: "External payment SaaS",
          summary: "Third-party billing",
          level: "context",
          elementType: "external_system",
          layer: "infrastructure",
        }),
      ],
    });

    const db = enriched.find((node) => node.id === "db")!;
    expect(db.elementType).toBe("data_store");
    expect(db.technology).toMatch(/SQLite|PostgreSQL|Redis/i);

    const web = enriched.find((node) => node.id === "web")!;
    expect(web.technology).toBe("Next.js");

    const bus = enriched.find((node) => node.id === "bus")!;
    expect(bus.technology).toBe("Kafka");

    const mobile = enriched.find((node) => node.id === "mobile")!;
    expect(mobile.technology).toMatch(/React Native|iOS|Android/i);

    const stripe = enriched.find((node) => node.id === "stripe_ext")!;
    expect(stripe.elementType).toBe("external_system");
  });

  it("prunes empty, unknown, and self-loop edges", () => {
    const edges: FunctionalEdge[] = [
      {
        id: "ok",
        source: "a",
        target: "b",
        relation: "calls",
        confidence: 0.9,
      },
      {
        id: "empty",
        source: "",
        target: "",
        relation: "depends_on",
        confidence: 0.7,
      },
      {
        id: "missing",
        source: "a",
        target: "missing_node",
        relation: "uses",
        confidence: 0.7,
      },
      {
        id: "loop",
        source: "a",
        target: "a",
        relation: "depends_on",
        confidence: 0.7,
      },
    ];
    expect(pruneDanglingEdges(edges, new Set(["a", "b"])).map((edge) => edge.id)).toEqual([
      "ok",
    ]);
  });

  it("regenerate merge drops dangling AI edges", () => {
    const base: ProjectGraph = {
      version: "0.5.0",
      projectId: "p1",
      projectName: "Demo",
      projectType: "node",
      analyzedAt: new Date().toISOString(),
      analysisStatus: "complete",
      architecture: {
        notation: "c4",
        defaultLevel: "component",
        layers: [],
      },
      nodes: [
        {
          id: "a",
          type: "capability",
          name: "A",
          status: "active",
          description: "A",
          summary: "A",
          responsibility: "A",
          level: "container",
          elementType: "container",
          linkedFiles: [],
          upstream: [],
          downstream: [],
          confidence: 0.8,
          tags: [],
        },
        {
          id: "b",
          type: "capability",
          name: "B",
          status: "active",
          description: "B",
          summary: "B",
          responsibility: "B",
          level: "container",
          elementType: "container",
          linkedFiles: [],
          upstream: [],
          downstream: [],
          confidence: 0.8,
          tags: [],
        },
      ],
      edges: [],
      fileIndex: [],
      topology: { rootIds: ["a", "b"], maxDepth: 1, totalNodes: 2 },
      analysisError: null,
    };
    const incoming: ProjectGraph = {
      ...base,
      edges: [
        {
          id: "edge_ok",
          source: "a",
          target: "b",
          relation: "calls",
          confidence: 0.9,
        },
        {
          id: "edge_api_engine",
          source: "",
          target: "",
          relation: "depends_on",
          label: " → ",
          confidence: 0.7,
          evidence: "Inferred from repository structure",
        },
      ],
    };
    const merged = mergeStructureGraphs({
      base,
      incoming,
      mode: "regenerate",
    });
    expect(merged.edges.map((edge) => edge.id)).toEqual(["edge_ok"]);
  });

  it("does not invent new elementType values beyond the schema enum", () => {
    const root = mkdtempSync(join(tmpdir(), "l2-enum-"));
    writeFileSync(join(root, "package.json"), '{"dependencies":{"pg":"8.0.0"}}\n');
    const [node] = enrichNodesForC4Shapes({
      workspaceRoot: root,
      nodes: [
        {
          id: "db",
          type: "capability",
          name: "Postgres",
          status: "active",
          description: "PostgreSQL database",
          summary: "Primary DB",
          responsibility: "Persists data",
          level: "container",
          elementType: "container",
          linkedFiles: [],
          upstream: [],
          downstream: [],
          confidence: 0.7,
          tags: [],
        },
      ],
    });
    expect(["data_store", "container", "external_system", "software_system", "person", "component", "code_element"]).toContain(
      node!.elementType,
    );
  });
});
