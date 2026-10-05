import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SecretStore } from "./secret-store.js";

interface SecretFilePayload {
  secrets: Record<string, string>;
}

export class FileSecretStore implements SecretStore {
  private readonly filePath: string;
  private cache: Record<string, string> | null = null;

  constructor(userDataPath: string) {
    mkdirSync(userDataPath, { recursive: true });
    this.filePath = join(userDataPath, "secrets.json");
  }

  private loadCache(): Record<string, string> {
    if (this.cache) {
      return this.cache;
    }
    if (!existsSync(this.filePath)) {
      this.cache = {};
      return this.cache;
    }
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as SecretFilePayload;
      this.cache = parsed.secrets ?? {};
      return this.cache;
    } catch {
      this.cache = {};
      return this.cache;
    }
  }

  private persist(): void {
    const payload: SecretFilePayload = { secrets: this.loadCache() };
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async set(ref: string, value: string): Promise<void> {
    this.loadCache()[ref] = value;
    this.persist();
  }

  async get(ref: string): Promise<string | undefined> {
    return this.loadCache()[ref];
  }

  async delete(ref: string): Promise<void> {
    delete this.loadCache()[ref];
    this.persist();
  }

  async has(ref: string): Promise<boolean> {
    return ref in this.loadCache();
  }
}
