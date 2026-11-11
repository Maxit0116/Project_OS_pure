import { describe, expect, it } from "vitest";
import { createEmptyLoopDocument } from "../contracts/loop-graph.js";
import { preflightLoopRunStart } from "./loop-run-preflight.js";

describe("loop-run-preflight", () => {
  it("blocks when no approved spec", () => {
    const doc = createEmptyLoopDocument({
      id: "loop_1",
      projectId: "proj",
      title: "Demo",
    });
    const result = preflightLoopRunStart({ document: doc });
    expect(result.canStart).toBe(false);
    expect(result.items.some((item) => item.code === "no_approved_spec")).toBe(
      true,
    );
  });

  it("blocks SSRF URL materials and missing action credentials", () => {
    const doc = createEmptyLoopDocument({
      id: "loop_2",
      projectId: "proj",
      title: "Demo",
    });
    doc.approvedSpecs = [
      {
        version: "spec_1",
        graphRevision: 1,
        createdAt: new Date().toISOString(),
        goal: "Ship",
        nodes: [
          {
            id: "act",
            role: "implement",
            goal: "Notify slack",
            type: "action",
            actionIntegration: "slack",
            actionOperation: "chat_postMessage",
            constraints: [],
            inputs: [],
            outputs: [],
            acceptance: [],
          },
          {
            id: "hum",
            role: "decide",
            goal: "Approve release",
            type: "human",
            humanMode: "approval",
            constraints: [],
            inputs: [],
            outputs: [],
            acceptance: [],
          },
        ],
        edges: [],
        acceptance: [],
        retryPolicy: { onFailure: "pause_hitl", maxAutoRetries: 0 },
        stopPolicy: { maxRounds: 3 },
        permissions: [],
        openQuestions: [],
      },
    ];
    doc.draft = {
      revision: 1,
      graphPrompt: "Ship",
      nodes: [
        {
          id: "act",
          title: "Notify",
          prompt: "post",
          type: "action",
          actionIntegration: "slack",
          actionOperation: "chat_postMessage",
          position: { x: 0, y: 0 },
        },
        {
          id: "hum",
          title: "Approve",
          prompt: "approve",
          type: "human",
          humanMode: "approval",
          humanAssignee: "alice",
          position: { x: 200, y: 0 },
        },
      ],
      edges: [],
    };

    const result = preflightLoopRunStart({
      document: doc,
      specVersion: "spec_1",
      branch: "main",
      materials: [
        {
          id: "m1",
          kind: "url",
          purpose: "api_doc",
          title: "Metadata",
          source: "url",
          parseStatus: "ok",
          url: { href: "https://169.254.169.254/latest" },
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(result.canStart).toBe(false);
    expect(result.items.some((item) => item.code === "missing_credential")).toBe(
      true,
    );
    expect(result.items.some((item) => item.code === "material_url_ssrf")).toBe(
      true,
    );
    expect(result.items.some((item) => item.code === "human_gate")).toBe(true);
  });
});
