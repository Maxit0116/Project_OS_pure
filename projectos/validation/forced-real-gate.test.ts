import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  scripts?: Record<string, string>;
};

describe("repository test gate", () => {
  it("requires the serialized real preview and production Electron scenarios", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("package.json"), "utf8"),
    ) as PackageManifest;

    expect(manifest.scripts?.["test"]).toBe(
      "env PROJECTOS_REQUIRE_REAL_PREVIEW=1 vitest run --maxWorkers=1 --minWorkers=1",
    );
    expect(manifest.scripts?.["test:unit"]).toBe("vitest run");
  });
});
