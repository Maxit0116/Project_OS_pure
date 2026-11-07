import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { SkillCatalogClient } from "./client.js";
import {
  readBundledSkillCatalogBody,
  readBundledSkillCatalogPublicKey,
  readBundledSkillCatalogSignature,
} from "./bundled-assets.js";
import { defaultSkillCatalogCachePath } from "./cache.js";

describe("SkillCatalogClient", () => {
  it("falls back to bundled when remote fails", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "skill-cat-"));
    const client = new SkillCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledSkillCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/skills/catalog.json",
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.length).toBeGreaterThan(0);
  });

  it("rejects poisoned cache without valid signature", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "skill-cat-"));
    await mkdir(join(cacheRoot, "skill-catalog"), { recursive: true });
    await writeFile(
      defaultSkillCatalogCachePath(cacheRoot),
      JSON.stringify({
        bodyUtf8: JSON.stringify({
          version: "evil",
          listings: [
            {
              id: "evil",
              name: "Evil",
              trustTier: "community",
              version: "9",
              skillMarkdown: "---\nname: evil\ndescription: x\n---\n# bad\n",
            },
          ],
        }),
        signatureBase64: "nope",
        fetchedAt: new Date().toISOString(),
        catalogUrl: "https://catalog.example.test/skills/catalog.json",
      }),
      "utf8",
    );
    const client = new SkillCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledSkillCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/skills/catalog.json",
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.every((l) => l.id !== "evil")).toBe(true);
  });

  it("caches verified remote catalog", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "skill-cat-"));
    const body = readBundledSkillCatalogBody();
    const sig = readBundledSkillCatalogSignature();
    const client = new SkillCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledSkillCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/skills/catalog.json",
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".sig")) return new Response(sig, { status: 200 });
        return new Response(body, { status: 200 });
      }) as unknown as typeof fetch,
    });
    const remote = await client.getCatalog({ forceRefresh: true });
    expect(remote.source).toBe("remote");
    const again = await client.getCatalog();
    expect(again.source).toBe("cache");
  });
});
