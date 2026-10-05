import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load KEY=VALUE pairs from local .env files into process.env (does not override existing).
 * Used so desktop can pick up PROJECTOS_GITHUB_CLIENT_ID / SECRET without exporting them in the shell.
 */
export function loadDesktopEnvFiles(cwd = process.cwd()): string[] {
  const candidates = [
    resolve(cwd, ".env"),
    resolve(cwd, ".env.local"),
    resolve(cwd, "..", ".env"),
    resolve(cwd, "..", ".env.local"),
  ];
  const loaded: string[] = [];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = value;
    }
    loaded.push(filePath);
  }
  return loaded;
}
