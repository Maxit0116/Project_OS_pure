import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessL2GraphQuality,
  assignFilesToComponents,
  buildFileIndexAndRelations,
  collectRepoFiles,
  collectWorkspaceTechSignals,
  componentBudget,
  countSourceFiles,
  filesPerComponentCap,
  listRepoFiles,
  parsePythonAbsoluteImports,
  sampleRepoFiles,
  summarizeRepoDirectories,
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
  resolveCSharpReferences,
  uniqueEdgeIds,
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

  describe("a repository larger than the prompt", () => {
    // Observed on excalidraw (1,328 files): the scan took the first 400 files in directory order, so
    // the model saw docs and examples and the code under packages/ was left out of the map.
    const tree = (): string[] => [
      "README.md",
      "package.json",
      ...Array.from({ length: 120 }, (_, index) => `dev-docs/page-${index}.md`),
      ...Array.from({ length: 120 }, (_, index) => `examples/demo-${index % 6}/file-${index}.ts`),
      ...Array.from({ length: 200 }, (_, index) => `packages/core/src/module-${index}.ts`),
      ...Array.from({ length: 200 }, (_, index) => `packages/ui/src/view-${index}.tsx`),
    ];

    it("samples every part of the tree instead of the first directories", () => {
      const sample = sampleRepoFiles(tree(), 60);
      expect(sample.length).toBe(60);
      for (const prefix of ["dev-docs/", "examples/", "packages/core/", "packages/ui/"]) {
        expect(sample.some((file) => file.startsWith(prefix))).toBe(true);
      }
      expect(sample).toContain("README.md");
      expect(sample).toContain("package.json");
      expect(sample.filter((file) => file.startsWith("dev-docs/")).length).toBeLessThan(15);
    });

    it("prefers source files to documents inside a directory, and is deterministic", () => {
      const files = [
        ...Array.from({ length: 30 }, (_, index) => `lib/notes-${index}.md`),
        "lib/engine.py",
        ...Array.from({ length: 30 }, (_, index) => `other/readme-${index}.md`),
      ];
      expect(sampleRepoFiles(files, 4)).toContain("lib/engine.py");
      expect(sampleRepoFiles(files, 10)).toEqual(sampleRepoFiles([...files].reverse(), 10));
    });

    it("returns everything when it already fits", () => {
      expect(sampleRepoFiles(["a/x.ts", "b/y.ts"], 5)).toEqual(["a/x.ts", "b/y.ts"]);
    });

    it("inventories the whole tree, past the first 400 files, in name order", () => {
      const root = mkdtempSync(join(tmpdir(), "l2-inventory-"));
      for (const dir of ["aaa", "bbb", "zzz"]) {
        mkdirSync(join(root, dir), { recursive: true });
        for (let index = 0; index < 200; index += 1) {
          writeFileSync(join(root, dir, `f${String(index).padStart(3, "0")}.ts`), "export {};\n");
        }
      }
      const all = listRepoFiles(root);
      expect(all.length).toBe(600);
      expect(all[0]).toBe("aaa/f000.ts");
      expect(all.at(-1)).toBe("zzz/f199.ts");
      // The sample used for the prompt still reaches the last directory.
      expect(collectRepoFiles(root, 100).some((file) => file.startsWith("zzz/"))).toBe(true);
    });

    it("summarises where the files are", () => {
      const summary = summarizeRepoDirectories(tree(), 10);
      expect(summary).toContain("packages/core/src/ (200 files)");
      expect(summary).toContain("packages/ (400 files)");
    });
  });

  describe("how many components a map should have", () => {
    it("grows with the code, never asking a small project for more components than it has files", () => {
      expect(componentBudget(3)).toEqual({ min: 2, max: 3 });
      expect(componentBudget(0)).toEqual({ min: 1, max: 1 });
      expect(componentBudget(7)).toEqual({ min: 3, max: 6 });
      expect(componentBudget(50).max).toBeLessThanOrEqual(16);
      expect(componentBudget(400).max).toBeGreaterThan(componentBudget(150).max);
      for (const files of [3, 7, 20, 60]) expect(componentBudget(files).max).toBeLessThanOrEqual(files);
    });

    it("lets a component of a large repository hold more than 12 files", () => {
      expect(filesPerComponentCap(20, 5)).toBe(12);
      expect(filesPerComponentCap(700, 11)).toBeGreaterThan(100);
      expect(filesPerComponentCap(100000, 2)).toBe(2_048);
      // gitea: 3,480 source files in 25 components fit (the old cap of 120 held 3,000).
      expect(filesPerComponentCap(3_480, 25) * 25).toBeGreaterThanOrEqual(3_480);
    });

    it("does not reject a small project because its components cannot each own a pair of files", () => {
      // more-itertools: 7 source files, 11 components, 2 of them with two files.
      const component = (index: number, files: number) => ({
        id: `c${index}`,
        level: "component",
        name: `Capability ${index}`,
        linkedFiles: Array.from({ length: files }, (_, n) => ({ path: `m/f${index}_${n}.py`, role: "primary" })),
      });
      const graph = {
        nodes: [
          { id: "s", level: "context", elementType: "software_system", name: "Library", linkedFiles: [] },
          { id: "k", level: "container", name: "Core library", linkedFiles: [] },
          ...Array.from({ length: 11 }, (_, index) => component(index, index < 2 ? 2 : 1)),
        ],
        fileIndex: Array.from({ length: 13 }, (_, n) => ({ path: `m/x${n}.py`, nodeIds: ["c0"], imports: ["m/x0.py"], exports: [] })),
        fileRelations: [],
        edges: [],
      } as unknown as ProjectGraph;
      const result = assessL2GraphQuality(graph, { sourceFileCount: 7, language: "en" });
      expect(result.reasons.filter((reason) => reason.startsWith("thin_file_mounts"))).toEqual([]);
    });

    it("still rejects a larger project whose components hold one file each", () => {
      const graph = {
        nodes: [
          { id: "s", level: "context", elementType: "software_system", name: "App", linkedFiles: [] },
          { id: "k", level: "container", name: "Core", linkedFiles: [] },
          ...Array.from({ length: 8 }, (_, index) => ({ id: `c${index}`, level: "component", name: `Part ${index}`, linkedFiles: [{ path: `a/${index}.ts`, role: "primary" }] })),
        ],
        fileIndex: Array.from({ length: 8 }, (_, n) => ({ path: `a/${n}.ts`, nodeIds: [`c${n}`], imports: ["a/0.ts"], exports: [] })),
        fileRelations: [],
        edges: [],
      } as unknown as ProjectGraph;
      const result = assessL2GraphQuality(graph, { sourceFileCount: 40, language: "en" });
      expect(result.reasons.some((reason) => reason.startsWith("thin_file_mounts"))).toBe(true);
    });
  });

  describe("languages beyond TypeScript", () => {
    it("counts C, C++, C#, Ruby and PHP files as source", () => {
      expect(countSourceFiles(["a.c", "b.h", "c.cpp", "d.cs", "e.rb", "f.php", "g.md"])).toBe(6);
    });

    it("reads Python's absolute imports, which is how a Python project imports its own modules", () => {
      const source = [
        "from app.core.config import settings",
        "from app.models import User, Item as It",
        "from app import crud",
        "import app.utils",
        "from typing import (",
        "    List,",
        "    Optional,",
        ")",
        "    from not_at_line_start import x",
      ].join("\n");
      const specs = parsePythonAbsoluteImports(source);
      expect(specs).toEqual(
        expect.arrayContaining(["app.core.config", "app.models", "app.models.User", "app.models.Item", "app", "app.crud", "app.utils"]),
      );
      expect(parsePythonAbsoluteImports("from .local import x\n")).toEqual([]);
    });

    it("puts them in the file index, so a Python project has file dependencies at all", () => {
      // fastapi/full-stack-fastapi-template: 43 Python files and none of them had a resolved import.
      const root = mkdtempSync(join(tmpdir(), "l2-python-"));
      mkdirSync(join(root, "backend", "app", "api"), { recursive: true });
      mkdirSync(join(root, "backend", "app", "core"), { recursive: true });
      writeFileSync(join(root, "backend", "app", "core", "config.py"), "settings = 1\n");
      writeFileSync(join(root, "backend", "app", "crud.py"), "from app.core.config import settings\n");
      writeFileSync(join(root, "backend", "app", "api", "main.py"), "from app import crud\nfrom app.core.config import settings\n");
      const paths = ["backend/app/core/config.py", "backend/app/crud.py", "backend/app/api/main.py"];

      const { fileIndex, fileRelations } = buildFileIndexAndRelations({
        workspaceRoot: root,
        assignments: new Map([["component_backend", paths]]),
      });

      const main = fileIndex.find((entry) => entry.path === "backend/app/api/main.py")!;
      expect(main.imports).toEqual(expect.arrayContaining(["backend/app/crud.py", "backend/app/core/config.py"]));
      expect(fileRelations.some((relation) => relation.sourcePath === "backend/app/crud.py" && relation.targetPath === "backend/app/core/config.py")).toBe(true);
    });

    it("resolves them onto project files, modules and packages alike", () => {
      const files = new Set([
        "backend/app/core/config.py",
        "backend/app/models/__init__.py",
        "backend/app/models/user.py",
        "backend/app/crud.py",
      ]);
      const resolve = (spec: string) => resolveImportPath("backend/app/api/main.py", spec, files);
      expect(resolve("app.core.config")).toBe("backend/app/core/config.py");
      expect(resolve("app.models")).toBe("backend/app/models/__init__.py");
      expect(resolve("app.models.user")).toBe("backend/app/models/user.py");
      expect(resolve("app.crud")).toBe("backend/app/crud.py");
      expect(resolve("fastapi.testclient")).toBeNull();
    });
  });
});

