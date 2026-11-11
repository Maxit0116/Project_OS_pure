import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCatalogClient } from "./client.js";
import {
  readBundledWorkflowCatalogBody,
  readBundledWorkflowCatalogPublicKey,
  readBundledWorkflowCatalogSignature,
} from "./bundled-assets.js";
import { defaultWorkflowCatalogCachePath } from "./cache.js";
import type { McpDnsLookup } from "../mcp/mcp-http-guard.js";

// The URL guard looks the host up; these tests use hosts that cannot resolve (".test"), so they say where it points.
const testDns: McpDnsLookup = async () => [{ address: "93.184.216.34" }];

import type { McpDnsLookup } from "../mcp/mcp-http-guard.js";

// Hosts under .test cannot resolve; tests supply a public A record for the guard.
const testDns: McpDnsLookup = async () => [{ address: "93.184.216.34" }];


describe("WorkflowCatalogClient", () => {
  it("falls back to bundled when remote fails", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "workflow-cat-"));
    const client = new WorkflowCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledWorkflowCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/workflows/catalog.json",
      resolveDns: testDns,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(
      view.document.listings.some((l) => l.id === "curated.feature-development"),
    ).toBe(true);
  });

  it("rejects poisoned cache without valid signature", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "workflow-cat-"));
    await mkdir(join(cacheRoot, "workflow-catalog"), { recursive: true });
    await writeFile(
      defaultWorkflowCatalogCachePath(cacheRoot),
      JSON.stringify({
        bodyUtf8: JSON.stringify({
          version: "evil",
          listings: [
            {
              id: "evil",
              name: "Evil",
              trustTier: "community",
              version: "9",
              draft: {
                revision: 1,
                graphPrompt: "bad",
                nodes: [],
                edges: [],
              },
            },
          ],
        }),
        signatureBase64: "nope",
        fetchedAt: new Date().toISOString(),
        catalogUrl: "https://catalog.example.test/workflows/catalog.json",
      }),
      "utf8",
    );
    const client = new WorkflowCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledWorkflowCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/workflows/catalog.json",
      resolveDns: testDns,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });
    const view = await client.getCatalog();
    expect(view.source).toBe("bundled");
    expect(view.document.listings.every((l) => l.id !== "evil")).toBe(true);
  });

  it("caches verified remote catalog", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "workflow-cat-"));
    const body = readBundledWorkflowCatalogBody();
    const sig = readBundledWorkflowCatalogSignature();
    const client = new WorkflowCatalogClient({
      cacheRoot,
      publicKeySpkiBase64: readBundledWorkflowCatalogPublicKey(),
      defaultCatalogUrl: "https://catalog.example.test/workflows/catalog.json",
      resolveDns: testDns,
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(".sig")) return new Response(sig, { status: 200 });
        return new Response(body, { status: 200 });
      }) as unknown as typeof fetch,
    });
    // Cold start without forceRefresh serves bundled; remote path requires refresh.
    const view = await client.getCatalog({ forceRefresh: true });
    expect(view.source).toBe("remote");
    expect(view.document.listings.length).toBeGreaterThan(0);
  });
});
