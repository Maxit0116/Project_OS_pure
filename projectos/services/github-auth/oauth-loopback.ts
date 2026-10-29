import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { GITHUB_OAUTH_SCOPES } from "./config.js";

export interface LoopbackOAuthResult {
  accessToken: string;
}

function readRequestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://127.0.0.1");
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

/**
 * Optional authorize → localhost callback flow (needs Client Secret).
 * Used only when PROJECTOS_GITHUB_OAUTH_MODE=loopback.
 */
export async function runLoopbackOAuth(options: {
  clientId: string;
  clientSecret: string;
  port: number;
  openExternalUrl: (url: string) => Promise<void>;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  state?: string;
}): Promise<LoopbackOAuthResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const state =
    options.state ??
    `pos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const redirectUri = `http://127.0.0.1:${options.port}/oauth/callback`;

  return new Promise<LoopbackOAuthResult>((resolve, reject) => {
    let settled = false;
    const settleError = (error: Error) => {
      if (settled) return;
      settled = true;
      server.close();
      reject(error);
    };
    const settleOk = (accessToken: string) => {
      if (settled) return;
      settled = true;
      server.close();
      resolve({ accessToken });
    };

    const onAbort = () => settleError(new Error("OAuth cancelled"));
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
            sendHtml(res, 400, `<p>OAuth error: ${error}</p>`);
            settleError(new Error(error));
            return;
          }
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          if (!code || returnedState !== state) {
            sendHtml(res, 400, "<p>Invalid OAuth callback</p>");
            settleError(new Error("Invalid OAuth callback"));
            return;
          }
          const tokenResponse = await fetchImpl(
            "https://github.com/login/oauth/access_token",
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                client_id: options.clientId,
                client_secret: options.clientSecret,
                code,
                redirect_uri: redirectUri,
              }).toString(),
            },
          );
          const json = (await tokenResponse.json()) as Record<string, unknown>;
          const accessToken =
            typeof json.access_token === "string" ? json.access_token : "";
          if (!accessToken) {
            const message =
              typeof json.error_description === "string"
                ? json.error_description
                : "token exchange failed";
            sendHtml(res, 500, `<p>${message}</p>`);
            settleError(new Error(message));
            return;
          }
          sendHtml(
            res,
            200,
            "<p>Project OS is signed in. You can close this window.</p>",
          );
          settleOk(accessToken);
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
      const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
      authorizeUrl.searchParams.set("client_id", options.clientId);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("scope", GITHUB_OAUTH_SCOPES);
      authorizeUrl.searchParams.set("state", state);
      void options.openExternalUrl(authorizeUrl.toString()).catch((error) => {
        settleError(error instanceof Error ? error : new Error(String(error)));
      });
    });
  });
}
