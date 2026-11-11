/**
 * Gmail attachments_get through settle product path — accountRef / size fail-closed.
 * Loopback only; no live mailbox.
 */
import { describe, expect, it } from "vitest";
import { createScriptedTransport } from "./http-transport.js";
import { settleConnectorOperation } from "./settle-connector.js";
import type { LoopGraphDocument } from "../../contracts/loop-graph.js";

function freezeBinding(credentialRefIds: string[]) {
  return {
    projectId: "proj_gm",
    workspaceRoot: "/tmp/gm",
    specVersion: "v1",
    createdAt: new Date().toISOString(),
    codeDigest: "abc",
    codeDigestStatus: "complete" as const,
    permissionSet: {
      credentialRefIds,
      requireHitlForHighRisk: true as const,
    },
  };
}

function baseDoc(): LoopGraphDocument {
  return {
    id: "loop_gm",
    title: "Gmail settle",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: { revision: 1, graphPrompt: "", nodes: [], edges: [] },
    approvedSpecs: [],
    instances: [
      {
        id: "inst_gm",
        specVersion: "v1",
        status: "running",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        round: 0,
        attemptCounts: {},
        events: [],
        runBinding: freezeBinding(["cred_gmail"]),
      },
    ],
  };
}

describe("gmail attachments_get settle product path", () => {
  it("refuses accountRef mismatch before HTTP", async () => {
    const scripted = createScriptedTransport([]);
    let doc = baseDoc();
    const settled = await settleConnectorOperation(
      {
        nodeId: "n_att",
        vendorId: "gmail",
        capabilityId: "attachments_get",
        payload: {
          messageId: "m1",
          attachmentId: "a1",
          filename: "x.bin",
          mimeType: "application/octet-stream",
          accountRefId: "other_acct",
        },
        credentialRefId: "cred_gmail",
        idempotencyKey: "gm-att-mismatch",
        queuedAt: new Date().toISOString(),
      },
      {
        loadDocument: () => doc,
        saveDocument: (next) => {
          doc = next;
          return next;
        },
        instanceId: "inst_gm",
        ctx: { transport: scripted.transport },
        resolveSecret: () => "tok",
      },
    );
    expect(settled.result.ok).toBe(false);
    if (!settled.result.ok) {
      expect(settled.result.code).toBe("account_ref_mismatch");
    }
    expect(scripted.requests).toHaveLength(0);
  });

  it("refuses declared >50M before HTTP", async () => {
    const scripted = createScriptedTransport([]);
    let doc = baseDoc();
    const settled = await settleConnectorOperation(
      {
        nodeId: "n_att",
        vendorId: "gmail",
        capabilityId: "attachments_get",
        payload: {
          messageId: "m1",
          attachmentId: "a1",
          filename: "huge.bin",
          mimeType: "application/octet-stream",
          accountRefId: "cred_gmail",
          sizeBytes: 50_000_001,
        },
        credentialRefId: "cred_gmail",
        idempotencyKey: "gm-att-size",
        queuedAt: new Date().toISOString(),
      },
      {
        loadDocument: () => doc,
        saveDocument: (next) => {
          doc = next;
          return next;
        },
        instanceId: "inst_gm",
        ctx: { transport: scripted.transport },
        resolveSecret: () => "tok",
      },
    );
    expect(settled.result.ok).toBe(false);
    if (!settled.result.ok) {
      expect(settled.result.code).toBe("size_limit");
    }
    expect(scripted.requests).toHaveLength(0);
  });
});
