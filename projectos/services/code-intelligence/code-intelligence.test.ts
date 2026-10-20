import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { hashFileContent } from "../code-file-understanding-service.js";
import { writeCodeFileUnderstandingDocument } from "../code-file-understanding-store.js";
import {
  codeImpact,
  lookupSymbols,
  nodeIdsByPathFromFileIndex,
  readCodeFileUnderstandingState,
  refreshStaleCodeFileUnderstandings,
  symbolsInFile,
  syncCodeIntelligence,
} from "./index.js";

const PROJECT_ID = "project_code_intelligence";

describe("code intelligence", () => {
  it("keeps an incremental inventory and marks descriptions stale when the hash drifts", () => {
    const root = workspace({
      "src/kept.ts": "export const kept = 1;\n",
      "src/edited.ts": "export const edited = 1;\n",
      "src/note.py": "def note():\n    return 1\n",
      "keys/cert.pem": "-----BEGIN PRIVATE KEY-----\nsecret\n",
      "src/token.ts": "export const token = \"sk-abcdefghijklmnopqrstuvwxyz\";\n",
      "node_modules/pkg/index.js": "export const hidden = 1;\n",
      "dist/out.js": "export const built = 1;\n",
    });
    const first = syncCodeIntelligence({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      scannedAt: "2026-10-20T00:00:00.000Z",
    });
    const kept = first.inventory.files.find((file) => file.path === "src/kept.ts");
    const edited = first.inventory.files.find((file) => file.path === "src/edited.ts");
    expect(kept?.contentHash).toBeTruthy();
    expect(first.inventory.files.map((file) => file.path)).toEqual([
      "src/edited.ts",
      "src/kept.ts",
      "src/note.py",
    ]);
    expect(first.inventory.files.find((file) => file.path === "src/note.py")?.language).toBe(
      "unsupported",
    );
    expect(first.inventory.omissions.map((item) => item.reason).sort()).toEqual([
      "secret",
      "secret",
    ]);
    const inventoryText = readFileSync(
      join(root, ".projectos/code-intelligence/inventory.json"),
      "utf8",
    );
    expect(inventoryText).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(inventoryText).not.toContain("BEGIN PRIVATE KEY");
    expect(inventoryText).not.toContain("\"symbols\"");
    expect(first.symbols.files.map((file) => file.path)).not.toContain("src/note.py");

    const poisonedHash = "0".repeat(24);
    const poisoned = {
      ...first,
      inventory: {
        ...first.inventory,
        files: first.inventory.files.map((file) => file.path === "src/kept.ts"
          ? { ...file, contentHash: poisonedHash }
          : file),
      },
      symbols: {
        ...first.symbols,
        files: first.symbols.files.map((file) => file.path === "src/kept.ts"
          ? {
              ...file,
              contentHash: poisonedHash,
              symbols: file.symbols.map((symbol) => ({ ...symbol, contentHash: poisonedHash })),
            }
          : file),
      },
    };
    writeFileSync(
      join(root, ".projectos/code-intelligence/inventory.json"),
      `${JSON.stringify(poisoned.inventory, null, 2)}\n`,
    );
    writeFileSync(
      join(root, ".projectos/code-intelligence/symbols.json"),
      `${JSON.stringify(poisoned.symbols, null, 2)}\n`,
    );
    writeFileSync(join(root, "src/edited.ts"), "export const edited = 2;\n");
    const second = syncCodeIntelligence({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      scannedAt: "2026-10-20T00:01:00.000Z",
    });
    expect(second.inventory.files.find((file) => file.path === "src/kept.ts")?.contentHash).toBe(
      poisonedHash,
    );
    expect(second.inventory.files.find((file) => file.path === "src/edited.ts")?.contentHash)
      .not.toBe(edited?.contentHash);

    unlinkSync(join(root, "src/note.py"));
    const third = syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    expect(third.inventory.files.map((file) => file.path)).not.toContain("src/note.py");

    const current = "export const documented = 1;\n";
    writeFileSync(join(root, "src/documented.ts"), current);
    const currentHash = hashFileContent(current);
    writeCodeFileUnderstandingDocument(root, {
      version: "0.1.0",
      projectId: PROJECT_ID,
      entries: [
        {
          path: "src/documented.ts",
          description: "Owns the documented constant for the sample.",
          role: "Holds one exported constant.",
          contentHash: currentHash,
          updatedAt: "2026-10-20T00:00:00.000Z",
          source: "llm",
        },
        {
          path: "src/edited.ts",
          description: "Describes an older revision of the edited file.",
          role: "Owns the previous edited constant.",
          contentHash: "a".repeat(24),
          updatedAt: "2026-10-20T00:00:00.000Z",
          source: "llm",
        },
      ],
    });
    expect(readCodeFileUnderstandingState({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/documented.ts",
      currentContentHash: currentHash,
    }).context?.description).toContain("documented constant");
    const stale = readCodeFileUnderstandingState({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/edited.ts",
      currentContentHash: hashFileContent("export const edited = 2;\n"),
    });
    expect(stale.stale).toBe(true);
    expect(stale.entry?.description).toContain("older revision");
    expect(stale.context).toBeNull();
  });

  it("answers where an export is defined without granting write paths", () => {
    const root = workspace({
      "src/greet.ts": "export function greet() { return 1 }\n",
      "src/other.ts": "export function greet() { return 2 }\nfunction hidden() { return 0 }\n",
      "src/kinds.ts": [
        "export class Box {}",
        "export type Id = string",
        "export interface Pet {}",
        "export enum Color { Red }",
        "export const LIMIT = 1",
        "const localOnly = 2",
        "export { localOnly as PublicLimit }",
        "export { missing } from \"./nope\"",
        "",
      ].join("\n"),
      "src/broken.ts": "export function (\n",
      "src/view.tsx": "export function Card() { return null }\n",
      "readme.md": "# notes\n",
    });
    const nodeIds = nodeIdsByPathFromFileIndex([
      { path: "src/greet.ts", nodeIds: ["node_greet"] },
    ]);
    const found = lookupSymbols({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      name: "greet",
      nodeIdsByPath: nodeIds,
    });
    expect(found).not.toHaveProperty("allowedWritePaths");
    expect(found.symbols.map((symbol) => ({
      path: symbol.path,
      startLine: symbol.startLine,
      nodeIds: symbol.nodeIds,
    }))).toEqual([
      { path: "src/greet.ts", startLine: 1, nodeIds: ["node_greet"] },
      { path: "src/other.ts", startLine: 1, nodeIds: [] },
    ]);
    expect(found.symbols.every((symbol) => symbol.exported && symbol.contentHash.length === 24)).toBe(
      true,
    );
    expect(lookupSymbols({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      name: "hidden",
    }).symbols).toEqual([]);
    expect(lookupSymbols({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      name: "greet",
      pathPrefix: "src/other.ts",
    }).symbols.map((symbol) => symbol.path)).toEqual(["src/other.ts"]);

    const kinds = symbolsInFile({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/kinds.ts",
    });
    expect(kinds.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`)).toEqual([
      "class:Box",
      "type:Id",
      "interface:Pet",
      "enum:Color",
      "const:LIMIT",
      "const:PublicLimit",
    ]);
    expect(kinds.omissions.map((item) => item.reason)).toContain("unresolved_export");
    expect(kinds.symbols.map((symbol) => symbol.name)).not.toContain("missing");
    expect(kinds.symbols.map((symbol) => symbol.name)).not.toContain("localOnly");

    const broken = symbolsInFile({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/broken.ts",
    });
    expect(broken.symbols).toEqual([]);
    expect(broken.omissions).toEqual([{ path: "src/broken.ts", reason: "parse_failed" }]);
    expect(symbolsInFile({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "readme.md",
    }).omissions).toEqual([{ path: "readme.md", reason: "unsupported_language" }]);
    expect(symbolsInFile({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/view.tsx",
    }).symbols[0]?.name).toBe("Card");

    const indexed = syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    const staleFile = indexed.symbols.files.find((file) => file.path === "src/greet.ts");
    const staleHash = staleFile?.contentHash;
    writeFileSync(join(root, "src/greet.ts"), "\nexport function greet() { return 1 }\n");
    const movedIndex = syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    writeFileSync(
      join(root, ".projectos/code-intelligence/inventory.json"),
      `${JSON.stringify({
        ...movedIndex.inventory,
        files: movedIndex.inventory.files.map((file) => file.path === "src/greet.ts"
          ? { ...file, contentHash: staleHash }
          : file),
      }, null, 2)}\n`,
    );
    writeFileSync(
      join(root, ".projectos/code-intelligence/symbols.json"),
      `${JSON.stringify({
        ...movedIndex.symbols,
        files: movedIndex.symbols.files.map((file) => file.path === "src/greet.ts" && staleFile
          ? staleFile
          : file),
      }, null, 2)}\n`,
    );
    const lagged = syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    expect(lagged.symbols.files.find((file) => file.path === "src/greet.ts")?.symbols[0]?.startLine)
      .toBe(1);
    expect(lagged.symbols.files.find((file) => file.path === "src/greet.ts")?.contentHash).toBe(
      staleHash,
    );
    const refreshed = lookupSymbols({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      name: "greet",
      pathPrefix: "src/greet.ts",
    });
    expect(refreshed.symbols).toHaveLength(1);
    expect(refreshed.symbols[0]?.startLine).toBe(2);
    expect(refreshed.symbols[0]?.contentHash).not.toBe(staleHash);
  });

  it("lists import impact and direct symbol references without copying the structure graph", () => {
    const root = workspace({
      "src/target.ts": "export function greet() { return 1 }\n",
      "src/mid.ts": "export { greet } from \"./target\"\n",
      "src/far.ts": "import { greet } from \"./mid\"\n",
      "src/also.ts": "import { greet as hello } from \"./target\"\n",
      "src/dyn.ts": "export const loaded = import(\"./target\")\n",
      "src/plain.ts": "export const untouched = 1\n",
      "src/target.test.ts": "import { greet } from \"./target\"\n",
      "src/other.test.ts": "export const unrelated = 1\n",
    });
    const impact = codeImpact({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/target.ts",
      symbolName: "greet",
      nodeIdsByPath: nodeIdsByPathFromFileIndex([
        { path: "src/target.ts", nodeIds: ["node_target"] },
        { path: "src/plain.ts", nodeIds: ["node_plain"] },
        { path: "src/also.ts", nodeIds: ["node_also"] },
      ]),
    });
    expect(impact).not.toHaveProperty("allowedWritePaths");
    expect(impact).not.toHaveProperty("structureGraph");
    expect(impact.files.onGraph.map((file) => file.path)).toEqual(["src/also.ts"]);
    expect(impact.files.unlinked.map((file) => ({ path: file.path, distance: file.distance }))).toEqual([
      { path: "src/dyn.ts", distance: 1 },
      { path: "src/mid.ts", distance: 1 },
      { path: "src/target.test.ts", distance: 1 },
      { path: "src/far.ts", distance: 2 },
    ]);
    expect(impact.files.onGraph.concat(impact.files.unlinked).map((file) => file.path)).not.toContain(
      "src/plain.ts",
    );
    expect(impact.symbols?.references.onGraph.map((file) => file.path)).toEqual(["src/also.ts"]);
    expect(impact.symbols?.references.unlinked.map((file) => file.path).sort()).toEqual([
      "src/mid.ts",
      "src/target.test.ts",
    ]);
    expect(impact.omissions).toEqual([{ path: "src/dyn.ts", reason: "unresolved_import" }]);
    expect(impact.tests.map((file) => file.path)).toEqual(["src/target.test.ts"]);
  });

  it("refreshes a bounded batch of stale descriptions and keeps the old text when the model fails", async () => {
    const root = workspace({
      "src/lib.ts": "export const value = 1\n",
      "src/use.ts": "import { value } from \"./lib\"\n",
      "src/other.ts": "export const other = 1\n",
    });
    syncCodeIntelligence({ workspaceRoot: root, projectId: PROJECT_ID });
    const lib = readFileSync(join(root, "src/lib.ts"), "utf8");
    const other = readFileSync(join(root, "src/other.ts"), "utf8");
    writeCodeFileUnderstandingDocument(root, {
      version: "0.1.0",
      projectId: PROJECT_ID,
      entries: [
        {
          path: "src/lib.ts",
          description: "Describes the previous library revision for callers.",
          role: "Owns the previous exported value.",
          contentHash: "b".repeat(24),
          updatedAt: "2026-10-20T00:00:00.000Z",
          source: "llm",
        },
        {
          path: "src/other.ts",
          description: "Describes the previous other file for the map.",
          role: "Owns the previous other constant.",
          contentHash: "c".repeat(24),
          updatedAt: "2026-10-20T00:00:00.000Z",
          source: "llm",
        },
      ],
    });
    const calls: string[][] = [];
    const failed = await refreshStaleCodeFileUnderstandings({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      fileLimit: 1,
      profile: {
        id: "profile",
        name: "Test",
        provider: "openai",
        model: "test",
        apiKeyRef: "key",
      },
      responseLanguage: { tag: "en", source: "undetermined", expectedScripts: ["latin"] },
      generator: {
        async generateWithModel(modelInput) {
          calls.push(modelInput.usedBy);
          if (modelInput.path === "src/lib.ts") {
            throw new Error("unusable json");
          }
          return {
            path: modelInput.path,
            description: "Owns the current other constant in this sample.",
            role: "Holds the exported other constant.",
            contentHash: modelInput.contentHash,
            updatedAt: "2026-10-20T00:02:00.000Z",
            source: "llm",
          };
        },
      },
    });
    expect(failed.refreshed).toEqual([]);
    expect(failed.keptStale).toEqual(["src/lib.ts"]);
    expect(failed.deferred).toEqual(["src/other.ts"]);
    expect(calls).toEqual([["src/use.ts"]]);
    expect(readCodeFileUnderstandingState({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/lib.ts",
      currentContentHash: hashFileContent(lib),
    }).context).toBeNull();

    const refreshed = await refreshStaleCodeFileUnderstandings({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      fileLimit: 1,
      profile: {
        id: "profile",
        name: "Test",
        provider: "openai",
        model: "test",
        apiKeyRef: "key",
      },
      responseLanguage: { tag: "en", source: "undetermined", expectedScripts: ["latin"] },
      generator: {
        async generateWithModel(modelInput) {
          return {
            path: modelInput.path,
            description: "Owns the current library constant in this sample.",
            role: "Holds the exported library value.",
            contentHash: modelInput.contentHash,
            updatedAt: "2026-10-20T00:02:00.000Z",
            source: "llm",
          };
        },
      },
    });
    expect(refreshed.refreshed).toEqual(["src/lib.ts"]);
    expect(refreshed.deferred).toEqual(["src/other.ts"]);
    const state = readCodeFileUnderstandingState({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/lib.ts",
      currentContentHash: hashFileContent(lib),
    });
    expect(state.stale).toBe(false);
    expect(state.context?.description).toContain("current library constant");
    expect(state.entry?.contentHash).toBe(hashFileContent(lib));
    expect(readCodeFileUnderstandingState({
      workspaceRoot: root,
      projectId: PROJECT_ID,
      path: "src/other.ts",
      currentContentHash: hashFileContent(other),
    }).context).toBeNull();
  });
});

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "projectos-code-intelligence-"));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, content);
  }
  return root;
}
