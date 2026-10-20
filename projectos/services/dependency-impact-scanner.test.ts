import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  DependencyImpactError,
  DependencyImpactScanner,
} from "./dependency-impact-scanner.js";

describe("DependencyImpactScanner", () => {
  it("derives direct importers and the reverse transitive closure from disk", () => {
    const root = workspace({
      "src/target.ts": "export const target = 1;",
      "src/direct.ts": "import { target } from './target'; export { target };",
      "src/transitive.ts": "export { target } from './direct';",
      "src/unrelated.ts": "export const unrelated = true;",
    });

    const result = new DependencyImpactScanner().scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    });

    expect(result.directImporters).toEqual(["src/direct.ts"]);
    expect(result.reverseTransitiveClosure).toEqual(["src/direct.ts", "src/transitive.ts"]);
    expect(new DependencyImpactScanner().relations({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    }).closure).toEqual([
      { path: "src/direct.ts", distance: 1 },
      { path: "src/transitive.ts", distance: 2 },
    ]);
    expect(result.scannedFiles).toEqual([
      "src/direct.ts", "src/target.ts", "src/transitive.ts", "src/unrelated.ts",
    ]);
  });

  it("resolves configured aliases and recognizes static, dynamic, and require forms", () => {
    const root = workspace({
      "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
      "src/target.ts": "export const target = 1;",
      "src/a.ts": "import target from '@/target';",
      "src/b.ts": "const target = require('@/target');",
      "src/c.ts": "const target = import('@/target');",
      "src/d.ts": "export { target } from '@/target';",
      "src/e.ts": "export { target } from './target.js';",
    });

    expect(new DependencyImpactScanner().scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    }).directImporters).toEqual([
      "src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts",
    ]);
  });

  it("resolves local baseUrl modules without treating external packages as unresolved", () => {
    const root = workspace({
      "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: "." } }),
      "src/target.ts": "export const target = 1;",
      "src/importer.ts": "import React from 'react'; import { target } from 'src/target';",
    });
    expect(new DependencyImpactScanner().scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    }).directImporters).toEqual(["src/importer.ts"]);
  });

  it("does not treat comments, strings, template text, or import.meta as dependencies", () => {
    const root = workspace({
      "src/target.ts": "export const target = 1;",
      "src/noise.ts": [
        "// import './target'",
        "/* require('./target') */",
        "const one = \"import './target'\";",
        "const two = `require('./target')`;",
        "const meta = import.meta.url;",
      ].join("\n"),
    });
    expect(new DependencyImpactScanner().scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    }).directImporters).toEqual([]);
  });

  it("keeps imports after quote-bearing regular-expression literals", () => {
    const root = workspace({
      "src/target.ts": "export const target = 1;",
      "src/normal.ts": [
        "const ratio = Math.round(8) / 2;",
        "import { target } from './target';",
      ].join("\n"),
      "src/regex-double.ts": [
        String.raw`const quote = /[\"]/;`,
        "import { target } from './target';",
      ].join("\n"),
      "src/regex-single.ts": [
        "const mixedQuote = /'/;",
        'import { target } from "./target";',
      ].join("\n"),
    });

    expect(new DependencyImpactScanner().scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    }).directImporters).toEqual([
      "src/normal.ts",
      "src/regex-double.ts",
      "src/regex-single.ts",
    ]);
  });

  it("ignores import-looking strings inside nested template expressions", () => {
    const root = workspace({
      "src/target.ts": "export const target = 1;",
      "src/noise.ts": [
        "const apparentImport = `outer ${\"import './target'\"} tail`;",
        "const nested = `outer ${`inner ${\"require('./target')\"}`} tail`;",
        "export { apparentImport, nested };",
      ].join("\n"),
      "src/template-importer.ts":
        "export const loaded = `module ${import('./target')}`;",
    });

    expect(new DependencyImpactScanner().scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    }).directImporters).toEqual(["src/template-importer.ts"]);
  });

  it("keeps JSX text opaque while scanning JavaScript inside JSX expressions", () => {
    const root = workspace({
      "src/target.ts": "export const target = 1;",
      "src/noise.tsx": [
        "export const Noise = () => (",
        "  <div title=\"import './target'\">",
        "    /month import './target'",
        "    <span>{\"require('./target')\"}</span>",
        "  </div>",
        ");",
      ].join("\n"),
      "src/jsx-importer.tsx":
        "export const Importer = () => <button onClick={() => import('./target')}>Load</button>;",
    });

    expect(new DependencyImpactScanner().scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
    }).directImporters).toEqual(["src/jsx-importer.tsx"]);
  });

  it("supports a materialized repair view without mutating disk", () => {
    const root = workspace({
      "src/target.ts": "export const target = 1;",
      "src/direct.ts": "import { target } from './target'; export { target };",
    });
    const scanner = new DependencyImpactScanner();
    expect(scanner.scan({ workspaceRoot: root, targetPath: "src/target.ts" }).directImporters)
      .toEqual(["src/direct.ts"]);
    expect(scanner.scan({
      workspaceRoot: root,
      targetPath: "src/target.ts",
      contentOverrides: {
        "src/target.ts": null,
        "src/direct.ts": "export const repaired = true;",
      },
    }).directImporters).toEqual([]);
  });

  it("fails closed for unsupported targets, unresolved local modules, and config inheritance", () => {
    const unsupported = workspace({ "src/styles.css": ".root {}" });
    expectScanError(unsupported, "src/styles.css", "impact_scan_unavailable");

    const unresolved = workspace({
      "src/target.ts": "export const target = 1;",
      "src/broken.ts": "import './missing';",
    });
    expectScanError(unresolved, "src/target.ts", "unresolved_local_specifier");

    const inherited = workspace({
      "tsconfig.json": JSON.stringify({ extends: "./base.json" }),
      "src/target.ts": "export const target = 1;",
    });
    expectScanError(inherited, "src/target.ts", "impact_scan_unavailable");

    const dynamic = workspace({
      "src/target.ts": "export const target = 1;",
      "src/dynamic.ts": "const moduleName = './target'; void import(moduleName);",
    });
    expectScanError(dynamic, "src/target.ts", "impact_scan_unavailable");

    const malformedRegex = workspace({
      "src/target.ts": "export const target = 1;",
      "src/broken.ts": "const pattern = /unterminated;\nimport './target';",
    });
    expectScanError(malformedRegex, "src/target.ts", "impact_scan_unavailable");
  });

  it("excludes generated/dependency directories and rejects traversal or symlink targets", () => {
    const root = workspace({
      "src/target.ts": "export const target = 1;",
      "node_modules/importer.ts": "import '../src/target';",
      ".next/importer.ts": "import '../src/target';",
    });
    const result = new DependencyImpactScanner().scan({ workspaceRoot: root, targetPath: "src/target.ts" });
    expect(result.directImporters).toEqual([]);
    expect(result.scannedFiles).toEqual(["src/target.ts"]);
    expectScanError(root, "../outside.ts", "invalid_target");

    symlinkSync(join(root, "src", "target.ts"), join(root, "src", "linked.ts"));
    expectScanError(root, "src/linked.ts", "invalid_target");
  });
});

function expectScanError(root: string, targetPath: string, code: DependencyImpactError["code"]): void {
  try {
    new DependencyImpactScanner().scan({ workspaceRoot: root, targetPath });
    throw new Error("Expected dependency scan to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(DependencyImpactError);
    expect(error).toMatchObject({ code });
  }
}

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "projectos-impact-"));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
  return root;
}
