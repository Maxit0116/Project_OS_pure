import { describe, expect, it } from "vitest";

import {
  AgentAnswerResultSchema,
  AgentAskRequestSchema,
} from "./agent-conversation.js";

describe("agent conversation contracts", () => {
  it("accepts explicit scoped ask and answer contracts", () => {
    const request = AgentAskRequestSchema.parse({
      projectId: "project_test",
      scope: { kind: "file", nodeId: "node_auth", selectedFilePath: "src/auth.ts" },
      question: "这个文件做什么？",
      language: { mode: "override", tag: "zh-Hant" },
    });
    expect(request.language).toEqual({ mode: "override", tag: "zh-Hant" });

    expect(AgentAnswerResultSchema.safeParse({
      id: "answer_test",
      projectId: request.projectId,
      scope: request.scope,
      answer: "这个文件处理认证。",
      backend: "model",
      modelProfileId: "model_test",
      contextBundleHash: `sha256:${"a".repeat(64)}`,
      contextSummary: {
        files: [{
          path: "src/auth.ts",
          disposition: "exact",
          byteLength: 100,
          includedByteLength: 100,
        }],
        synopsisPresent: true,
        childrenCoverage: { totalCount: 0, includedCount: 0, omittedCount: 0 },
        bundleHash: `sha256:${"a".repeat(64)}`,
      },
      reasoning: {
        content: "Provider trace",
        source: "provider_supplied",
        truncated: false,
      },
      responseLanguage: {
        tag: "zh-Hant",
        source: "override",
        validation: "mismatch_after_retry",
      },
      createdAt: "2026-07-18T00:00:00.000Z",
    }).success).toBe(true);
  });

  it("rejects a context summary bound to a different bundle", () => {
    const result = AgentAnswerResultSchema.safeParse({
      id: "answer_test",
      projectId: "project_test",
      scope: { kind: "node", nodeId: "node_auth" },
      answer: "Answer",
      backend: "model",
      modelProfileId: "model_test",
      contextBundleHash: `sha256:${"a".repeat(64)}`,
      contextSummary: {
        files: [],
        synopsisPresent: true,
        childrenCoverage: { totalCount: 0, includedCount: 0, omittedCount: 0 },
        bundleHash: `sha256:${"b".repeat(64)}`,
      },
      responseLanguage: {
        tag: "und",
        source: "undetermined",
        validation: "not_checkable",
      },
      createdAt: "2026-07-18T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed language overrides", () => {
    expect(AgentAskRequestSchema.safeParse({
      projectId: "project_test",
      scope: { kind: "file", nodeId: "node_auth", selectedFilePath: "src/auth.ts" },
      question: "Explain this file",
      language: { mode: "override", tag: "not_a_language_tag" },
    }).success).toBe(false);
  });

  it("accepts node-scoped asks without a selected file", () => {
    expect(AgentAskRequestSchema.safeParse({
      projectId: "project_test",
      scope: { kind: "node", nodeId: "node_auth" },
      question: "Explain this capability",
      language: { mode: "auto" },
    }).success).toBe(true);
  });

  it("accepts a read-only global project ask", () => {
    expect(AgentAskRequestSchema.safeParse({
      projectId: "project_test",
      scope: { kind: "global" },
      question: "What is this project for?",
      language: { mode: "auto" },
    }).success).toBe(true);
  });
});
