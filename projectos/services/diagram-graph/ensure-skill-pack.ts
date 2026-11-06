import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DIAGRAM_DESIGN_SKILL_ID,
  type DiagramSkillPackStatus,
  type EnsureDiagramDesignSkillResult,
} from "../../contracts/diagram-graph.js";
import { diagramSkillDir } from "./paths.js";

const UPSTREAM_TARBALL =
  "https://codeload.github.com/cathrynlavery/diagram-design/tar.gz/refs/heads/main";
const MAX_EXAMPLE_BYTES = 120_000;

export type EnsureDiagramDesignSkillPackOptions = {
  workspaceRoot: string;
  /** Local mirror of skills/diagram-design (optional offline source). */
  vendorRoot?: string;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Skip network; only vendor/fixture. */
  offline?: boolean;
};

function skillStatus(workspaceRoot: string): DiagramSkillPackStatus {
  const dir = diagramSkillDir(workspaceRoot);
  const skillFile = join(dir, "SKILL.md");
  const refs = join(dir, "references");
  const installed = existsSync(skillFile);
  const hasReferences = installed && existsSync(refs);
  let version: string | undefined;
  if (installed) {
    try {
      const raw = readFileSync(skillFile, "utf8");
      const match = raw.match(/metadata:\s*\n\s*version:\s*["']?([^"'\n]+)/);
      version = match?.[1]?.trim();
    } catch {
      /* ignore */
    }
  }
  return {
    installed,
    skillId: DIAGRAM_DESIGN_SKILL_ID,
    hasReferences,
    ...(version ? { version } : {}),
  };
}

function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      copyTree(from, to);
      continue;
    }
    if (!entry.isFile()) continue;
    const size = statSync(from).size;
    const normalized = from.replaceAll("\\", "/");
    if (
      size > MAX_EXAMPLE_BYTES &&
      normalized.includes("/assets/example")
    ) {
      continue;
    }
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, readFileSync(from));
  }
}

async function extractSkillFromTarball(
  buffer: Buffer,
  destDir: string,
): Promise<void> {
  const staging = join(
    tmpdir(),
    `projectos-diagram-design-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(staging, { recursive: true });
  const tarballPath = join(staging, "pack.tar.gz");
  writeFileSync(tarballPath, buffer);

  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    "tar",
    ["-xzf", tarballPath, "-C", staging, "diagram-design-main/skills/diagram-design"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(
      `Failed to extract diagram-design skill pack: ${result.stderr || result.stdout || "tar error"}`,
    );
  }
  const extracted = join(staging, "diagram-design-main", "skills", "diagram-design");
  if (!existsSync(join(extracted, "SKILL.md"))) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error("diagram-design tarball missing skills/diagram-design/SKILL.md");
  }
  if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
  copyTree(extracted, destDir);
  rmSync(staging, { recursive: true, force: true });
}

async function downloadSkillPack(
  destDir: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(UPSTREAM_TARBALL, {
    headers: { Accept: "application/octet-stream" },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to download diagram-design skill pack (${response.status})`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  await extractSkillFromTarball(Buffer.from(arrayBuffer), destDir);
}

/**
 * Ensure the full diagram-design skill tree is present under
 * `.projectos/skills/community.diagram-design/`.
 */
export async function ensureDiagramDesignSkillPack(
  options: EnsureDiagramDesignSkillPackOptions,
): Promise<EnsureDiagramDesignSkillResult> {
  const current = skillStatus(options.workspaceRoot);
  if (current.installed && current.hasReferences) {
    return { status: current, installedNow: false };
  }

  const dest = diagramSkillDir(options.workspaceRoot);
  mkdirSync(dirname(dest), { recursive: true });

  if (options.vendorRoot && existsSync(join(options.vendorRoot, "SKILL.md"))) {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    copyTree(options.vendorRoot, dest);
    return { status: skillStatus(options.workspaceRoot), installedNow: true };
  }

  if (options.offline) {
    throw new Error(
      "diagram-design skill pack is missing and offline ensure was requested",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  await downloadSkillPack(dest, fetchImpl);
  return { status: skillStatus(options.workspaceRoot), installedNow: true };
}

export function getDiagramSkillPackStatus(
  workspaceRoot: string,
): DiagramSkillPackStatus {
  return skillStatus(workspaceRoot);
}

/** Test helper: write a minimal skill pack fixture. */
export function writeMinimalDiagramSkillPack(destDir: string): void {
  mkdirSync(join(destDir, "references"), { recursive: true });
  writeFileSync(
    join(destDir, "SKILL.md"),
    `---
name: diagram-design
description: Create branded diagrams as HTML/SVG.
metadata:
  version: "2.6-fixture"
---

# Diagram Design (fixture)

Create one self-contained HTML file with inline SVG.
`,
    "utf8",
  );
  writeFileSync(
    join(destDir, "references", "style-guide.md"),
    `# Style guide\n\npaper #181818\nink #ebebeb\naccent #ececec\n`,
    "utf8",
  );
}