describe("second round of repositories", () => {
  it("keeps one edge per id: an exact repeat is dropped, a different edge under a used id is renamed", () => {
    // ripgrep: the model named two different edges e_search_walker and the map could not be saved.
    const edge = (id: string, source: string, target: string) =>
      ({ id, source, target, relation: "depends_on", label: "uses", confidence: 0.8, evidence: "model" }) as unknown as FunctionalEdge;
    const result = uniqueEdgeIds([
      edge("e_search_walker", "search", "walker"),
      edge("e_search_walker", "search", "walker"),
      edge("e_search_walker", "search", "printer"),
      edge("e_search_walker_2", "cli", "search"),
    ]);
    expect(result.map((item) => `${item.id}:${item.source}->${item.target}`)).toEqual([
      "e_search_walker:search->walker",
      "e_search_walker_2:search->printer",
      "e_search_walker_2_2:cli->search",
    ]);
  });

  it("links C# files through the types they use in the namespaces they can see", () => {
    // eShopOnWeb: `using` names a namespace, so no C# file had an import and the map was refused.
    const bodies = new Map<string, string>([
      ["src/Core/Entities/Basket.cs", "namespace Shop.Core.Entities;\npublic class Basket { public List<BasketItem> Items { get; } }\n"],
      ["src/Core/Entities/BasketItem.cs", "namespace Shop.Core.Entities;\npublic class BasketItem {}\n"],
      ["src/Core/Interfaces/IBasketService.cs", "namespace Shop.Core.Interfaces;\nusing Shop.Core.Entities;\npublic interface IBasketService { Basket Get(); }\n"],
      ["src/Web/Services/BasketViewModelService.cs", "using Shop.Core.Interfaces;\nnamespace Shop.Web.Services\n{\n    public class BasketViewModelService { private readonly IBasketService _service; Basket b; }\n}\n"],
      ["src/Web/GlobalUsings.cs", "global using Shop.Core.Entities;\n"],
      ["src/Other/Basket.cs", "namespace Other.Things;\npublic class Basket {}\n"],
    ]);
    const references = resolveCSharpReferences(bodies);
    expect(references.get("src/Core/Entities/Basket.cs")).toEqual(["src/Core/Entities/BasketItem.cs"]);
    expect(references.get("src/Core/Interfaces/IBasketService.cs")).toEqual(["src/Core/Entities/Basket.cs"]);
    // Basket comes through the global using; Other.Things.Basket is not visible.
    expect(references.get("src/Web/Services/BasketViewModelService.cs")).toEqual([
      "src/Core/Entities/Basket.cs",
      "src/Core/Interfaces/IBasketService.cs",
    ]);
  });
});
