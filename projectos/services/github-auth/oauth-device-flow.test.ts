import { describe, expect, it, vi } from "vitest";

import { pollDeviceAccessToken, requestDeviceCode } from "./oauth-device-flow.js";

describe("oauth-device-flow", () => {
  it("requests a device code", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        device_code: "dc",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        verification_uri_complete: "https://github.com/login/device?user_code=ABCD-EFGH",
        expires_in: 900,
        interval: 5,
      }),
    );
    const result = await requestDeviceCode("client", { fetchImpl: fetchImpl as typeof fetch });
    expect(result.userCode).toBe("ABCD-EFGH");
    expect(result.deviceCode).toBe("dc");
    expect(result.interval).toBe(5);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("polls pending / success / denied / expired", async () => {
    const pending = await pollDeviceAccessToken("c", "d", {
      fetchImpl: (async () =>
        Response.json({ error: "authorization_pending" })) as typeof fetch,
    });
    expect(pending).toEqual({ status: "pending" });

    const success = await pollDeviceAccessToken("c", "d", {
      fetchImpl: (async () =>
        Response.json({ access_token: "tok", token_type: "bearer", scope: "repo" })) as typeof fetch,
    });
    expect(success).toEqual({
      status: "success",
      accessToken: "tok",
      tokenType: "bearer",
      scope: "repo",
    });

    const denied = await pollDeviceAccessToken("c", "d", {
      fetchImpl: (async () => Response.json({ error: "access_denied" })) as typeof fetch,
    });
    expect(denied).toEqual({ status: "access_denied" });

    const expired = await pollDeviceAccessToken("c", "d", {
      fetchImpl: (async () => Response.json({ error: "expired_token" })) as typeof fetch,
    });
    expect(expired).toEqual({ status: "expired" });
  });
});
