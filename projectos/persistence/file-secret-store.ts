import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    // A file made by an earlier build may be readable by other accounts; fix it at start-up, not only on the next write.
    if (existsSync(this.filePath)) {
      try {
        chmodSync(this.filePath, 0o600);
      } catch {
        // Not ours to change (read-only volume, other owner): reading still works, and the failure is not fatal.
      }
    }
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
    // Model API keys live here in plain text, so only the person who owns the account may read them.
    // `mode` applies only when the file is created; the chmod also tightens a file an older build made.
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
    chmodSync(this.filePath, 0o600);
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
