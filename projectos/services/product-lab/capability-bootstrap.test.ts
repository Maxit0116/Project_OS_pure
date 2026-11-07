import { describe, expect, it } from "vitest";
import {
  buildLabCapabilityInventory,
  buildLabCapabilitySearchPrompt,
  buildMarketplaceProposals,
  matchInstalledCapabilities,
  parseLabCapabilitySearchResult,
  pendingInstallProposals,
} from "./capability-bootstrap.js";
import type { LabLaunchProfile } from "../../contracts/product-lab.js";

const nativeProfile: LabLaunchProfile = {
  hasWebPreview: false,
  needsTerminalStart: true,
  needsIdeCapabilities: true,
  capabilityNeeds: ["xcode", "android-emulator"],
  surface: "native",
  suggestedCommands: ["cd macos && swift run"],
  startHints: ["Swift", "Android"],
  rationale: "native_without_web",
};

describe("capability-bootstrap", () => {
  it("matches marketplace listings by keywords", () => {
    const proposals = buildMarketplaceProposals(nativeProfile, [
      {
        id: "community.ios-sim",
        name: "iOS Simulator MCP",
        summary: "Control the Xcode iOS simulator",
        kind: "mcp",
      },
      {
        id: "community.unrelated",
        name: "Weather",
        summary: "forecast",
        kind: "mcp",
      },
    ]);
    expect(proposals.some((p) => p.listingId === "community.ios-sim")).toBe(true);
    expect(
      proposals.some((p) => p.source === "marketplace" && p.need === "xcode"),
    ).toBe(true);
    // Needs without catalog hits still get a builtin stub for the permission UI.
    expect(
      proposals.some(
        (p) => p.source === "builtin" && p.need === "android-emulator",
      ),
    ).toBe(true);
  });

  it("builds a web search prompt and parses lab_capabilities block", () => {
    const prompt = buildLabCapabilitySearchPrompt(nativeProfile, []);
    expect(prompt).toContain("Search the public web");
    expect(prompt).toContain("lab_capabilities");

    const text = [
      "Found one option.",
      "```lab_capabilities",
      JSON.stringify([
        {
          need: "android-emulator",
          kind: "mcp",
          title: "ADB MCP",
          detail: "Launch emulator",
          gitUrl: "https://github.com/example/adb-mcp",
        },
      ]),
      "```",
    ].join("\n");
    const parsed = parseLabCapabilitySearchResult(text, nativeProfile.capabilityNeeds);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.source).toBe("web");
    expect(parsed[0]?.gitUrl).toContain("adb-mcp");
  });

  it("builds inventory with ready installed + pending installables", () => {
    const installed = matchInstalledCapabilities(
      nativeProfile.capabilityNeeds,
      {
        mcpServers: [
          { id: "local.xcode-tools", name: "Xcode MCP", enabled: true },
        ],
      },
    );
    expect(installed.some((h) => h.need === "xcode")).toBe(true);

    const proposals = buildMarketplaceProposals(nativeProfile, [
      {
        id: "community.adb",
        name: "ADB Emulator MCP",
        summary: "Android emulator control",
        kind: "mcp",
      },
    ]);
    const inventory = buildLabCapabilityInventory(
      nativeProfile.capabilityNeeds,
      proposals,
      installed,
    );
    const xcode = inventory.find((i) => i.need === "xcode");
    const android = inventory.find((i) => i.need === "android-emulator");
    expect(xcode?.status).toBe("ready");
    expect(xcode?.bindingTitle).toContain("Xcode");
    expect(android?.status).toBe("installable");
    const pending = pendingInstallProposals(proposals, inventory);
    expect(pending.every((p) => p.need === "android-emulator")).toBe(true);
    expect(pending.some((p) => p.need === "xcode")).toBe(false);
  });
});
