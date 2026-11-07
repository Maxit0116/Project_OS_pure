import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { parseCapabilityPackJson } from "./resolve-capability-pack.js";
import {
  installProjectRulesPack,
  listInstalledRulesPackIds,
} from "../rules-catalog-service.js";

describe("rules git-url install path", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("installs a rules pack with git-url provenance", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "pos-rules-git-"));
    dirs.push(workspaceRoot);
    const listing = {
      id: "community.git-rules",
      name: "Git Rules",
      trustTier: "community" as const,
      version: "1.0.0",
      files: { "guide.md": "# Guide\nBe careful.\n" },
    };
    const installed = installProjectRulesPack({
      workspaceRoot,
      listing,
      catalogVersion: "git-url",
      source: "git-url",
      gitUrl: "https://github.com/acme/rules",
      gitCommit: "abc123",
    });
    expect(installed.packId).toBe("community.git-rules");
    expect(listInstalledRulesPackIds(workspaceRoot)).toContain(
      "community.git-rules",
    );
  });

  it("parses rules pack envelope from export JSON", () => {
    const envelope = parseCapabilityPackJson(
      JSON.stringify({
        kind: "rules",
        listing: {
          id: "curated.demo",
          name: "Demo",
          trustTier: "curated",
          version: "1.0.0",
          files: { "a.md": "# A\n" },
        },
      }),
    );
    expect(envelope.kind).toBe("rules");
  });
});
