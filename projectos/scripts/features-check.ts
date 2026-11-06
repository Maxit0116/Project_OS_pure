#!/usr/bin/env node
/**
 * Validate one or more on-disk features.json story-map documents.
 *
 * Usage: node dist/scripts/features-check.js <path> [<path>...]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  collectFeaturesIntegrityIssues,
  FeaturesFileSchema,
} from "../contracts/features.js";

function checkPath(pathArg: string): void {
  const absolute = resolve(pathArg);
  const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
  const parsed = FeaturesFileSchema.parse(raw);
  const issues = collectFeaturesIntegrityIssues(parsed);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${absolute}: ${issue.path}: ${issue.message}`);
    }
    throw new Error(`features.json integrity failed for ${absolute}`);
  }
  console.log(
    `features:check ok ${absolute} (epics=${parsed.epics.length}, features=${parsed.features.length})`,
  );
}

function main(argv: string[]): void {
  const paths = argv.slice(2);
  if (paths.length === 0) {
    throw new Error("Usage: features-check <features.json> [<features.json>...]");
  }
  for (const path of paths) checkPath(path);
}

try {
  main(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
