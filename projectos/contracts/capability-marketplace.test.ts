import { describe, expect, it } from "vitest";

import {
  ACTIVE_MARKETPLACE_KINDS,
  CapabilityKindSchema,
  CapabilityPackMetaSchema,
  CapabilityPackProvenanceSchema,
} from "./capability-marketplace.js";
import { RulesCatalogListingSchema } from "./rules-marketplace.js";

describe("capability marketplace contracts", () => {
  it("exposes active kinds for MCP, Skill, Rules, Agent, Workflow, and Stencil", () => {
    expect(ACTIVE_MARKETPLACE_KINDS).toEqual([
      "mcp",
      "skill",
      "rules",
      "agent",
      "workflow",
      "stencil",
    ]);
    for (const kind of ACTIVE_MARKETPLACE_KINDS) {
      expect(CapabilityKindSchema.parse(kind)).toBe(kind);
    }
  });

  it("parses pack meta with optional dependsOn", () => {
    const meta = CapabilityPackMetaSchema.parse({
      id: "agent.demo",
      name: "Demo Agent",
      version: "1.0.0",
      kind: "agent",
      trustTier: "community",
      dependsOn: { skills: ["curated.ask-mode"], mcpListings: ["curated.demo"] },
    });
    expect(meta.dependsOn?.skills).toEqual(["curated.ask-mode"]);
  });

  it("parses rules listing files and provenance", () => {
    const listing = RulesCatalogListingSchema.parse({
      id: "curated.demo-rules",
      name: "Demo",
      trustTier: "curated",
      version: "1.0.0",
      files: { "a.md": "# A\n" },
    });
    expect(Object.keys(listing.files)).toEqual(["a.md"]);

    const provenance = CapabilityPackProvenanceSchema.parse({
      listingId: listing.id,
      catalogVersion: "1",
      trustTier: listing.trustTier,
      listingVersion: listing.version,
      installedAt: new Date().toISOString(),
      source: "catalog",
      kind: "rules",
    });
    expect(provenance.kind).toBe("rules");
  });
});
