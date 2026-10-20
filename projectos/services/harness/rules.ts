import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RULES_DIR = ".projectos/rules";
const MAX_RULE_FILES = 32;
export const MAX_RULE_CHARS = 24_000;

export interface LoadProjectRulesOptions {
  /** Bundle files and file/folder pins. Globs match these paths only. */
  activePaths?: readonly string[];
  /** Relative paths under `.projectos/rules` that the user pinned. */
  manualRulePaths?: readonly string[];
  maxChars?: number;
}

export interface LoadedProjectRules {
  markdown: string;
  omissions: Array<{ reason: "rules_budget" | "rules_frontmatter"; count: number }>;
}

interface ParsedRule {
  relativePath: string;
  activation: "always" | "globs" | "manual";
  globs: string[];
  description: string;
  body: string;
  invalidFrontmatter: boolean;
}

/**
 * Load project rules from `.projectos/rules/` (recursive `.md` files).
 * Missing directory → empty string (not an error).
 * Files without frontmatter stay always-on.
 */
export function loadProjectRulesMarkdown(workspaceRoot: string): string {
  return loadProjectRules(workspaceRoot).markdown;
}

export function loadProjectRules(
  workspaceRoot: string,
  options: LoadProjectRulesOptions = {},
): LoadedProjectRules {
  const root = join(workspaceRoot, RULES_DIR);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return { markdown: "", omissions: [] };
  }
  const files: string[] = [];
  collectMarkdownFiles(root, files);
  files.sort((a, b) => a.localeCompare(b));
  const rules = files.slice(0, MAX_RULE_FILES).flatMap((absolute) => {
    let raw: string;
    try {
      raw = readFileSync(absolute, "utf8");
    } catch {
      return [];
    }
    const relative = absolute.slice(root.length).replace(/^[/\\]/u, "").replaceAll("\\", "/");
    const parsed = parseRule(relative, raw);
    return parsed.body || parsed.description ? [parsed] : [];
  });

  const activePaths = (options.activePaths ?? []).map(normalizePath);
  const manual = new Set((options.manualRulePaths ?? []).map(normalizePath));
  const frontmatterCount = rules.filter((rule) => rule.invalidFrontmatter).length;
  const always: string[] = [];
  const globs: string[] = [];
  const manuals: string[] = [];
  const index: string[] = [];

  for (const rule of rules) {
    const chunk = `### ${rule.relativePath}\n\n${rule.body}`;
    if (rule.activation === "always") {
      always.push(chunk);
      continue;
    }
    const globHit = rule.activation === "globs" && rule.globs.some((pattern) =>
      activePaths.some((filePath) => pathMatchesRuleGlob(filePath, pattern)),
    );
    const manualHit = rule.activation === "manual" && manual.has(rule.relativePath);
    if (globHit) globs.push(chunk);
    else if (manualHit) manuals.push(chunk);
    else if (rule.description) index.push(`- ${rule.relativePath} — ${rule.description}`);
  }

  const pieces = [...always, ...globs, ...manuals, ...index];
  const maxChars = options.maxChars ?? MAX_RULE_CHARS;
  let dropped = 0;
  while (pieces.length > 0 && pieces.join("\n\n").length > maxChars) {
    const last = pieces[pieces.length - 1] ?? "";
    if (pieces.length === 1 && last.length > maxChars) {
      pieces[0] = `${last.slice(0, maxChars)}\n\n(truncated: project rules budget exceeded)`;
      dropped += 1;
      break;
    }
    pieces.pop();
    dropped += 1;
  }

  const omissions: LoadedProjectRules["omissions"] = [];
  if (frontmatterCount > 0) omissions.push({ reason: "rules_frontmatter", count: frontmatterCount });
  if (dropped > 0) omissions.push({ reason: "rules_budget", count: dropped });
  return { markdown: pieces.join("\n\n"), omissions };
}

