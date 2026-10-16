import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveAttachments } from "./attachment-resolver.js";

const temps: string[] = [];

afterEach(() => {
  while (temps.length > 0) {
    const dir = temps.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("attachment-resolver images", () => {
  it("does not utf8-dump png files under .projectos", async () => {
    const root = mkdtempSync(join(tmpdir(), "att-img-"));
    temps.push(root);
    const rel = ".projectos/spatial-pins/assets/pin_1.png";
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const resolved = await resolveAttachments(
      [
        {
          id: "a1",
          label: "Spatial Pin snapshot",
          ref: { kind: "file", path: rel },
        },
      ],
      {
        workspaceRoot: root,
        projectId: "p1",
        readFile: async () => {
          throw new Error("should not read binary as text");
        },
        getNodeContext: async () => {
          throw new Error("unused");
        },
      },
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.disposition).toBe("exact");
    expect(resolved[0]!.content).toBeUndefined();
    expect(resolved[0]!.omissionReason).toBe("binary_image_attachment");
    expect(resolved[0]!.markdown).toContain(rel);
  });
});
