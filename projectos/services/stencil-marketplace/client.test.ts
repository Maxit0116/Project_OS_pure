import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { StencilCatalogClient } from "./client.js";
import {
  readBundledStencilCatalogBody,
  readBundledStencilCatalogPublicKey,
  readBundledStencilCatalogSignature,
} from "./bundled-assets.js";
import { defaultStencilCatalogCachePath } from "./cache.js";

describe("StencilCatalogClient", () => {
  it("falls back to bundled when remote fails", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "stencil-cat-"));
    const client = new StencilCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledStencilCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/stencils/catalog.json",
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.some((l) => l.id === "curated.status-pill")).toBe(
      true,
    );
  });

  it("rejects poisoned cache without valid signature", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "stencil-cat-"));
    await mkdir(join(cacheRoot, "stencil-catalog"), { recursive: true });
    await writeFile(
      defaultStencilCatalogCachePath(cacheRoot),
      JSON.stringify({
        bodyUtf8: JSON.stringify({
          version: "evil",
          listings: [
            {
              id: "evil",
              name: "Evil",
              trustTier: "community",
              version: "9",
              stencils: [
                {
                  id: "evil-stencil",
                  category: "base",
                  title: "Evil",
                  tags: ["x"],
                  description: "bad",
                  previewAsset: "x.png",
                  briefTemplate: "bad",
                  codegen: { strategy: "brief-only" },
                },
              ],
            },
          ],
        }),
        signatureBase64: "nope",
        fetchedAt: new Date().toISOString(),
        catalogUrl: "https://catalog.example.test/stencils/catalog.json",
      }),
      "utf8",
    );
    const client = new StencilCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledStencilCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/stencils/catalog.json",
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.every((l) => l.id !== "evil")).toBe(true);
  });

  it("caches verified remote catalog", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "stencil-cat-"));
    const body = readBundledStencilCatalogBody();
    const sig = readBundledStencilCatalogSignature();
    const client = new StencilCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledStencilCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/stencils/catalog.json",
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".sig")) return new Response(sig, { status: 200 });
        return new Response(body, { status: 200 });
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("remote");
    expect(view.document.listings.length).toBeGreaterThan(0);
  });
});
