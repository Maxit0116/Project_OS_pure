/**
 * Install structure-graph AI scan prompts into a workspace `.projectos/prompts/`.
 */

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface StructureGraphInstallResult {
  promptsInstalled: boolean;
  created: string[];
}

function resolvePackagePath(...segments: string[]): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", ...segments),
    resolve(here, "../..", ...segments),
    resolve(here, "../../..", ...segments),
    resolve(process.cwd(), ...segments),
    resolve(process.cwd(), "projectos", ...segments),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

/**
 * Copy structure-scan prompts. Idempotent; refreshes package-owned files.
 */
export function installStructureGraphScaffolding(
  workspaceRoot: string,
  options?: { force?: boolean },
): StructureGraphInstallResult {
  const force = options?.force === true;
  const created: string[] = [];
  let promptsInstalled = false;

  const promptSource = resolvePackagePath("structure-graph", "prompts");
  if (promptSource) {
    const target = join(workspaceRoot, ".projectos", "prompts");
    const targetExists = existsSync(target) && readdirSync(target).length > 0;
    mkdirSync(target, { recursive: true });
    // Only copy structure-scan files so we do not wipe unrelated prompts.
    for (const name of ["structure-scan.md", "_schema.md", "_rules.md"]) {
      const from = join(promptSource, name);
      if (!existsSync(from)) continue;
      cpSync(from, join(target, name));
    }
    if (!targetExists || force) {
      created.push(target);
    }
    promptsInstalled = true;
  }

  return { promptsInstalled, created };
}

export function resolveStructureGraphPackagePath(
  ...segments: string[]
): string | null {
  return resolvePackagePath(...segments);
}
