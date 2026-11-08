import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  FileSecretStore,
  SecretStoreReadOnlyError,
} from "./file-secret-store.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function temp(): string {
  const root = mkdtempSync(join(tmpdir(), "projectos-secrets-"));
  roots.push(root);
  return root;
}

describe("FileSecretStore read-only reuse", () => {
  it("allows get/has but rejects set/delete without writing", async () => {
    const root = temp();
    const before = JSON.stringify(
      { secrets: { "model_profile:demo": "value-not-printed-in-assertions" } },
      null,
      2,
    );
    writeFileSync(join(root, "secrets.json"), `${before}\n`, "utf8");
    const shaBefore = before;

    const store = new FileSecretStore(root, { readOnly: true });
    expect(store.isReadOnly).toBe(true);
    expect(await store.has("model_profile:demo")).toBe(true);
    expect(await store.get("model_profile:demo")).toBe(
      "value-not-printed-in-assertions",
    );

    await expect(store.set("model_profile:demo", "mutated")).rejects.toBeInstanceOf(
      SecretStoreReadOnlyError,
    );
    await expect(store.delete("model_profile:demo")).rejects.toBeInstanceOf(
      SecretStoreReadOnlyError,
    );

    expect(readFileSync(join(root, "secrets.json"), "utf8").trim()).toBe(shaBefore.trim());
  });

  it("does not mkdir a missing read-only root", () => {
    const missing = join(temp(), "does-not-exist-yet");
    expect(() => new FileSecretStore(missing, { readOnly: true })).toThrow(
      /does not exist/,
    );
    expect(existsSync(missing)).toBe(false);
  });

  it("requires secrets.json for read-only mode", () => {
    const root = temp();
    mkdirSync(root, { recursive: true });
    expect(() => new FileSecretStore(root, { readOnly: true })).toThrow(
      /secrets\.json/,
    );
  });

  it("resolves symlink roots via realpath for durablePath", () => {
    const real = temp();
    writeFileSync(
      join(real, "secrets.json"),
      `${JSON.stringify({ secrets: { a: "1" } })}\n`,
      "utf8",
    );
    const parent = temp();
    const link = join(parent, "alias");
    symlinkSync(real, link);
    const store = new FileSecretStore(link, { readOnly: true });
    expect(store.durablePath).toBe(join(realpathSync(real), "secrets.json"));
  });

  it("writable mode still creates and persists (default product path)", async () => {
    const root = temp();
    const store = new FileSecretStore(root);
    await store.set("model_profile:x", "k");
    expect(await store.get("model_profile:x")).toBe("k");
    expect(existsSync(join(root, "secrets.json"))).toBe(true);
  });
});

describe("FileSecretStore", () => {
  it("round-trips a secret across instances", async () => {
    const dir = temp();
    await new FileSecretStore(dir).set("ref_a", "value-a");
    expect(await new FileSecretStore(dir).get("ref_a")).toBe("value-a");
  });

  it("keeps the file readable by its owner only", async () => {
    const dir = temp();
    await new FileSecretStore(dir).set("ref_a", "value-a");
    expect(statSync(join(dir, "secrets.json")).mode & 0o777).toBe(0o600);
  });

  it("tightens an old file as soon as the store is opened, before anything is written", () => {
    const dir = temp();
    const file = join(dir, "secrets.json");
    writeFileSync(file, JSON.stringify({ secrets: { ref_old: "old" } }));
    chmodSync(file, 0o644);

    new FileSecretStore(dir);

    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("tightens a file that an earlier build left readable by others", async () => {
    const dir = temp();
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
    const dir = temp();
    const store = new FileSecretStore(dir, fakeCipher());
    await store.set("model_profile:deepseek", KEY);
    const raw = readFileSync(join(dir, "secrets.json"), "utf8");
    expect(raw).not.toContain(KEY);
    expect(JSON.parse(raw)).toMatchObject({ secrets: {}, encrypted: { "model_profile:deepseek": expect.any(String) } });
    expect(await new FileSecretStore(dir, fakeCipher()).get("model_profile:deepseek")).toBe(KEY);
  });

  it("encrypts a plain-text file from an earlier build as soon as it is read", async () => {
    const dir = temp();
    writeFileSync(join(dir, "secrets.json"), JSON.stringify({ secrets: { "model_profile:deepseek": KEY } }));
    const store = new FileSecretStore(dir, fakeCipher());
    expect(await store.get("model_profile:deepseek")).toBe(KEY);
    expect(readFileSync(join(dir, "secrets.json"), "utf8")).not.toContain(KEY);
  });

  it("keeps a key it cannot decrypt instead of dropping it, until it is set again", async () => {
    const dir = temp();
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
    const dir = temp();
    const store = new FileSecretStore(dir, fakeCipher(false));
    await store.set("model_profile:deepseek", KEY);
    expect(JSON.parse(readFileSync(join(dir, "secrets.json"), "utf8")).secrets["model_profile:deepseek"]).toBe(KEY);
    expect(statSync(join(dir, "secrets.json")).mode & 0o777).toBe(0o600);
  });

  it("accepts cipher via options object alongside readOnly", async () => {
    const dir = temp();
    writeFileSync(
      join(dir, "secrets.json"),
      JSON.stringify({
        secrets: {},
        encrypted: {
          "model_profile:deepseek": Buffer.from(`enc:${KEY}`).toString("base64"),
        },
      }),
    );
    const store = new FileSecretStore(dir, { readOnly: true, cipher: fakeCipher() });
    expect(await store.get("model_profile:deepseek")).toBe(KEY);
    await expect(store.set("model_profile:deepseek", "nope")).rejects.toBeInstanceOf(
      SecretStoreReadOnlyError,
    );
  });
});
