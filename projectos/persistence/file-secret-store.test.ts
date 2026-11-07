import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
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
