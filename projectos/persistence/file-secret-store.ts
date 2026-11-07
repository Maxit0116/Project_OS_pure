import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

export class FileSecretStore implements SecretStore {
  private readonly filePath: string;
  private cache: Record<string, string> | null = null;
  /**
   * Ciphertext that could not be decrypted (the Keychain refused, or the key changed). It is kept in
   * the file, not dropped, so a later start that may decrypt it still finds it; setting the same
   * reference again replaces it.
   */
  private undecryptable: Record<string, string> = {};

  constructor(userDataPath: string, private readonly cipher?: SecretCipher) {
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
    if (Object.keys(parsed.secrets ?? {}).length > 0 && this.cipherAvailable()) this.persist();
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
    this.loadCache()[ref] = value;
    delete this.undecryptable[ref];
    this.persist();
  }

  async get(ref: string): Promise<string | undefined> {
    return this.loadCache()[ref];
  }

  async delete(ref: string): Promise<void> {
    delete this.loadCache()[ref];
    delete this.undecryptable[ref];
    this.persist();
  }

  async has(ref: string): Promise<boolean> {
    return ref in this.loadCache();
  }
}
