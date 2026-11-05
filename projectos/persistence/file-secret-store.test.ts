import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
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
