import { describe, expect, it } from "vitest";

import {
  BeginGoogleOAuthResultSchema,
  UserAccountStatusSchema,
} from "./user-account.js";

describe("user-account contracts", () => {
  it("parses signed-out status", () => {
    expect(
      UserAccountStatusSchema.parse({
        connected: false,
        googleOAuthConfigured: false,
      }),
    ).toEqual({
      connected: false,
      googleOAuthConfigured: false,
    });
  });

  it("parses google connected status", () => {
    const status = UserAccountStatusSchema.parse({
      connected: true,
      provider: "google",
      displayName: "Terran",
      login: "terran",
      email: "terran@gmail.com",
      avatarUrl: "https://example.com/a.png",
      connectedAt: "2026-11-12T00:00:00.000Z",
      googleOAuthConfigured: true,
      googleOAuthPending: false,
    });
    expect(status.provider).toBe("google");
  });

  it("parses begin google oauth result", () => {
    const result = BeginGoogleOAuthResultSchema.parse({
      kind: "pending",
      status: { connected: false, googleOAuthPending: true },
    });
    expect(result.kind).toBe("pending");
  });
});
