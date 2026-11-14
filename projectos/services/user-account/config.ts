export const GOOGLE_OAUTH_SCOPES = "openid email profile";

/** Public OAuth client id may be baked in for desktop installs. */
const BAKED_IN_GOOGLE_CLIENT_ID =
  typeof process.env.PROJECTOS_BAKED_GOOGLE_CLIENT_ID === "string"
    ? process.env.PROJECTOS_BAKED_GOOGLE_CLIENT_ID.trim()
    : "";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret?: string;
  loopbackPort: number;
  configured: boolean;
}

export function resolveGoogleOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleOAuthConfig {
  const clientId = (
    env.PROJECTOS_GOOGLE_CLIENT_ID?.trim() ||
    BAKED_IN_GOOGLE_CLIENT_ID ||
    ""
  ).trim();
  const clientSecret = env.PROJECTOS_GOOGLE_CLIENT_SECRET?.trim() || undefined;
  const portRaw = Number.parseInt(env.PROJECTOS_GOOGLE_OAUTH_PORT ?? "38472", 10);
  const loopbackPort =
    Number.isFinite(portRaw) && portRaw > 0 && portRaw <= 65535 ? portRaw : 38472;

  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    loopbackPort,
    // Desktop Installed apps can use public client + PKCE without secret.
    configured: clientId.length > 0,
  };
}
