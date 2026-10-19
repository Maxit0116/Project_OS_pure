import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ToolPermissionDocumentSchema,
  type ToolPermissionDocument,
  type ToolPermissionRule,
} from "../../contracts/tool-policy.js";

const PERMISSIONS_FILE = ".projectos/permissions.json";

/**
 * Load project permission rules. Missing / invalid file → empty rules
 * (built-in ToolPolicy defaults still apply).
 */
export function loadToolPermissionDocument(
  workspaceRoot: string,
): ToolPermissionDocument {
  const absolute = join(workspaceRoot, PERMISSIONS_FILE);
  if (!existsSync(absolute)) {
    return { version: "0.1.0", rules: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
    return ToolPermissionDocumentSchema.parse(raw);
  } catch {
    return { version: "0.1.0", rules: [] };
  }
}

export function matchPermissionGlob(pattern: string, value: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
      .replace(/\*/gu, ".*")
      .replace(/\?/gu, ".")}$`,
    "u",
  );
  return regex.test(value);
}

/**
 * Resolve Deny > Ask > Allow among matching rules.
 * Returns undefined when no rule matches (caller uses built-in defaults).
 */
export function resolvePermissionRules(
  rules: readonly ToolPermissionRule[],
  tool: string,
  match?: string,
): ToolPermissionRule["effect"] | undefined {
  const matched = rules.filter((rule) => {
    if (rule.tool !== "*" && rule.tool !== tool) return false;
    if (!rule.match) return true;
    if (!match) return false;
    return matchPermissionGlob(rule.match, match);
  });
  if (matched.length === 0) return undefined;
  if (matched.some((rule) => rule.effect === "deny")) return "deny";
  if (matched.some((rule) => rule.effect === "ask")) return "ask";
  if (matched.some((rule) => rule.effect === "allow")) return "allow";
  return undefined;
}