export function pathMatchesRuleGlob(filePath: string, pattern: string): boolean {
  const path = normalizePath(filePath);
  const glob = normalizePath(pattern);
  if (globToRegExp(glob).test(path)) return true;
  const staticPrefix = glob.split("*")[0]?.replace(/\/$/u, "") ?? "";
  if (!staticPrefix) return false;
  return path === staticPrefix || path.startsWith(`${staticPrefix}/`);
}

function parseRule(relativePath: string, raw: string): ParsedRule {
  const trimmed = raw.trim();
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(trimmed);
  if (!match) {
    return {
      relativePath,
      activation: "always",
      globs: [],
      description: "",
      body: trimmed,
      invalidFrontmatter: false,
    };
  }
  const frontmatter = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const activation = readField(frontmatter, "activation");
  const description = readField(frontmatter, "description");
  const globs = readGlobs(frontmatter);
  const validActivation = activation === "always" || activation === "globs" || activation === "manual";
  if (!validActivation || (activation === "globs" && globs.length === 0)) {
    return {
      relativePath,
      activation: "always",
      globs: [],
      description,
      body: body || trimmed,
      invalidFrontmatter: true,
    };
  }
  return {
    relativePath,
    activation,
    globs,
    description,
    body,
    invalidFrontmatter: false,
  };
}

function readField(frontmatter: string, key: string): string {
  const line = frontmatter.split(/\r?\n/u).find((entry) => entry.startsWith(`${key}:`));
  if (!line) return "";
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/gu, "");
}

function readGlobs(frontmatter: string): string[] {
  const line = frontmatter.split(/\r?\n/u).find((entry) => entry.startsWith("globs:"));
  if (!line) return [];
  const value = line.slice("globs:".length).trim();
  if (value.startsWith("[")) {
    return [...value.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1] ?? "").filter(Boolean);
  }
  return value ? [value.replace(/^["']|["']$/gu, "")] : [];
}

function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? "";
    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      if (pattern[index + 1] === "/") index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    source += /[.+^${}()|[\]\\?]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`^${source}$`, "u");
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function projectRuleLoadOptions(input: {
  filePaths?: readonly string[];
  attachments?: ReadonlyArray<{ ref: { kind: string; path?: string } }>;
}): LoadProjectRulesOptions {
  const activePaths = [...(input.filePaths ?? [])];
  const manualRulePaths: string[] = [];
  for (const attachment of input.attachments ?? []) {
    const path = attachment.ref.path;
    if (!path) continue;
    if (attachment.ref.kind === "file" || attachment.ref.kind === "folder" || attachment.ref.kind === "selection") {
      activePaths.push(path);
    }
    if (attachment.ref.kind === "rule") manualRulePaths.push(path);
  }
  return { activePaths, manualRulePaths };
}

export function filePathsFromContextBundle(bundle: unknown): string[] {
  if (!bundle || typeof bundle !== "object" || !("fileManifest" in bundle)) return [];
  const manifest = (bundle as { fileManifest?: unknown }).fileManifest;
  if (!Array.isArray(manifest)) return [];
  return manifest.flatMap((file) => {
    if (!file || typeof file !== "object" || !("path" in file)) return [];
    const path = (file as { path?: unknown }).path;
    return typeof path === "string" ? [path] : [];
  });
}

export function listProjectRuleHeads(
  workspaceRoot: string,
): Array<{ path: string; description: string }> {
  const root = join(workspaceRoot, RULES_DIR);
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  const files: string[] = [];
  collectMarkdownFiles(root, files);
  files.sort((a, b) => a.localeCompare(b));
  return files.flatMap((absolute) => {
    let raw = "";
    try {
      raw = readFileSync(absolute, "utf8");
    } catch {
      return [];
    }
    const relative = absolute.slice(root.length).replace(/^[/\\]/u, "").replaceAll("\\", "/");
    const parsed = parseRule(relative, raw);
    return [{ path: parsed.relativePath, description: parsed.description }];
  });
}

function collectMarkdownFiles(dir: string, out: string[]): void {
  if (out.length >= MAX_RULE_FILES) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= MAX_RULE_FILES) return;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(full, out);
      continue;
    }
    if (entry.isFile() && /\.md$/iu.test(entry.name)) {
      out.push(full);
    }
  }
}
