import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface GitHubOAuthClientConfigFile {
  clientId?: string;
  clientSecret?: string;
}

export function githubOAuthClientConfigPath(userDataPath: string): string {
  return join(userDataPath, "github-oauth-config.json");
}

export function readOAuthClientConfig(
  userDataPath: string,
): GitHubOAuthClientConfigFile {
  const filePath = githubOAuthClientConfigPath(userDataPath);
  if (!existsSync(filePath)) return {};
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<
      string,
      unknown
    >;
    return {
      ...(typeof raw.clientId === "string" && raw.clientId.trim()
        ? { clientId: raw.clientId.trim() }
        : {}),
      ...(typeof raw.clientSecret === "string" && raw.clientSecret.trim()
        ? { clientSecret: raw.clientSecret.trim() }
        : {}),
    };
  } catch {
    return {};
  }
}

export function writeOAuthClientConfig(
  userDataPath: string,
  patch: GitHubOAuthClientConfigFile,
): GitHubOAuthClientConfigFile {
  const current = readOAuthClientConfig(userDataPath);
  const next: GitHubOAuthClientConfigFile = {
    ...current,
    ...(patch.clientId !== undefined
      ? patch.clientId.trim()
        ? { clientId: patch.clientId.trim() }
        : {}
      : {}),
    ...(patch.clientSecret !== undefined
      ? patch.clientSecret.trim()
        ? { clientSecret: patch.clientSecret.trim() }
        : {}
      : {}),
  };
  if (patch.clientId !== undefined && !patch.clientId.trim()) {
    delete next.clientId;
  }
  if (patch.clientSecret !== undefined && !patch.clientSecret.trim()) {
    delete next.clientSecret;
  }
  const filePath = githubOAuthClientConfigPath(userDataPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
