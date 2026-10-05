#!/usr/bin/env node
/**
 * Merge Project OS features stop-hook into .cursor/hooks.json (idempotent).
 *
 * Usage:
 *   node dist/scripts/merge-cursor-hooks.js <workspaceRoot> [--uninstall]
 */

import { mergeCursorFeaturesHook } from "./merge-cursor-hooks-lib.js";

function main(argv: string[]): number {
  const uninstall = argv.includes("--uninstall");
  const workspace = argv.find((arg) => !arg.startsWith("-"));
  if (!workspace) {
    console.error("Usage: merge-cursor-hooks <workspaceRoot> [--uninstall]");
    return 2;
  }

  try {
    const result = mergeCursorFeaturesHook(workspace, { uninstall });
    console.log(
      result.action === "removed"
        ? `Removed Project OS features hook from ${result.hooksPath}`
        : `Merged Project OS features hook into ${result.hooksPath}`,
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exit(main(process.argv.slice(2)));
