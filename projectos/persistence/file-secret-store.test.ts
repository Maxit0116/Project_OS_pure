import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FileSecretStore } from "./file-secret-store.js";

const dirs: string[] = [];
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "projectos-secrets-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("FileSecretStore", () => {
  it("round-trips a secret across instances", async () => {
    const dir = freshDir();
    await new FileSecretStore(dir).set("ref_a", "value-a");
    expect(await new FileSecretStore(dir).get("ref_a")).toBe("value-a");
  });

  it("keeps the file readable by its owner only", async () => {
    const dir = freshDir();
    await new FileSecretStore(dir).set("ref_a", "value-a");
    expect(statSync(join(dir, "secrets.json")).mode & 0o777).toBe(0o600);
  });

  it("tightens an old file as soon as the store is opened, before anything is written", () => {
    const dir = freshDir();
    const file = join(dir, "secrets.json");
    writeFileSync(file, JSON.stringify({ secrets: { ref_old: "old" } }));
    chmodSync(file, 0o644);

    new FileSecretStore(dir);

    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("tightens a file that an earlier build left readable by others", async () => {
    const dir = freshDir();
    const file = join(dir, "secrets.json");
    writeFileSync(file, JSON.stringify({ secrets: { ref_old: "old" } }));
    chmodSync(file, 0o644);

    const store = new FileSecretStore(dir);
    await store.set("ref_new", "new");

    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(await store.get("ref_old")).toBe("old");
  });
});

/**
 * Keys used to sit in secrets.json in plain text (mode 0600). With a cipher (the desktop app passes
 * Electron's safeStorage, keyed in the macOS Keychain) they are stored encrypted.
 */
describe("secrets encrypted at rest", () => {
  const fakeCipher = (available = true) => ({
    isAvailable: () => available,
    encrypt: (plain: string) => Buffer.from(`enc:${plain}`).toString("base64"),
    decrypt: (cipherText: string) => {
      const text = Buffer.from(cipherText, "base64").toString();
      if (!text.startsWith("enc:")) throw new Error("not ours");
      return text.slice(4);
    },
  });
  const KEY = "sk-test-0123456789abcdef";

  it("never writes a key in plain text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "secrets-enc-"));
    const store = new FileSecretStore(dir, fakeCipher());
    await store.set("model_profile:deepseek", KEY);
    const raw = readFileSync(join(dir, "secrets.json"), "utf8");
    expect(raw).not.toContain(KEY);
    expect(JSON.parse(raw)).toMatchObject({ secrets: {}, encrypted: { "model_profile:deepseek": expect.any(String) } });
    expect(await new FileSecretStore(dir, fakeCipher()).get("model_profile:deepseek")).toBe(KEY);
  });

  it("encrypts a plain-text file from an earlier build as soon as it is read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "secrets-migrate-"));
    writeFileSync(join(dir, "secrets.json"), JSON.stringify({ secrets: { "model_profile:deepseek": KEY } }));
    const store = new FileSecretStore(dir, fakeCipher());
    expect(await store.get("model_profile:deepseek")).toBe(KEY);
    expect(readFileSync(join(dir, "secrets.json"), "utf8")).not.toContain(KEY);
  });

  it("keeps a key it cannot decrypt instead of dropping it, until it is set again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "secrets-locked-"));
    const foreign = Buffer.from("written by another key").toString("base64");
    writeFileSync(join(dir, "secrets.json"), JSON.stringify({ secrets: {}, encrypted: { "model_profile:old": foreign } }));
    const store = new FileSecretStore(dir, fakeCipher());
    expect(await store.get("model_profile:old")).toBeUndefined();
    await store.set("model_profile:new", KEY);
    expect(JSON.parse(readFileSync(join(dir, "secrets.json"), "utf8")).encrypted["model_profile:old"]).toBe(foreign);
    await store.set("model_profile:old", "sk-replaced");
    expect(await new FileSecretStore(dir, fakeCipher()).get("model_profile:old")).toBe("sk-replaced");
  });

  it("stays plain text, readable by this account only, when no cipher is available", async () => {
    const dir = mkdtempSync(join(tmpdir(), "secrets-plain-"));
    const store = new FileSecretStore(dir, fakeCipher(false));
    await store.set("model_profile:deepseek", KEY);
    expect(JSON.parse(readFileSync(join(dir, "secrets.json"), "utf8")).secrets["model_profile:deepseek"]).toBe(KEY);
    expect(statSync(join(dir, "secrets.json")).mode & 0o777).toBe(0o600);
  });
});
