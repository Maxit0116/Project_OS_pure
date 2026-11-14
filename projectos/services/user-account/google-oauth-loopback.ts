import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { GOOGLE_OAUTH_SCOPES } from "./config.js";

export interface GoogleLoopbackOAuthResult {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

function readRequestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://127.0.0.1");
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

/**
 * Google authorization-code + PKCE via system browser + localhost callback.
 * Scopes are identity-only (openid email profile) — never Gmail API.
 */
export async function runGoogleLoopbackOAuth(options: {
  clientId: string;
  clientSecret?: string;
  port: number;
  codeVerifier: string;
  codeChallenge: string;
  openExternalUrl: (url: string) => Promise<void>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  state?: string;
}): Promise<GoogleLoopbackOAuthResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const state =
    options.state ??
    `pos_g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const redirectUri = `http://127.0.0.1:${options.port}/oauth/callback`;

  return new Promise<GoogleLoopbackOAuthResult>((resolve, reject) => {
    let settled = false;
    const settleError = (error: Error) => {
      if (settled) return;
      settled = true;
      server.close();
      reject(error);
    };
    const settleOk = (result: GoogleLoopbackOAuthResult) => {
      if (settled) return;
      settled = true;
      server.close();
      resolve(result);
    };

    const onAbort = () => settleError(new Error("Google OAuth cancelled"));
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const server = createServer((req, res) => {
      void (async () => {
        try {
          const url = readRequestUrl(req);
          if (url.pathname !== "/oauth/callback") {
            sendHtml(res, 404, "<p>Not found</p>");
            return;
          }
          const error = url.searchParams.get("error");
          if (error) {
            const description =
              url.searchParams.get("error_description") ?? error;
            sendHtml(res, 400, `<p>OAuth error: ${description}</p>`);
            settleError(new Error(description));
            return;
          }
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          if (!code || returnedState !== state) {
            sendHtml(res, 400, "<p>Invalid OAuth callback</p>");
            settleError(new Error("Invalid OAuth callback"));
            return;
          }

          const body = new URLSearchParams({
            client_id: options.clientId,
            code,
            code_verifier: options.codeVerifier,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          });
          if (options.clientSecret) {
            body.set("client_secret", options.clientSecret);
          }

          const tokenResponse = await fetchImpl(
            "https://oauth2.googleapis.com/token",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: body.toString(),
            },
          );
          const json = (await tokenResponse.json()) as Record<string, unknown>;
          const accessToken =
            typeof json.access_token === "string" ? json.access_token : "";
          if (!accessToken) {
            const message =
              typeof json.error_description === "string"
                ? json.error_description
                : "Google token exchange failed";
            sendHtml(res, 500, `<p>${message}</p>`);
            settleError(new Error(message));
            return;
          }

          sendHtml(
            res,
            200,
            "<p>Project OS is signed in with Google. You can close this window.</p>",
          );
          settleOk({
            accessToken,
            ...(typeof json.refresh_token === "string"
              ? { refreshToken: json.refresh_token }
              : {}),
            ...(typeof json.id_token === "string"
              ? { idToken: json.id_token }
              : {}),
            ...(typeof json.expires_in === "number"
              ? { expiresIn: json.expires_in }
              : {}),
          });
        } catch (error) {
          sendHtml(res, 500, "<p>OAuth callback failed</p>");
          settleError(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });

    server.once("error", (error) => {
      settleError(error instanceof Error ? error : new Error(String(error)));
    });

    server.listen(options.port, "127.0.0.1", () => {
      const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorizeUrl.searchParams.set("client_id", options.clientId);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("scope", GOOGLE_OAUTH_SCOPES);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", options.codeChallenge);
      authorizeUrl.searchParams.set("code_challenge_method", "S256");
      authorizeUrl.searchParams.set("access_type", "offline");
      authorizeUrl.searchParams.set("prompt", "select_account consent");
      void options.openExternalUrl(authorizeUrl.toString()).catch((error) => {
        settleError(error instanceof Error ? error : new Error(String(error)));
      });
    });
  });
}

export async function fetchGoogleUserInfo(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}> {
  const response = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google userinfo failed (${response.status})`);
  }
  const json = (await response.json()) as Record<string, unknown>;
  const subject = typeof json.sub === "string" ? json.sub.trim() : "";
  const email = typeof json.email === "string" ? json.email.trim() : "";
  if (!subject || !email) {
    throw new Error("Google userinfo missing sub/email");
  }
  return {
    subject,
    email,
    name: typeof json.name === "string" ? json.name : null,
    avatarUrl: typeof json.picture === "string" ? json.picture : null,
  };
}
