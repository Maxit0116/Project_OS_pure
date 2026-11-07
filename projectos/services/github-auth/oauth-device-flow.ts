import { GITHUB_OAUTH_SCOPES } from "./config.js";

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export type DeviceTokenPollResult =
  | { status: "pending" }
  | { status: "slow_down"; interval: number }
  | { status: "access_denied" }
  | { status: "expired" }
  | { status: "error"; message: string }
  | { status: "success"; accessToken: string; tokenType?: string; scope?: string };

function formBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export async function requestDeviceCode(
  clientId: string,
  options: {
    scope?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<DeviceCodeResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
      client_id: clientId,
      scope: options.scope ?? GITHUB_OAUTH_SCOPES,
    }),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof json.device_code !== "string") {
    const error =
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json.error === "string"
          ? json.error
          : `device code request failed (${response.status})`;
    throw new Error(error);
  }
  const verificationUri =
    typeof json.verification_uri === "string"
      ? json.verification_uri
      : "https://github.com/login/device";
  const verificationUriComplete =
    typeof json.verification_uri_complete === "string"
      ? json.verification_uri_complete
      : undefined;
  return {
    deviceCode: json.device_code,
    userCode: String(json.user_code ?? ""),
    verificationUri,
    ...(verificationUriComplete ? { verificationUriComplete } : {}),
    expiresIn: Number(json.expires_in) || 900,
    interval: Math.max(5, Number(json.interval) || 5),
  };
}

export async function pollDeviceAccessToken(
  clientId: string,
  deviceCode: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<DeviceTokenPollResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const json = (await response.json()) as Record<string, unknown>;
  if (typeof json.access_token === "string" && json.access_token.length > 0) {
    return {
      status: "success",
      accessToken: json.access_token,
      ...(typeof json.token_type === "string" ? { tokenType: json.token_type } : {}),
      ...(typeof json.scope === "string" ? { scope: json.scope } : {}),
    };
  }
  const error = typeof json.error === "string" ? json.error : "unknown_error";
  if (error === "authorization_pending") return { status: "pending" };
  if (error === "slow_down") {
    const interval = Math.max(5, Number(json.interval) || 10);
    return { status: "slow_down", interval };
  }
  if (error === "access_denied") return { status: "access_denied" };
  if (error === "expired_token") return { status: "expired" };
  const message =
    typeof json.error_description === "string" ? json.error_description : error;
  return { status: "error", message };
}
