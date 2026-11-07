import { describe, expect, it } from "vitest";

import {
  assertPackKindMatchesTab,
  parseCapabilityPackJson,
} from "./resolve-capability-pack.js";
import { MarketplaceGitUrlError } from "./parse-git-url.js";
import { looksLikeHttpPackJsonUrl } from "./fetch-http-pack.js";

describe("parseCapabilityPackJson", () => {
  it("parses agent pack envelope", () => {
    const envelope = parseCapabilityPackJson(
      JSON.stringify({
        kind: "agent",
        listing: {
          id: "community.demo",
          name: "Demo",
          trustTier: "community",
          version: "1.0.0",
          instructions: "Be helpful.",
          skillIds: [],
        },
      }),
    );
    expect(envelope.kind).toBe("agent");
  });

  it("rejects wrong tab kind", () => {
    const envelope = parseCapabilityPackJson(
      JSON.stringify({
        kind: "rules",
        listing: {
          id: "community.rules",
          name: "Rules",
          trustTier: "community",
          version: "1.0.0",
          files: { "a.md": "# A\n" },
        },
      }),
    );
    expect(() => assertPackKindMatchesTab(envelope, "agents")).toThrow(
      MarketplaceGitUrlError,
    );
  });
});

describe("looksLikeHttpPackJsonUrl", () => {
  it("detects .json https URLs", () => {
    expect(looksLikeHttpPackJsonUrl("https://cdn.example.com/packs/agent.json")).toBe(
      true,
    );
    expect(looksLikeHttpPackJsonUrl("https://github.com/acme/repo")).toBe(false);
  });
});
