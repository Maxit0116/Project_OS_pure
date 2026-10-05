import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../skills-templates",
);

export function seedProjectSkills(workspaceRoot: string): void {
  const targetRoot = join(workspaceRoot, ".projectos", "skills");
  if (existsSync(targetRoot) && readdirSync(targetRoot).length > 0) {
    return;
  }
  if (!existsSync(TEMPLATE_ROOT)) return;
  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(TEMPLATE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    cpSync(join(TEMPLATE_ROOT, entry.name), join(targetRoot, entry.name), {
      recursive: true,
    });
  }
}
