import { describe, expect, it } from "vitest";

import {
  AgentResponseLanguageSchema,
  AgentRunSchema,
  ApplyBackupManifestSchema,
  ApplyBackupManifestV3Schema,
  ApplyBackupManifestV4Schema,
  classifyApplyBackupRestoreAuthority,
  CreateMapImageArtifactInputSchema,
  FileEntrySchema,
  FunctionalNodeSchema,
  GeneratedDiffFileSchema,
  GraphProductOverlaySchema,
  HarnessHypothesisSchema,
  InternalResourceWriteAuthorizationSchema,
  MapContentDocumentSchema,
  MapWorkGroupSchema,
  ModelGatewayRequestSchema,
  ModelGatewayResponseSchema,
  ModelProfileSchema,
  ModelRequestPayloadSchema,
  ProjectOSSettingsSchema,
  PromptRefinementSchema,
  ReorderMapArtifactStackInputSchema,
  RestoreApplyResultSchema,
  SemanticTreeSchema,
  UrlItemSchema,
  WriteAuthorizationSchema,
} from "./index.js";

const sha256 = `sha256:${"a".repeat(64)}`;

function noteArtifact(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: "note" as const,
    scope: "project" as const,
    position: { x: 0, y: 0 },
    size: { width: 280, height: 160 },
    note: { body: id },
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    ...extra,
  };
}

function validNode() {
  return {
    id: "node_a",
    type: "capability" as const,
    name: "Node A",
    status: "active" as const,
    description: "Description",
    summary: "Summary",
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 0.75,
    tags: [],
  };
}

function validSettings() {
  return {
    version: "0.1.0" as const,
    projectId: "project_test",
    presentationMode: false,
    execution: {
      mode: "model" as const,
      thinkingDepth: "medium" as const,
      changeExecutionPolicy: "review_first" as const,
    },
    modelProfiles: [],
    agentProfiles: [],
  };
}

