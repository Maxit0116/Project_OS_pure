import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { LOOP_GRAPH_PRESETS } from "../contracts/loop-presets.js";
import type { WorkflowCatalogListing } from "../contracts/workflow-marketplace.js";
import {
  exportWorkflowPackFromDraft,
  installWorkflowFromListing,
  listInstalledWorkflowListingIds,
  listMergedLoopGraphPresets,
  resolveLoopGraphPreset,
  sanitizeIntentGraphForPack,
  uninstallWorkflowFromListing,
} from "./workflow-catalog-service.js";

const listing: WorkflowCatalogListing = {
  id: "community.test-flow",
  name: "Test Flow",
  description: "A test workflow",
  trustTier: "community",
  version: "1.0.0",
  draft: {
    revision: 1,
    graphPrompt: "Do the thing",
    nodes: [
      {
        id: "n1",
        title: "Planner",
        prompt: "Plan",
        type: "agent",
        agentRole: "planner",
        position: { x: 0, y: 0 },
        authoringSessionId: "sess_should_strip",
        agentDefinitionId: "agent_should_strip",
      },
    ],
    edges: [],
  },
};

describe("workflow-catalog-service", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "wf-cat-"));
    roots.push(root);
    return root;
  }

  it("sanitizes authoringSessionId and agentDefinitionId from packs", () => {
    const cleaned = sanitizeIntentGraphForPack(listing.draft);
    expect(cleaned.nodes[0]).not.toHaveProperty("authoringSessionId");
    expect(cleaned.nodes[0]).not.toHaveProperty("agentDefinitionId");
  });

  it("installs under .projectos/loop-presets without mutating builtins", async () => {
    const workspaceRoot = await tempRoot();
    const before = LOOP_GRAPH_PRESETS.length;
    const preset = installWorkflowFromListing({
      workspaceRoot,
      listing,
      catalogVersion: "1",
      source: "catalog",
    });
    expect(preset.id).toBe("community.test-flow");
    expect(LOOP_GRAPH_PRESETS.length).toBe(before);

    const merged = listMergedLoopGraphPresets(workspaceRoot);
    expect(merged.builtins).toHaveLength(before);
    expect(merged.user.map((entry) => entry.id)).toContain("community.test-flow");
    expect(listInstalledWorkflowListingIds(workspaceRoot)).toEqual([
      "community.test-flow",
    ]);

    const resolved = resolveLoopGraphPreset(workspaceRoot, "community.test-flow");
    expect(resolved?.title).toBe("Test Flow");
    expect(resolved?.draft.nodes[0]).not.toHaveProperty("authoringSessionId");

    const onDisk = JSON.parse(
      await readFile(
        join(workspaceRoot, ".projectos", "loop-presets", "community.test-flow.json"),
        "utf8",
      ),
    );
    expect(onDisk.provenance.kind).toBe("workflow");
    expect(onDisk.provenance.listingId).toBe("community.test-flow");

    uninstallWorkflowFromListing({
      workspaceRoot,
      listingId: "community.test-flow",
    });
    expect(listInstalledWorkflowListingIds(workspaceRoot)).toEqual([]);
    expect(resolveLoopGraphPreset(workspaceRoot, "community.test-flow")).toBeNull();
    expect(resolveLoopGraphPreset(workspaceRoot, LOOP_GRAPH_PRESETS[0]!.id)?.id).toBe(
      LOOP_GRAPH_PRESETS[0]!.id,
    );
  });

  it("exports a shareable workflow pack from a draft", () => {
    const exported = exportWorkflowPackFromDraft({
      title: "My Loop",
      description: "Exported",
      draft: listing.draft,
      sourceLoopId: "loop_abc123",
    });
    expect(exported.listing.trustTier).toBe("community");
    expect(exported.listing.draft.nodes[0]).not.toHaveProperty("authoringSessionId");
    expect(exported.packJson).toContain('"kind": "workflow"');
  });
});
