import { describe, expect, it } from "vitest";

import {
  describeOfflineConnector,
  invokeOfflineConnector,
  listOfflineConnectors,
} from "./loop-connector-offline.js";

describe("loop-connector-offline", () => {
  it("lists GitHub/Slack/Lark with local icon keys and non-ready status", () => {
    const list = listOfflineConnectors();
    const kinds = list.map((item) => item.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "github",
        "slack",
        "feishu",
        "lark",
        "sentry",
        "http",
        "webhook",
      ]),
    );
    for (const item of list) {
      expect(item.runtimeStatus).not.toBe("ready");
      expect(item.iconKey).toBeTruthy();
      expect(item.nextStep).toMatch(/Configure|Connect|offline/i);
    }
  });

  it("blocks invoke when auth missing — logo/metadata ≠ executable", () => {
    const github = describeOfflineConnector("github", "auth_missing");
    const result = invokeOfflineConnector(github, "create_pr");
    expect(result).toMatchObject({
      ok: false,
      blocked: true,
      reason: "auth_missing",
    });
    expect(result.message).toMatch(/Connect GitHub/i);
  });

  it("keeps Lark distinct from a generic chat connector", () => {
    const lark = describeOfflineConnector("lark", "unconfigured");
    expect(lark.displayName).toBe("Lark");
    expect(lark.iconKey).toBe("lark");
    expect(lark.capabilities).toContain("post_message");
    const feishu = describeOfflineConnector("feishu", "unconfigured");
    expect(feishu.displayName).toMatch(/Feishu/i);
    expect(feishu.iconKey).toBe("feishu");
    expect(feishu.displayName).not.toBe(lark.displayName);
  });
});
