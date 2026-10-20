import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  detectRepoDesignSystemFromProbes,
  emptyRepoDesignSystemSnapshot,
  type RepoDesignSystemSnapshot,
} from "../contracts/repo-design-system.js";

const TAILWIND_CANDIDATES = [
  "tailwind.config.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.cjs",
] as const;

function safeReadText(workspaceRoot: string, relativePath: string): string | null {
  try {
    const absolute = join(workspaceRoot, relativePath);
    if (!existsSync(absolute)) return null;
    return readFileSync(absolute, "utf8");
  } catch {
    return null;
  }
}

function listUiComponentFiles(
  workspaceRoot: string,
  uiDir: string,
): string[] {
  const absolute = join(workspaceRoot, uiDir);
  if (!existsSync(absolute)) return [];
  try {
    return readdirSync(absolute)
      .filter((name) => /\.(tsx|ts|jsx|js)$/u.test(name))
      .map((name) => `${uiDir}/${name}`.replace(/\\/gu, "/"));
  } catch {
    return [];
  }
}

/**
 * Probe the workspace for shadcn / Tailwind / motion and existing ui files.
 * Safe for mock:// roots (returns an empty snapshot).
 */
export function detectRepoDesignSystemFromWorkspace(
  workspaceRoot: string,
): RepoDesignSystemSnapshot {
  if (!workspaceRoot || workspaceRoot.startsWith("mock://")) {
    return emptyRepoDesignSystemSnapshot();
  }

  const componentsJsonText = safeReadText(workspaceRoot, "components.json");
  const packageJsonText = safeReadText(workspaceRoot, "package.json");
  const existingPaths: string[] = [];

  if (componentsJsonText != null || existsSync(join(workspaceRoot, "components.json"))) {
    existingPaths.push("components.json");
  }
  for (const candidate of TAILWIND_CANDIDATES) {
    if (existsSync(join(workspaceRoot, candidate))) {
      existingPaths.push(candidate);
    }
  }

  const preliminary = detectRepoDesignSystemFromProbes({
    componentsJsonText,
    packageJsonText,
    existingPaths,
  });

  if (preliminary.uiComponentsDir) {
    existingPaths.push(
      ...listUiComponentFiles(workspaceRoot, preliminary.uiComponentsDir),
    );
  }

  return detectRepoDesignSystemFromProbes({
    componentsJsonText,
    packageJsonText,
    existingPaths,
  });
}
