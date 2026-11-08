import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { SecretStore } from "./secret-store.js";

interface SecretFilePayload {
  /** Plain text, used only when no cipher is available (and read once from older files to migrate them). */
  secrets: Record<string, string>;
  /** Base64 ciphertext per reference, made by the cipher (on macOS a key held in the Keychain). */
  encrypted?: Record<string, string>;
}

/**
 * Encrypts secrets at rest. The desktop app passes Electron's safeStorage, whose key lives in the
 * macOS Keychain (item "<app name> Safe Storage"), so secrets.json no longer holds keys in plain text.
 */
export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
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
  /** Optional at-rest cipher (desktop passes Electron safeStorage / Keychain). */
  cipher?: SecretCipher;
}

function isSecretCipher(value: unknown): value is SecretCipher {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SecretCipher).isAvailable === "function" &&
    typeof (value as SecretCipher).encrypt === "function" &&
    typeof (value as SecretCipher).decrypt === "function"
  );
}

function normalizeOptions(
  optionsOrCipher?: FileSecretStoreOptions | SecretCipher,
): FileSecretStoreOptions {
  if (optionsOrCipher === undefined) return {};
  if (isSecretCipher(optionsOrCipher)) return { cipher: optionsOrCipher };
  return optionsOrCipher;
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
  private readonly cipher: SecretCipher | undefined;
  private cache: Record<string, string> | null = null;
  /**
   * Ciphertext that could not be decrypted (the Keychain refused, or the key changed). It is kept in
   * the file, not dropped, so a later start that may decrypt it still finds it; setting the same
   * reference again replaces it.
   */
  private undecryptable: Record<string, string> = {};

  constructor(
    userDataPath: string,
    optionsOrCipher: FileSecretStoreOptions | SecretCipher = {},
  ) {
    const options = normalizeOptions(optionsOrCipher);
    this.readOnly = options.readOnly === true;
    this.cipher = options.cipher;
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
      // A file made by an earlier build may be readable by other accounts; fix it at start-up, not only on the next write.
      if (existsSync(this.filePath)) {
        try {
          chmodSync(this.filePath, 0o600);
        } catch {
          // Not ours to change (read-only volume, other owner): reading still works, and the failure is not fatal.
        }
      }
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
    let parsed: SecretFilePayload;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as SecretFilePayload;
    } catch {
      this.cache = {};
      return this.cache;
    }
    const cache: Record<string, string> = { ...(parsed.secrets ?? {}) };
    for (const [ref, cipherText] of Object.entries(parsed.encrypted ?? {})) {
      try {
        if (!this.cipherAvailable()) throw new Error("no cipher");
        cache[ref] = this.cipher!.decrypt(cipherText);
      } catch {
        this.undecryptable[ref] = cipherText;
      }
    }
    this.cache = cache;
    // A file written in plain text by an earlier build is encrypted as soon as it is read.
    // Skip migration writes in read-only reuse so isolates cannot mutate shared credentials.
    if (
      !this.readOnly &&
      Object.keys(parsed.secrets ?? {}).length > 0 &&
      this.cipherAvailable()
    ) {
      this.persist();
    }
    return this.cache;
  }

  private cipherAvailable(): boolean {
    try {
      return Boolean(this.cipher?.isAvailable());
    } catch {
      return false;
    }
  }

  private persist(): void {
    if (this.readOnly) {
      throw new SecretStoreReadOnlyError("persist");
    }
    const secrets = this.loadCache();
    let payload: SecretFilePayload;
    if (this.cipherAvailable()) {
      const encrypted: Record<string, string> = { ...this.undecryptable };
      for (const [ref, value] of Object.entries(secrets)) encrypted[ref] = this.cipher!.encrypt(value);
      payload = { secrets: {}, encrypted };
    } else {
      // No cipher (tests, or a system without a keychain): plain text, readable by this account only.
      payload = {
        secrets,
        ...(Object.keys(this.undecryptable).length > 0 ? { encrypted: { ...this.undecryptable } } : {}),
      };
    }
    // `mode` applies only when the file is created; the chmod also tightens a file an older build made.
    writeFileSync(this.filePath, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
    chmodSync(this.filePath, 0o600);
  }

  async set(ref: string, value: string): Promise<void> {
    if (this.readOnly) {
      throw new SecretStoreReadOnlyError("set");
    }
    this.loadCache()[ref] = value;
    delete this.undecryptable[ref];
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
    delete this.undecryptable[ref];
    this.persist();
  }

  async has(ref: string): Promise<boolean> {
    return ref in this.loadCache();
  }
}
