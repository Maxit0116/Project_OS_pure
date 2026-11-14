import { describe, expect, it } from "vitest";

import { AgentCatalogDocumentSchema } from "../contracts/agent-marketplace.js";
import { readBundledAgentCatalogBody } from "./agent-marketplace/bundled-assets.js";
import { suggestAgentTemplatesFromPrompt } from "./suggest-agent-templates.js";

describe("suggestAgentTemplatesFromPrompt", () => {
  const listings = AgentCatalogDocumentSchema.parse(
    JSON.parse(readBundledAgentCatalogBody()),
  ).listings;

  it("ranks frontend engineer for UI implementation prompts", () => {
    const rows = suggestAgentTemplatesFromPrompt({
      prompt: "Implement a React responsive settings page with reusable components",
      listings,
      limit: 5,
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.listingId).toBe("curated.frontend-engineer");
  });

  it("boosts preferred Loop role", () => {
    const rows = suggestAgentTemplatesFromPrompt({
      prompt: "look at this change",
      listings,
      preferredLoopRole: "reviewer",
      limit: 3,
    });
    expect(rows.some((row) => row.listingId === "curated.code-reviewer")).toBe(true);
  });

  it("returns empty when prompt and role are blank", () => {
    expect(
      suggestAgentTemplatesFromPrompt({ prompt: "   ", listings, limit: 3 }),
    ).toEqual([]);
  });
});
