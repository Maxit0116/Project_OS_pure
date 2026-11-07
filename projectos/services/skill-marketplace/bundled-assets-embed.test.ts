import { describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("skill bundled catalog assets embed fallback", () => {
  it("SkillCatalogClient constructs when source bundled/ is unavailable", async () => {
    vi.resetModules();
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        existsSync: (path: Parameters<typeof actual.existsSync>[0]) => {
          if (
            String(path).includes(`${join("skill-marketplace", "bundled")}`) ||
            String(path).endsWith(`${join("bundled", "catalog.pubkey.b64")}`) ||
            String(path).includes("/bundled/catalog")
          ) {
            return false;
          }
          return actual.existsSync(path);
        },
        readFileSync: (
          path: Parameters<typeof actual.readFileSync>[0],
          options?: Parameters<typeof actual.readFileSync>[1],
        ) => {
          if (String(path).includes("/bundled/catalog")) {
            throw Object.assign(new Error(`ENOENT: ${String(path)}`), {
              code: "ENOENT",
            });
          }
          return actual.readFileSync(path, options as never);
        },
      };
    });

    const { SkillCatalogClient } = await import("./client.js");
    const { readBundledSkillCatalogPublicKey } = await import(
      "./bundled-assets.js"
    );
    expect(readBundledSkillCatalogPublicKey()).toMatch(/^MCow/);

    const client = new SkillCatalogClient({
      cacheRoot: mkdtempSync(join(tmpdir(), "skill-embed-")),
    });
    const view = client.loadBundled();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.length).toBeGreaterThan(0);
  });
});