describe("contracts schema hardening", () => {
  it("rejects duplicate stack reorder ids", () => {
    expect(ReorderMapArtifactStackInputSchema.safeParse({
      orderedArtifactIds: ["art_a", "art_a"],
    }).success).toBe(false);
    expect(ReorderMapArtifactStackInputSchema.safeParse({
      orderedArtifactIds: ["art_a", "art_b"],
    }).success).toBe(true);
  });

  it("allows only safe URL schemes or relative URLs", () => {
    for (const url of [
      "https://example.test/docs",
      "http://127.0.0.1:3000/dashboard",
      "mailto:team@example.test",
      "/docs/getting-started",
      "./relative/page",
      "#section",
    ]) {
      expect(UrlItemSchema.safeParse({ id: "url_1", url }).success, url).toBe(true);
    }
    for (const url of [
      "javascript:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///tmp/secret",
      "//evil.example/path",
    ]) {
      expect(UrlItemSchema.safeParse({ id: "url_1", url }).success, url).toBe(false);
    }
  });

  it("validates image source path and data URL shapes", () => {
    const base = {
      scope: "project" as const,
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      fileName: "image.png",
      mimeType: "image/png" as const,
      width: 1,
      height: 1,
    };
    expect(CreateMapImageArtifactInputSchema.safeParse({
      ...base,
      sourceAbsolutePath: "/tmp/image.png",
    }).success).toBe(true);
    expect(CreateMapImageArtifactInputSchema.safeParse({
      ...base,
      sourceAbsolutePath: "relative/image.png",
    }).success).toBe(false);
    expect(CreateMapImageArtifactInputSchema.safeParse({
      ...base,
      dataUrl: "data:image/png;base64,AA==",
    }).success).toBe(true);
    expect(CreateMapImageArtifactInputSchema.safeParse({
      ...base,
      dataUrl: "data:text/html;base64,AA==",
    }).success).toBe(false);
    expect(CreateMapImageArtifactInputSchema.safeParse({
      ...base,
      dataUrl: "data:image/jpeg;base64,AA==",
    }).success).toBe(false);
  });

  it("bounds and cross-checks work-group and stack membership", () => {
    expect(MapWorkGroupSchema.safeParse({
      id: "wg_1",
      title: "Group",
      memberNodeIds: [],
      createdAt: "now",
      updatedAt: "now",
    }).success).toBe(false);
    expect(MapWorkGroupSchema.safeParse({
      id: "wg_1",
      title: "Group",
      memberNodeIds: ["art_a", "art_a"],
      createdAt: "now",
      updatedAt: "now",
    }).success).toBe(false);
    expect(MapWorkGroupSchema.safeParse({
      id: "wg_1",
      title: "Group",
      memberNodeIds: Array.from({ length: 4_097 }, (_, index) => `art_${index}`),
      createdAt: "now",
      updatedAt: "now",
    }).success).toBe(false);

    const validDocument = {
      version: "0.2.0" as const,
      projectId: "project_test",
      artifacts: [noteArtifact("art_a", { workGroupId: "wg_1" })],
      workGroups: [{
        id: "wg_1",
        title: "Group",
        memberNodeIds: ["art_a"],
        createdAt: "now",
        updatedAt: "now",
      }],
      workGroupSeq: 1,
    };
    expect(MapContentDocumentSchema.safeParse(validDocument).success).toBe(true);
    expect(MapContentDocumentSchema.safeParse({
      ...validDocument,
      workGroups: [{ ...validDocument.workGroups[0], memberNodeIds: ["missing"] }],
    }).success).toBe(false);
    expect(MapContentDocumentSchema.safeParse({
      ...validDocument,
      artifacts: [noteArtifact("art_a", { workGroupId: "missing" })],
    }).success).toBe(false);

    const validStackDocument = {
      ...validDocument,
      artifacts: [
        noteArtifact("art_a", {
          stackId: "stack_1",
          stackOrder: 0,
          stackActive: true,
          workGroupId: "wg_1",
        }),
        noteArtifact("art_b", {
          stackId: "stack_1",
          stackOrder: 1,
          stackActive: false,
          workGroupId: "wg_1",
        }),
      ],
      workGroups: [{ ...validDocument.workGroups[0], memberNodeIds: ["stack_1"] }],
    };
    expect(MapContentDocumentSchema.safeParse(validStackDocument).success).toBe(true);
    expect(MapContentDocumentSchema.safeParse({
      ...validStackDocument,
      artifacts: validStackDocument.artifacts.map((artifact) => ({
        ...artifact,
        stackOrder: 0,
      })),
    }).success).toBe(false);
    expect(MapContentDocumentSchema.safeParse({
      ...validStackDocument,
      artifacts: [{
        ...validStackDocument.artifacts[0],
        stackOrder: undefined,
      }],
      workGroups: [],
    }).success).toBe(false);
  });

  it("constrains confidence values and file sizes", () => {
    expect(FunctionalNodeSchema.safeParse({ ...validNode(), confidence: 1 }).success)
      .toBe(true);
    expect(FunctionalNodeSchema.safeParse({ ...validNode(), confidence: 1.01 }).success)
      .toBe(false);
    expect(HarnessHypothesisSchema.safeParse({
      id: "hypothesis",
      summary: "Summary",
      confidence: -0.1,
      evidence: [],
    }).success).toBe(false);
    expect(PromptRefinementSchema.safeParse({
      id: "refinement",
      understood: "Request",
      ambiguities: [],
      suggestions: [],
      affectedNodeIds: [],
      affectedFiles: [],
      confidence: Number.POSITIVE_INFINITY,
      mode: "model",
    }).success).toBe(false);
    const file = {
      path: "src/a.ts",
      type: "lib" as const,
      nodeIds: [],
      imports: [],
      exports: [],
    };
    expect(FileEntrySchema.safeParse({ ...file, size: 128 }).success).toBe(true);
    expect(FileEntrySchema.safeParse({ ...file, size: Number.POSITIVE_INFINITY }).success)
      .toBe(false);
    expect(FileEntrySchema.safeParse({ ...file, size: 1_099_511_627_777 }).success)
      .toBe(false);
  });

  it("rejects tombstones that intersect any node override", () => {
    const base = {
      version: "0.1.0" as const,
      projectId: "project_test",
      structuralRevision: { revision: 1, effectiveGraphHash: sha256, updatedAt: "now" },
      analyzerEvidence: { basedOnGraphHash: sha256, lastAnalyzedAt: "now", stale: false },
      createdNodes: [],
      nodeProductOverrides: [],
      nodeTopologyOverrides: [],
      nodeLinkedFilesOverrides: [],
      tombstoneNodeIds: ["node_a"],
      createdEdges: [],
      removedEdgeIds: [],
      fileEntryOverrides: [],
      removedFilePaths: [],
    };
    expect(GraphProductOverlaySchema.safeParse(base).success).toBe(true);
    expect(GraphProductOverlaySchema.safeParse({
      ...base,
      nodeProductOverrides: [{ nodeId: "node_a", fields: { summary: "Override" } }],
    }).success).toBe(false);
    expect(GraphProductOverlaySchema.safeParse({
      ...base,
      nodeTopologyOverrides: [{ nodeId: "node_a", parentId: null, children: [] }],
    }).success).toBe(false);
    expect(GraphProductOverlaySchema.safeParse({
      ...base,
      nodeLinkedFilesOverrides: [{ nodeId: "node_a", linkedFiles: [] }],
    }).success).toBe(false);
  });

  it("requires integer event durations and token counts", () => {
    const payload = {
      stage: "generate" as const,
      provider: "provider",
      model: "model",
      durationMs: 10,
      status: "ok" as const,
      tokenUsage: { input: 2, output: 3 },
    };
    expect(ModelRequestPayloadSchema.safeParse(payload).success).toBe(true);
    expect(ModelRequestPayloadSchema.safeParse({ ...payload, durationMs: 1.5 }).success)
      .toBe(false);
    expect(ModelRequestPayloadSchema.safeParse({
      ...payload,
      tokenUsage: { input: 2.5, output: 3 },
    }).success).toBe(false);
    expect(ModelRequestPayloadSchema.safeParse({
      ...payload,
      tokenUsage: { input: 2, output: Number.POSITIVE_INFINITY },
    }).success).toBe(false);
  });

  it("requires every agent run to carry an enforceable scope", () => {
    const run = {
      runId: "run_1",
      projectId: "project_test",
      kind: "feature_change" as const,
      status: "running" as const,
      relatedNodeIds: [],
      relatedFiles: [],
      role: "global" as const,
      startedAt: "now",
    };
    expect(AgentRunSchema.safeParse(run).success).toBe(false);
    expect(AgentRunSchema.safeParse({ ...run, scope: { kind: "global" } }).success)
      .toBe(true);
  });

  it("validates response language tags as bounded BCP-47", () => {
    expect(AgentResponseLanguageSchema.safeParse({
      tag: "zh-Hant",
      source: "detected",
      validation: "passed",
    }).success).toBe(true);
    expect(AgentResponseLanguageSchema.safeParse({
      tag: "not_a_language_tag",
      source: "detected",
      validation: "passed",
    }).success).toBe(false);
    expect(AgentResponseLanguageSchema.safeParse({
      tag: `x-${"a".repeat(80)}`,
      source: "detected",
      validation: "passed",
    }).success).toBe(false);
  });

  it("rejects half-populated internal-resource identity bindings", () => {
    const base = {
      operation: "internal" as const,
      resource: "current_work" as const,
      projectId: "project_test",
      workspaceRoot: "/workspace",
      relativePath: ".projectos/current-work.json",
      targetPath: "/workspace/.projectos/current-work.json",
      parentCanonicalPath: "/workspace/.projectos",
      parentDevice: 1,
      parentInode: 2,
      existedAtBind: false,
    };
    expect(InternalResourceWriteAuthorizationSchema.safeParse(base).success).toBe(true);
    expect(InternalResourceWriteAuthorizationSchema.safeParse({
      ...base,
      inode: 4,
    }).success).toBe(false);
    expect(WriteAuthorizationSchema.safeParse({ ...base, device: 3 }).success).toBe(false);
    expect(WriteAuthorizationSchema.safeParse({
      ...base,
      existedAtBind: true,
      device: 3,
      inode: 4,
      boundSha256: sha256,
    }).success).toBe(true);

    const manifest = {
      version: 3 as const,
      backupId: "backup_1",
      runId: "run_1",
      projectId: "project_test",
      createdAt: "now",
      files: [{
        operation: "internal" as const,
        resource: "current_work" as const,
        path: ".projectos/current-work.json",
        backupFile: "0000.original",
        mode: 0o644,
        existedBefore: false,
        resultedExists: true,
        afterSha256: sha256,
      }],
    };
    expect(ApplyBackupManifestV3Schema.safeParse(manifest).success).toBe(false);
  });

  it("requires strict restore provenance on current backup manifests while reading legacy data", () => {
    const files = [{
      operation: "modify" as const,
      path: "components/StatsCard.tsx",
      backupFile: "0000.original",
      mode: 0o644,
      originalSha256: sha256,
      afterSha256: sha256,
    }];
    const current = {
      version: 4 as const,
      backupId: "backup_1",
      runId: "run_1",
      projectId: "project_test",
      createdAt: "now",
      restoreAuthority: {
        kind: "design_preview" as const,
        previewSessionId: "session_1",
        mutationId: `pm1_${"m".repeat(43)}`,
      },
      files,
    };
    expect(ApplyBackupManifestV4Schema.safeParse(current).success).toBe(true);
    expect(ApplyBackupManifestV4Schema.safeParse({
      ...current,
      rendererSelectedPath: "components/Other.tsx",
    }).success).toBe(false);
    expect(ApplyBackupManifestV4Schema.safeParse({
      ...current,
      restoreAuthority: { ...current.restoreAuthority, rendererPath: "/tmp/forged" },
    }).success).toBe(false);
    expect(ApplyBackupManifestV4Schema.safeParse({
      ...current,
      restoreAuthority: { ...current.restoreAuthority, mutationId: "pm1_short" },
    }).success).toBe(false);
    const { restoreAuthority: _missingAuthority, ...withoutAuthority } = current;
    expect(ApplyBackupManifestV4Schema.safeParse(withoutAuthority).success).toBe(false);
    expect(ApplyBackupManifestSchema.safeParse({
      ...withoutAuthority,
      version: 3,
    }).success).toBe(true);
    expect(ApplyBackupManifestSchema.safeParse({
      ...withoutAuthority,
      version: 2,
      files: files.map(({ operation: _operation, ...file }) => file),
    }).success).toBe(true);
    expect(classifyApplyBackupRestoreAuthority(current)).toEqual({
      state: "authoritative",
      authority: current.restoreAuthority,
    });
    expect(classifyApplyBackupRestoreAuthority({
      ...withoutAuthority,
      version: 3,
    })).toEqual({
      state: "legacy_unclassified",
      manifestVersion: 3,
    });
    expect(classifyApplyBackupRestoreAuthority({
      ...withoutAuthority,
      version: 2,
      files: files.map(({ operation: _operation, ...file }) => file),
    })).toEqual({
      state: "legacy_unclassified",
      manifestVersion: 2,
    });
    expect(ApplyBackupManifestV4Schema.safeParse({
      ...current,
      restoreAuthority: { kind: "legacy_unclassified" },
    }).success).toBe(false);
  });

  it("binds restore outcome to its exact restored flag", () => {
    const restored = {
      backupId: "backup_1",
      restored: true,
      filesRestored: ["app/page.tsx"],
      outcome: "restored",
    } as const;
    const recoveryRequired = {
      backupId: "backup_2",
      restored: false,
      filesRestored: ["app/page.tsx"],
      outcome: "recovery_required",
      reason: "manual recovery required",
    } as const;
    expect(RestoreApplyResultSchema.safeParse(restored).success).toBe(true);
    expect(RestoreApplyResultSchema.safeParse(recoveryRequired).success).toBe(true);
    expect(RestoreApplyResultSchema.safeParse({
      ...restored,
      restored: false,
    }).success).toBe(false);
    expect(RestoreApplyResultSchema.safeParse({
      ...recoveryRequired,
      restored: true,
    }).success).toBe(false);
    expect(RestoreApplyResultSchema.safeParse({
      ...restored,
      sourcePath: "/tmp/forged",
    }).success).toBe(false);
  });

  it("preflights semantic-tree depth and global id uniqueness", () => {
    const valid = {
      version: "0.1.0" as const,
      projectId: "project_test",
      generatedAt: "now",
      roots: [{
        id: "root",
        label: "Root",
        kind: "feature" as const,
        status: "normal" as const,
        children: [{
          id: "child",
          label: "Child",
          kind: "file" as const,
          status: "normal" as const,
          children: [],
        }],
      }],
    };
    expect(SemanticTreeSchema.safeParse(valid).success).toBe(true);
    expect(SemanticTreeSchema.safeParse({
      ...valid,
      roots: [valid.roots[0], { ...valid.roots[0], children: [] }],
    }).success).toBe(false);

    let deep: Record<string, unknown> = {
      id: "node_70",
      label: "Deep",
      kind: "folder",
      status: "normal",
      children: [],
    };
    for (let depth = 69; depth >= 0; depth -= 1) {
      deep = {
        id: `node_${depth}`,
        label: `Node ${depth}`,
        kind: "folder",
        status: "normal",
        children: [deep],
      };
    }
    expect(() => SemanticTreeSchema.safeParse({ ...valid, roots: [deep] }))
      .not.toThrow();
    expect(SemanticTreeSchema.safeParse({ ...valid, roots: [deep] }).success)
      .toBe(false);
  });

  it("allows only HTTP model base URLs and bounds settings arrays", () => {
    const profile = {
      id: "model_1",
      name: "Model",
      provider: "custom" as const,
      apiFormat: "openai_chat" as const,
      model: "model",
      baseUrl: "https://example.test/v1",
      apiKeyRef: "model_profile:model_1",
    };
    expect(ModelProfileSchema.safeParse(profile).success).toBe(true);
    expect(ModelProfileSchema.safeParse({ ...profile, baseUrl: "file:///tmp/socket" }).success)
      .toBe(false);
    expect(ProjectOSSettingsSchema.safeParse({
      ...validSettings(),
      modelProfiles: Array.from({ length: 257 }, (_, index) => ({
        ...profile,
        id: `model_${index}`,
      })),
    }).success).toBe(false);
    expect(ProjectOSSettingsSchema.safeParse({
      ...validSettings(),
      agentProfiles: Array.from({ length: 257 }, (_, index) => ({
        id: `agent_${index}`,
        name: `Agent ${index}`,
        kind: "custom" as const,
        systemPrompt: "Prompt",
        modelProfileId: "model_1",
        enabledTools: [],
      })),
    }).success).toBe(false);
    expect(ProjectOSSettingsSchema.safeParse({
      ...validSettings(),
      team: { activePersonId: "person_alice" },
    }).success).toBe(true);
    expect(ProjectOSSettingsSchema.safeParse(validSettings()).success).toBe(true);
    expect(ProjectOSSettingsSchema.safeParse({
      ...validSettings(),
      team: { activePersonId: "person_alice", extra: true },
    }).success).toBe(false);
  });

  it("requires finite nonnegative integer model-gateway metrics", () => {
    expect(ModelGatewayRequestSchema.safeParse({
      requestKind: "agent_step",
      input: {},
      maxOutputTokens: 128,
    }).success).toBe(true);
    expect(ModelGatewayRequestSchema.safeParse({
      requestKind: "agent_step",
      input: {},
      maxOutputTokens: 1.5,
    }).success).toBe(false);
    const response = {
      requestId: "request_1",
      provider: "provider",
      model: "model",
      output: "output",
      usage: { inputTokens: 1, outputTokens: 2 },
      latencyMs: 3,
    };
    expect(ModelGatewayResponseSchema.safeParse(response).success).toBe(true);
    expect(ModelGatewayResponseSchema.safeParse({
      ...response,
      usage: { inputTokens: -1, outputTokens: 2 },
    }).success).toBe(false);
    expect(ModelGatewayResponseSchema.safeParse({
      ...response,
      latencyMs: Number.POSITIVE_INFINITY,
    }).success).toBe(false);
    expect(ModelGatewayResponseSchema.safeParse({
      ...response,
      usage: { inputTokens: 1, outputTokens: 2.5 },
    }).success).toBe(false);
  });

  it("cross-checks generated diff operation content", () => {
    expect(GeneratedDiffFileSchema.safeParse({
      path: "src/new.ts",
      changeType: "create",
      after: "export {};",
    }).success).toBe(true);
    expect(GeneratedDiffFileSchema.safeParse({
      path: "src/old.ts",
      changeType: "delete",
      before: "export {};",
    }).success).toBe(true);
    expect(GeneratedDiffFileSchema.safeParse({
      path: "src/current.ts",
      changeType: "modify",
      before: "old",
      after: "new",
    }).success).toBe(true);
    expect(GeneratedDiffFileSchema.safeParse({
      path: "src/current.ts",
      changeType: "modify",
      patch: "@@ patch",
    }).success).toBe(true);
    expect(GeneratedDiffFileSchema.safeParse({
      path: "",
      changeType: "create",
      after: "new",
    }).success).toBe(false);
    expect(GeneratedDiffFileSchema.safeParse({
      path: "src/new.ts",
      changeType: "create",
    }).success).toBe(false);
    expect(GeneratedDiffFileSchema.safeParse({
      path: "src/old.ts",
      changeType: "delete",
      before: "old",
      after: "new",
    }).success).toBe(false);
    expect(GeneratedDiffFileSchema.safeParse({
      path: "src/current.ts",
      changeType: "modify",
      after: "new",
    }).success).toBe(false);
  });
});
