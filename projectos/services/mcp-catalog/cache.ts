import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type McpCatalogCacheRecord = {
  bodyUtf8: string;
  signatureBase64: string;
  fetchedAt: string;
  catalogUrl: string;
};

export class McpCatalogDiskCache {
  constructor(private readonly cacheFilePath: string) {}

  async read(): Promise<McpCatalogCacheRecord | null> {
    try {
      const raw = await readFile(this.cacheFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<McpCatalogCacheRecord>;
      if (
        typeof parsed.bodyUtf8 !== "string" ||
        typeof parsed.signatureBase64 !== "string" ||
        typeof parsed.fetchedAt !== "string" ||
        typeof parsed.catalogUrl !== "string"
      ) {
        return null;
      }
      return {
        bodyUtf8: parsed.bodyUtf8,
        signatureBase64: parsed.signatureBase64,
        fetchedAt: parsed.fetchedAt,
        catalogUrl: parsed.catalogUrl,
      };
    } catch {
      return null;
    }
  }

  async write(record: McpCatalogCacheRecord): Promise<void> {
    await mkdir(dirname(this.cacheFilePath), { recursive: true });
    await writeFile(this.cacheFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

export function defaultMcpCatalogCachePath(cacheRoot: string): string {
  return join(cacheRoot, "mcp-catalog", "catalog-cache.json");
}
