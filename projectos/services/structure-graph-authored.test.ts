import { describe, expect, it, vi } from "vitest";

import type { ProjectGraph } from "../contracts/graph.js";
import type { ModelProfile } from "../contracts/settings.js";
import type { ModelGateway } from "./model-gateway/index.js";
import {
  isAuthoredGraph,
  runStructureGraphAiScan,
} from "./structure-graph-ai-scan.js";

function mockProfile(): ModelProfile {
  return {
    id: "model_mock",
    name: "Mock",
    provider: "custom",
    apiFormat: "openai_chat",
    model: "mock",
    baseUrl: "http://127.0.0.1:9",
    apiKeyRef: "secret://mock",
    isDefault: true,
  } as ModelProfile;
}

function authoredGraph(): ProjectGraph {
  return {
    version: "0.4.0",
    projectId: "p1",
    projectName: "Authored",
    projectType: "node",
    analyzedAt: "2026-01-01T00:00:00.000Z",
    analysisStatus: "complete",
    authored: true,
    architecture: {
      notation: "c4",
      defaultLevel: "context",
      layers: [
        {
          id: "application",
          label: "Application",
          order: 0,
          description: "App",
        },
      ],
    },
    nodes: [
      {
        id: "system_root",
        type: "capability",
        name: "Keep Me",
        status: "active",
        description: "System",
        summary: "System",
        responsibility: "Owns product",
        elementType: "software_system",
        level: "context",
        layer: "application",
        linkedFiles: [],
        upstream: [],
        downstream: [],
        confidence: 0.95,
        tags: ["ai-scan"],
        children: [],
      },
    ],
    edges: [],
    fileIndex: [],
  };
}

describe("authored graph guard", () => {
  it("detects authored flag and product-authored tags", () => {
    expect(isAuthoredGraph(authoredGraph())).toBe(true);
    const tagged = authoredGraph();
    tagged.authored = false;
    tagged.nodes[0]!.tags = ["product-authored"];
    expect(isAuthoredGraph(tagged)).toBe(true);
  });

  it("skips regenerate when authored unless force is set", async () => {
    const graph = authoredGraph();
    const complete = vi.fn();
    const skipped = await runStructureGraphAiScan({
      workspaceRoot: "/tmp/does-not-matter",
      projectId: "p1",
      displayName: "Authored",
      graph,
      profile: mockProfile(),
      gateway: { complete } as unknown as ModelGateway,
      scanMode: "regenerate",
      userInitiated: true,
      force: false,
    });
    expect(skipped.nodes[0]?.name).toBe("Keep Me");
    expect(complete).not.toHaveBeenCalled();
  });
});
