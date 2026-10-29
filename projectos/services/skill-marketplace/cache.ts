import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type SkillCatalogCacheRecord = {
  bodyUtf8: string;
  signatureBase64: string;
  fetchedAt: string;
  catalogUrl: string;
};

export class SkillCatalogDiskCache {
  constructor(private readonly cacheFilePath: string) {}

  async read(): Promise<SkillCatalogCacheRecord | null> {
    try {
      const raw = await readFile(this.cacheFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<SkillCatalogCacheRecord>;
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

  async write(record: SkillCatalogCacheRecord): Promise<void> {
    await mkdir(dirname(this.cacheFilePath), { recursive: true });
    await writeFile(this.cacheFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }
}

export function defaultSkillCatalogCachePath(cacheRoot: string): string {
  return join(cacheRoot, "skill-catalog", "catalog-cache.json");
}
