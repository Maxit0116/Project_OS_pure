import type { GitHubAuthMode } from "../../contracts/github-auth.js";

/** Public OAuth App Client ID may be baked in for Device Flow (no secret). */
const BAKED_IN_GITHUB_CLIENT_ID =
  typeof process.env.PROJECTOS_BAKED_GITHUB_CLIENT_ID === "string"
    ? process.env.PROJECTOS_BAKED_GITHUB_CLIENT_ID.trim()
    : "";

export const GITHUB_OAUTH_SCOPES = "read:user user:email repo";

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret?: string;
  mode: GitHubAuthMode;
  loopbackPort: number;
  configured: boolean;
}

export function resolveGitHubOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: { clientId?: string; clientSecret?: string } = {},
): GitHubOAuthConfig {
  const clientId = (
    overrides.clientId?.trim() ||
    env.PROJECTOS_GITHUB_CLIENT_ID?.trim() ||
    BAKED_IN_GITHUB_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret =
    overrides.clientSecret?.trim() ||
    env.PROJECTOS_GITHUB_CLIENT_SECRET?.trim() ||
    undefined;
  const modeRaw = env.PROJECTOS_GITHUB_OAUTH_MODE?.trim().toLowerCase();
  const mode: GitHubAuthMode = modeRaw === "loopback" ? "loopback" : "device";
  const portRaw = Number.parseInt(env.PROJECTOS_GITHUB_OAUTH_PORT ?? "38471", 10);
  const loopbackPort =
    Number.isFinite(portRaw) && portRaw > 0 && portRaw <= 65535 ? portRaw : 38471;

  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    mode,
    loopbackPort,
    configured: clientId.length > 0 && (mode === "device" || Boolean(clientSecret)),
  };
}
