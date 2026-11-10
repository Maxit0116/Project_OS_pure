import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ContextPayloadSchema } from "../contracts/context.js";
import { ProjectGraphSchema } from "../contracts/graph.js";
import { PromptRefinementSchema } from "../contracts/prompt-refinement.js";
import { ProjectOSProjectSchema } from "../contracts/project.js";
import { SemanticTreeSchema } from "../contracts/semantic-tree.js";
import { ProjectOSLocalApi } from "../services/index.js";
import {
  MOCK_SAMPLE_WORKSPACE_ROOT,
  MockProjectOSApiClient,
} from "./mock-project-os-api-client.js";
import settingsFixture from "./sample-projectos-fixtures/settings.json" with {
  type: "json",
};
import { copySampleTree } from "../test-support/copy-sample.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const googleLoginPrompt =
  "Add Google login and redirect users to profile after successful sign in.";
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("MockProjectOSApiClient parity", () => {
  it("returns schema-valid, shape-consistent data for the frontend mock path", async () => {
    const real = new ProjectOSLocalApi({ sampleWorkspaceRoot: copySampleWorkspace() });
    const mock = new MockProjectOSApiClient();

    const realProject = ProjectOSProjectSchema.parse(await real.openSampleWorkspace());
    const mockProject = ProjectOSProjectSchema.parse(await mock.openSampleWorkspace());
    const realGraph = ProjectGraphSchema.parse(
      await real.getProjectGraph(realProject.projectId),
    );
    const mockGraph = ProjectGraphSchema.parse(
      await mock.getProjectGraph(mockProject.projectId),
    );
    const realTree = SemanticTreeSchema.parse(
      await real.getSemanticTree(realProject.projectId),
    );
    const mockTree = SemanticTreeSchema.parse(
      await mock.getSemanticTree(mockProject.projectId),
    );
    const realContext = ContextPayloadSchema.parse(
      await real.getNodeContext(realProject.projectId, "feat_login"),
    );
    const mockContext = ContextPayloadSchema.parse(
      await mock.getNodeContext(mockProject.projectId, "feat_login"),
    );
    const realRefinement = PromptRefinementSchema.parse(
      await real.refinePrompt({
        projectId: realProject.projectId,
        nodeId: "feat_login",
        rawPrompt: googleLoginPrompt,
      }),
    );
    const mockRefinement = PromptRefinementSchema.parse(
      await mock.refinePrompt({
        projectId: mockProject.projectId,
        nodeId: "feat_login",
        rawPrompt: googleLoginPrompt,
      }),
    );

    // Mock uses a stable sentinel root; real openSampleWorkspace uses a temp copy.
    expect(mockProject.workspaceRoot).toBe(MOCK_SAMPLE_WORKSPACE_ROOT);
    expect({ ...mockProject, workspaceRoot: realProject.workspaceRoot }).toEqual(
      realProject,
    );
    expect(mockGraph.nodes.map((node) => node.id)).toEqual(
      realGraph.nodes.map((node) => node.id),
    );
    expect(mockGraph.edges.map((edge) => edge.id)).toEqual(
      realGraph.edges.map((edge) => edge.id),
    );
    expect(mockTree.roots.map((root) => root.id)).toEqual(
      realTree.roots.map((root) => root.id),
    );
    expect(mockContext.scope).toBe(realContext.scope);
    expect(mockContext.nodeId).toBe(realContext.nodeId);
    expect(mockContext.linkedFiles.map((file) => file.path)).toEqual(
      realContext.linkedFiles.map((file) => file.path),
    );
    expect(mockRefinement).toEqual(realRefinement);
  });
});

function copySampleWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-client-"));
  temporaryRoots.push(tempRoot);
  const tempWorkspaceRoot = join(tempRoot, "sample-graph-saas");
  copySampleTree(sampleWorkspaceRoot, tempWorkspaceRoot);
  // Keep refinement on the mock's deterministic fixture path. Deleting settings is
  // not enough: bootstrap re-seeds model profiles from the sample workspace when
  // modelProfiles is empty (including local untracked sample settings.json).
  writeFileSync(
    join(tempWorkspaceRoot, ".projectos", "settings.json"),
    JSON.stringify(
      {
        ...settingsFixture,
        execution: {
          ...settingsFixture.execution,
          mode: "fixture",
        },
        modelProfiles: [
          {
            id: "parity-seed-block",
            name: "Parity Seed Block",
            provider: "custom",
            apiFormat: "openai_chat",
            displayName: "Parity Seed Block",
            model: "none",
            baseUrl: "https://example.invalid",
            apiKeyRef: "model_profile:parity-seed-block",
            isDefault: true,
          },
        ],
      },
      null,
      2,
    ),
  );
  return tempWorkspaceRoot;
}
