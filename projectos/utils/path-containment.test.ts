import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  resolveContainedDestinationPath,
  resolveContainedPath,
} from "./path-containment.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("path containment", () => {
  it("resolves existing paths inside the canonical root", () => {
    const root = temporaryRoot("projectos-contained-existing-");
    const target = join(root, "target.txt");
    writeFileSync(target, "target\n", "utf8");

    expect(resolveContainedPath(root, "target.txt")).toBe(realpathSync(target));
  });

  it("resolves a not-yet-existing destination through its existing canonical parent", () => {
    const root = temporaryRoot("projectos-contained-destination-");
    mkdirSync(join(root, "nested"));

    expect(resolveContainedDestinationPath(root, "nested/new.txt")).toBe(
      join(realpathSync(root), "nested", "new.txt"),
    );
  });

  it("rejects unsafe destination paths before they are created", () => {
    const root = temporaryRoot("projectos-contained-unsafe-");

    expect(() => resolveContainedDestinationPath(root, "../outside.txt")).toThrow(
      /contained relative path/u,
    );
    expect(() => resolveContainedDestinationPath(root, join(root, "absolute.txt"))).toThrow(
      /contained relative path/u,
    );
  });

  it.runIf(process.platform !== "win32")(
    "rejects a missing destination below a symlinked parent outside the root",
    () => {
      const root = temporaryRoot("projectos-contained-symlink-");
      const outside = temporaryRoot("projectos-contained-outside-");
      symlinkSync(outside, join(root, "linked"), "dir");

      expect(() => resolveContainedDestinationPath(root, "linked/new.txt")).toThrow(
        /escapes its allowed root/u,
      );
    },
  );
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}
