import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RULES_DIR = ".projectos/rules";
const MAX_RULE_FILES = 32;
const MAX_RULE_CHARS = 24_000;

/**
 * Load always-on project rules from `.projectos/rules/` (recursive `.md` files).
 * Missing directory → empty string (not an error).
 */
export function loadProjectRulesMarkdown(workspaceRoot: string): string {
  const root = join(workspaceRoot, RULES_DIR);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return "";
  }
  const files: string[] = [];
  collectMarkdownFiles(root, files);
  files.sort((a, b) => a.localeCompare(b));
  const chunks: string[] = [];
  let total = 0;
  for (const absolute of files.slice(0, MAX_RULE_FILES)) {
    let body: string;
    try {
      body = readFileSync(absolute, "utf8").trim();
    } catch {
      continue;
    }
    if (!body) continue;
    const relative = absolute.slice(root.length).replace(/^[/\\]/u, "");
    const chunk = `### ${relative}\n\n${body}`;
    if (total + chunk.length > MAX_RULE_CHARS) {
      chunks.push(`### ${relative}\n\n(truncated: project rules budget exceeded)`);
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return chunks.join("\n\n");
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
