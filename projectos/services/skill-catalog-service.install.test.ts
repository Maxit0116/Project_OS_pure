import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { existsSync } from "node:fs";
import { join as pathJoin } from "node:path";

import {
  installProjectSkill,
  projectSkillsRoot,
  safeSkillInstallId,
  SkillInstallError,
  uninstallProjectSkill,
} from "./skill-catalog-service.js";

describe("installProjectSkill", () => {
  it("rejects path traversal listing ids", () => {
    expect(() => safeSkillInstallId("../evil")).toThrow(SkillInstallError);
  });

  it("rejects unsafe companion paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-inst-"));
    try {
      expect(() =>
        installProjectSkill({
          workspaceRoot: root,
          listing: {
            id: "curated.demo",
            name: "Demo",
            trustTier: "curated",
            version: "1",
            skillMarkdown: "---\nname: demo\ndescription: d\n---\n# Demo\n",
            files: { "../escape.txt": "nope" },
          },
        }),
      ).toThrow(SkillInstallError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("installs then uninstalls a skill directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-uninst-"));
    try {
      installProjectSkill({
        workspaceRoot: root,
        listing: {
          id: "curated.demo",
          name: "Demo",
          trustTier: "curated",
          version: "1",
          skillMarkdown: "---\nname: demo\ndescription: d\n---\n# Demo\n",
        },
      });
      const skillDir = pathJoin(projectSkillsRoot(root), "curated.demo");
      expect(existsSync(skillDir)).toBe(true);
      uninstallProjectSkill({ workspaceRoot: root, listingId: "curated.demo" });
      expect(existsSync(skillDir)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
