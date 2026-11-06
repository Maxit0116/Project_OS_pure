import { describe, expect, it } from "vitest";

import {
  InstallFromGitUrlInputSchema,
  InstallFromGitUrlResultSchema,
  MarketplaceGitInstallKindSchema,
} from "./marketplace-git-install.js";

describe("marketplace-git-install contracts (P6)", () => {
  it("accepts all six install kinds", () => {
    expect(MarketplaceGitInstallKindSchema.options).toEqual([
      "mcp",
      "skills",
      "rules",
      "agents",
      "workflows",
      "stencils",
    ]);
  });

  it("parses install input for rules and agents", () => {
    expect(
      InstallFromGitUrlInputSchema.parse({
        url: "https://github.com/acme/rules",
        kind: "rules",
      }).kind,
    ).toBe("rules");
    expect(
      InstallFromGitUrlInputSchema.parse({
        url: "https://example.com/pack.json",
        kind: "agents",
        replace: true,
      }).replace,
    ).toBe(true);
  });

  it("parses installed ok results for new kinds", () => {
    expect(
      InstallFromGitUrlResultSchema.parse({
        status: "installed",
        kind: "rules",
        packId: "git.demo",
        sourceUrl: "https://github.com/acme/rules",
      }).kind,
    ).toBe("rules");
    expect(
      InstallFromGitUrlResultSchema.parse({
        status: "installed",
        kind: "agents",
        listingId: "community.demo-agent",
        sourceUrl: "https://example.com/agent.json",
      }).kind,
    ).toBe("agents");
    expect(
      InstallFromGitUrlResultSchema.parse({
        status: "installed",
        kind: "workflows",
        listingId: "community.demo-flow",
        sourceUrl: "https://example.com/flow.json",
      }).kind,
    ).toBe("workflows");
    expect(
      InstallFromGitUrlResultSchema.parse({
        status: "installed",
        kind: "stencils",
        listingId: "community.demo-stencils",
        sourceUrl: "https://example.com/stencils.json",
      }).kind,
    ).toBe("stencils");
  });
});
