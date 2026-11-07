import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type WorkflowCatalogCacheRecord = {
  bodyUtf8: string;
  signatureBase64: string;
  fetchedAt: string;
  catalogUrl: string;
};

export class WorkflowCatalogDiskCache {
  constructor(private readonly cacheFilePath: string) {}

  async read(): Promise<WorkflowCatalogCacheRecord | null> {
    try {
      const raw = await readFile(this.cacheFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<WorkflowCatalogCacheRecord>;
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

  async write(record: WorkflowCatalogCacheRecord): Promise<void> {
    await mkdir(dirname(this.cacheFilePath), { recursive: true });
    await writeFile(this.cacheFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

export function defaultWorkflowCatalogCachePath(cacheRoot: string): string {
  return join(cacheRoot, "workflow-catalog", "catalog-cache.json");
}
