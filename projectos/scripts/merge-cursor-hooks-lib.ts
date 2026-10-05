/**
 * Shared Cursor hooks.json merge for Project OS features staleness hook.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FEATURES_HOOK_MARKER = "projectos-features-staleness";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveCheckStalenessScript(fromHere = dirname(fileURLToPath(import.meta.url))): string {
  const candidates = [
    resolve(fromHere, "../features/hooks/check-staleness.mjs"),
    resolve(fromHere, "../../features/hooks/check-staleness.mjs"),
    resolve(fromHere, "../hooks/check-staleness.mjs"),
  ];
  const hit = candidates.find((path) => existsSync(path));
  if (!hit) {
    throw new Error("Could not locate features/hooks/check-staleness.mjs");
  }
  return hit;
}

export function mergeCursorFeaturesHook(
  workspaceRoot: string,
  options?: { uninstall?: boolean; scriptPath?: string },
): { hooksPath: string; action: "merged" | "removed" } {
  const root = resolve(workspaceRoot);
  const cursorDir = join(root, ".cursor");
  const hooksPath = join(cursorDir, "hooks.json");
  mkdirSync(cursorDir, { recursive: true });

  let doc: Record<string, unknown> = {};
  if (existsSync(hooksPath)) {
    const parsed = JSON.parse(readFileSync(hooksPath, "utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`Invalid hooks.json at ${hooksPath}`);
    }
    doc = parsed;
  }

  const stop = Array.isArray(doc.stop) ? [...doc.stop] : [];
  const withoutOurs = stop.filter((entry) => {
    if (!isRecord(entry)) return true;
    return (
      entry[FEATURES_HOOK_MARKER] !== true &&
      entry.command !== "projectos-features-check-staleness"
    );
  });

  const uninstall = options?.uninstall === true;
  if (!uninstall) {
    const scriptPath = options?.scriptPath ?? resolveCheckStalenessScript();
    withoutOurs.push({
      [FEATURES_HOOK_MARKER]: true,
      command: "projectos-features-check-staleness",
      type: "command",
      run: `node ${JSON.stringify(scriptPath)}`,
    });
  }

  doc.stop = withoutOurs;
  writeFileSync(hooksPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return { hooksPath, action: uninstall ? "removed" : "merged" };
}
