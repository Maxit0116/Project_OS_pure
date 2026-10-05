import { describe, expect, it } from "vitest";

import { createMockSampleWorkspace } from "../client/mock-project-os-api-client.js";
import { resolveFileOwnerScope } from "./file-owner-resolution.js";

describe("file owner resolution", () => {
  it("resolves the sole owner even when the preferred node is stale", () => {
    const workspace = createMockSampleWorkspace();
    const resolved = resolveFileOwnerScope(
      workspace,
      "app/login/page.tsx",
      "missing_node",
    );

    expect(resolved).toMatchObject({
      nodeId: "feat_login",
      selectedFilePath: "app/login/page.tsx",
      candidateNodeIds: ["feat_login"],
    });
  });

  it("honors a valid preferred owner for a multi-node file", () => {
    const workspace = workspaceWithAmbiguousLoginFile();
    expect(resolveFileOwnerScope(
      workspace,
      "app/login/page.tsx",
      "feat_profile",
    )).toMatchObject({ nodeId: "feat_profile" });
  });

  it("returns candidate ids when multi-node ownership is ambiguous", () => {
    const workspace = workspaceWithAmbiguousLoginFile();

    expect(() => resolveFileOwnerScope(
      workspace,
      "app/login/page.tsx",
      "missing_node",
    )).toThrowError(expect.objectContaining({
      code: "ownership_ambiguous",
      details: {
        selectedFilePath: "app/login/page.tsx",
        candidateNodeIds: ["feat_login", "feat_profile"],
      },
    }));
  });

  it("rejects a file with no functional owner", () => {
    const workspace = createMockSampleWorkspace();
    workspace.graph.fileIndex.push({
      path: "orphan.ts",
      type: "other",
      nodeIds: [],
      imports: [],
      exports: [],
    });

    expect(() => resolveFileOwnerScope(
      workspace,
      "orphan.ts",
      "feat_login",
    )).toThrowError(expect.objectContaining({
      code: "file_owner_not_found",
      details: {
        selectedFilePath: "orphan.ts",
        candidateNodeIds: [],
      },
    }));
  });
});

function workspaceWithAmbiguousLoginFile() {
  const workspace = createMockSampleWorkspace();
  const path = "app/login/page.tsx";
  const profile = workspace.graph.nodes.find((node) => node.id === "feat_profile")!;
  profile.linkedFiles.push({ path, role: "supporting" });
  const file = workspace.graph.fileIndex.find((entry) => entry.path === path)!;
  file.nodeIds = ["feat_login", "feat_profile"];
  return workspace;
}
