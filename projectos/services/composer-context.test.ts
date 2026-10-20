import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveAttachments } from "./attachment-resolver.js";
import { searchComposerFilePaths } from "./composer-path-search.js";

describe("CTX-4 pins", () => {
  it("returns a stale selection omission instead of the client text", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-selection-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const live = 1;\n", "utf8");
    const [resolved] = await resolveAttachments(
      [{
        id: "pin",
        label: "selection",
        ref: {
          kind: "selection",
          path: "src/app.ts",
          startLine: 1,
          endLine: 1,
          contentHash: "sha256:" + "ab".repeat(32),
        },
      }],
      {
        workspaceRoot: root,
        projectId: "p",
        readFile: async () => "export const live = 1;\n",
        getNodeContext: async () => {
          throw new Error("unused");
        },
      },
    );
    expect(resolved?.omissionReason).toBe("stale_selection");
    expect(resolved?.markdown ?? "").not.toContain("live");
  });

  it("keeps an unsaved selection when the slice hash matches", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-buffer-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const disk = 1;\n", "utf8");
    const text = "export const buffer = 1;";
    const sliceHash = `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
    const [resolved] = await resolveAttachments(
      [{
        id: "pin",
        label: "selection",
        ref: {
          kind: "selection",
          path: "src/app.ts",
          startLine: 1,
          endLine: 1,
          contentHash: "sha256:" + "ab".repeat(32),
          sliceHash,
          text,
        },
      }],
      {
        workspaceRoot: root,
        projectId: "p",
        readFile: async () => "export const disk = 1;\n",
        getNodeContext: async () => {
          throw new Error("unused");
        },
      },
    );
    expect(resolved?.omissionReason).toBe("editor_buffer");
    expect(resolved?.markdown).toContain("editor buffer");
    expect(resolved?.markdown).toContain(text);
  });

  it("drops a selection whose slice hash does not match the text", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-forged-"));
    const text = "forged selection";
    const [resolved] = await resolveAttachments(
      [{
        id: "pin",
        label: "selection",
        ref: {
          kind: "selection",
          path: "src/app.ts",
          startLine: 1,
          endLine: 1,
          contentHash: "sha256:" + "ab".repeat(32),
          sliceHash: "sha256:" + "cd".repeat(32),
          text,
        },
      }],
      {
        workspaceRoot: root,
        projectId: "p",
        readFile: async () => "export const disk = 1;\n",
        getNodeContext: async () => {
          throw new Error("unused");
        },
      },
    );
    expect(resolved?.omissionReason).toBe("stale_selection");
    expect(resolved?.markdown ?? "").not.toContain(text);
  });

  it("includes a text excerpt for a pinned folder and skips binaries", async () => {
    const root = mkdtempSync(join(tmpdir(), "pos-folder-"));
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "notes", "a.txt"), "alpha excerpt", "utf8");
    writeFileSync(join(root, "notes", "blob.bin"), Buffer.from([0, 1, 2, 3]));
    const [resolved] = await resolveAttachments(
      [{
        id: "pin",
        label: "folder",
        ref: { kind: "folder", path: "notes" },
      }],
      {
        workspaceRoot: root,
        projectId: "p",
        readFile: async () => "",
        getNodeContext: async () => {
          throw new Error("unused");
        },
      },
    );
    expect(resolved?.markdown).toContain("alpha excerpt");
    expect(resolved?.markdown).toContain("blob.bin (binary)");
    expect(resolved?.markdown).not.toContain("\u0000");
  });

  it("finds a file outside the function graph and skips ignored directories", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-paths-"));
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "src", "unmapped-widget.ts"), "export {}", "utf8");
    writeFileSync(join(root, "node_modules", "pkg", "unmapped-widget.ts"), "export {}", "utf8");
    expect(searchComposerFilePaths(root, "unmapped-widget")).toEqual(["src/unmapped-widget.ts"]);
  });
});
