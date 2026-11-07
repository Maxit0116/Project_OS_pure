import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { SecretStore } from "./secret-store.js";

interface SecretFilePayload {
  secrets: Record<string, string>;
}

export class SecretStoreReadOnlyError extends Error {
  readonly code = "SECRET_STORE_READ_ONLY";

  constructor(operation: "set" | "delete" | "persist") {
    super(
      `Secret store is read-only; ${operation} is not allowed for PROJECTOS_SECRETS_USER_DATA reuse`,
    );
    this.name = "SecretStoreReadOnlyError";
  }
}

export interface FileSecretStoreOptions {
  /**
   * When true, get/has work but set/delete/persist throw and the constructor
   * never creates the secrets directory or secrets.json.
   */
  readOnly?: boolean;
}

/**
 * File-backed secret store at `{userDataPath}/secrets.json`.
 *
 * Read-only mode is required when reusing an external secrets root (e.g. the
 * daily desktop profile) from an isolated Chromium userData so the isolate
 * process cannot mutate shared credentials.
 */
export class FileSecretStore implements SecretStore {
  private readonly filePath: string;
  private readonly readOnly: boolean;
  private cache: Record<string, string> | null = null;

  constructor(userDataPath: string, options: FileSecretStoreOptions = {}) {
    this.readOnly = options.readOnly === true;
    const absolute = resolve(userDataPath);
    if (this.readOnly) {
      if (!existsSync(absolute)) {
        throw new Error(
          `Read-only secret store root does not exist: ${absolute}`,
        );
      }
      // Prefer realpath so symlink aliases cannot bypass boundary checks done by callers.
      const canonical = realpathSync(absolute);
      this.filePath = join(canonical, "secrets.json");
      if (!existsSync(this.filePath)) {
        throw new Error(
          `Read-only secret store requires an existing secrets.json under ${canonical}`,
        );
      }
    } else {
      mkdirSync(absolute, { recursive: true });
      this.filePath = join(absolute, "secrets.json");
    }
  }

  get durablePath(): string {
    return this.filePath;
  }

  get isReadOnly(): boolean {
    return this.readOnly;
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
    if (this.readOnly) {
      throw new SecretStoreReadOnlyError("persist");
    }
    const payload: SecretFilePayload = { secrets: this.loadCache() };
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }

  async set(ref: string, value: string): Promise<void> {
    if (this.readOnly) {
      throw new SecretStoreReadOnlyError("set");
    }
    this.loadCache()[ref] = value;
    this.persist();
  }

  async get(ref: string): Promise<string | undefined> {
    return this.loadCache()[ref];
  }

  async delete(ref: string): Promise<void> {
    if (this.readOnly) {
      throw new SecretStoreReadOnlyError("delete");
    }
    delete this.loadCache()[ref];
    this.persist();
  }

  async has(ref: string): Promise<boolean> {
    return ref in this.loadCache();
  }
}
