/**
 * Narrow production-path audit: Batch3 / Gmail settle + offline queue via LocalApi.
 * Uses settlePendingConnectorOp (not helper-only settleConnectorOperation).
 * Loopback DI transport only — no live OAuth / mailbox / paid project.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  approveLoopSpec,
  createLoopGraph,
  getLoopGraph,
  upsertLoopGraph,
} from "./loop-graph-service.js";
import { createScriptedTransport } from "./loop-connectors/http-transport.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import type { LoopSpec } from "../contracts/loop-graph.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

describe("LocalApi Batch3/Gmail settle + offline queue (production entry)", () => {
  const roots: string[] = [];
  const prevAllow = process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;

  beforeEach(() => {
    process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = "1";
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
    if (prevAllow === undefined) {
      delete process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK;
    } else {
      process.env.PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK = prevAllow;
    }
  });

  async function openWithLoop(title: string) {
    const sample = mkdtempSync(join(tmpdir(), "loop-b3gm-api-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    mkdirSync(join(sample, "src"), { recursive: true });
    writeFileSync(join(sample, "src/a.ts"), "export const a = 1\n");
    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api.openSampleWorkspace();
    const workspaceRoot = (
      api as unknown as {
        requireLoadedWorkspace: (id: string) => { workspaceRoot: string };
      }
    ).requireLoadedWorkspace(project.projectId).workspaceRoot;

    let doc = createLoopGraph(workspaceRoot, project.projectId, title);
    const spec: LoopSpec = {
      version: "spec_b3gm_1",
      graphRevision: 1,
      goal: title,
      acceptance: [],
      retryPolicy: { onFailure: "retry", maxAutoRetries: 1 },
      stopPolicy: { maxRounds: 3 },
      permissions: [],
      openQuestions: [],
      createdAt: "2026-11-10T00:00:00.000Z",
      nodes: [
        {
          id: "n_impl",
          role: "implement",
          type: "agent",
          agentRole: "coder",
          goal: "noop",
          constraints: [],
          inputs: [],
          outputs: [],
          acceptance: [],
        },
      ],
      edges: [],
    };
    doc = approveLoopSpec(workspaceRoot, doc.id, spec);
    return { api, project, workspaceRoot, doc, loopId: doc.id };
  }

  function freezeBinding(
    projectId: string,
    workspaceRoot: string,
    credentialRefIds: string[],
  ): Record<string, unknown> {
    return {
      projectId,
      workspaceRoot,
      specVersion: "spec_b3gm_1",
      createdAt: "2026-11-10T00:00:00.000Z",
      codeDigest: "abc",
      codeDigestStatus: "complete",
      permissionSet: {
        credentialRefIds,
        requireHitlForHighRisk: true,
      },
    };
  }

  function seedPending(
    workspaceRoot: string,
    loopId: string,
    pending: Record<string, unknown>,
    runBinding?: Record<string, unknown>,
  ) {
    const current = getLoopGraph(workspaceRoot, loopId);
    if (!current) throw new Error("missing loop");
    const inst = {
      id: "inst_settle",
      specVersion: "spec_b3gm_1",
      status: "running" as const,
      cursorNodeId: String(pending.nodeId ?? "n_impl"),
      startedAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
      round: 0,
      attemptCounts: {},
      events: [],
      pendingConnectorOp: pending,
      ...(runBinding ? { runBinding } : {}),
    };
    return upsertLoopGraph(workspaceRoot, {
      ...current,
      instances: [inst as never],
    });
  }

  it("Gmail attachments_get LocalApi settle: accountRef mismatch → 0 HTTP", async () => {
    const { api, project, workspaceRoot, loopId } = await openWithLoop("Gmail settle");
    const scripted = createScriptedTransport([]);
    api.replaceLoopConnectorTransportForTests(scripted.transport);
    api.replaceLoopConnectorSecretResolverForTests(() => "tok");
    seedPending(
      workspaceRoot,
      loopId,
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
        idempotencyKey: "gm-local-mismatch",
        queuedAt: "2026-11-10T00:00:00.000Z",
      },
      freezeBinding(project.projectId, workspaceRoot, ["cred_gmail"]),
    );

    const settled = await api.settlePendingConnectorOp(
      project.projectId,
      loopId,
      "inst_settle",
    );
    expect(settled.result.ok).toBe(false);
    if (!settled.result.ok) {
      expect(settled.result.code).toBe("account_ref_mismatch");
    }
    expect(scripted.requests).toHaveLength(0);
  });

  it("Gmail attachments_get LocalApi settle: >50M → 0 HTTP", async () => {
    const { api, project, workspaceRoot, loopId } = await openWithLoop("Gmail size");
    const scripted = createScriptedTransport([]);
    api.replaceLoopConnectorTransportForTests(scripted.transport);
    api.replaceLoopConnectorSecretResolverForTests(() => "tok");
    seedPending(
      workspaceRoot,
      loopId,
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
        idempotencyKey: "gm-local-size",
        queuedAt: "2026-11-10T00:00:00.000Z",
      },
      freezeBinding(project.projectId, workspaceRoot, ["cred_gmail"]),
    );

    const settled = await api.settlePendingConnectorOp(
      project.projectId,
      loopId,
      "inst_settle",
    );
    expect(settled.result.ok).toBe(false);
    if (!settled.result.ok) {
      expect(settled.result.code).toBe("size_limit");
    }
    expect(scripted.requests).toHaveLength(0);
  });

  it("Batch3 supabase read_rows LocalApi settle succeeds with DI transport", async () => {
    const { api, project, workspaceRoot, loopId } = await openWithLoop("Batch3 read");
    const scripted = createScriptedTransport([
      {
        response: {
          status: 200,
          headers: {},
          bodyText: JSON.stringify([{ id: 1 }]),
          durationMs: 1,
        },
      },
    ]);
    api.replaceLoopConnectorTransportForTests(scripted.transport);
    api.replaceLoopConnectorSecretResolverForTests(() => "sb_secret");
    seedPending(
      workspaceRoot,
      loopId,
      {
        nodeId: "n_sb",
        vendorId: "supabase",
        capabilityId: "read_rows",
        payload: {
          projectUrl: "https://example.supabase.co",
          table: "items",
        },
        credentialRefId: "cred_sb",
        idempotencyKey: "sb-local-read",
        queuedAt: "2026-11-10T00:00:00.000Z",
      },
      freezeBinding(project.projectId, workspaceRoot, ["cred_sb"]),
    );

    const settled = await api.settlePendingConnectorOp(
      project.projectId,
      loopId,
      "inst_settle",
    );
    expect(settled.result.ok).toBe(true);
    expect(scripted.requests[0]?.url).toContain("/rest/v1/items");
  });

  it("Batch3 supabase write_rows LocalApi settle sealed (high_risk_disabled, 0 HTTP)", async () => {
    const { api, project, workspaceRoot, loopId } = await openWithLoop("Batch3 write");
    const scripted = createScriptedTransport([]);
    api.replaceLoopConnectorTransportForTests(scripted.transport);
    api.replaceLoopConnectorSecretResolverForTests(() => "sb_secret");
    seedPending(
      workspaceRoot,
      loopId,
      {
        nodeId: "n_sb",
        vendorId: "supabase",
        capabilityId: "write_rows",
        payload: {
          projectUrl: "https://example.supabase.co",
          table: "items",
          rows: [{ id: 1 }],
        },
        credentialRefId: "cred_sb",
        idempotencyKey: "sb-local-write",
        queuedAt: "2026-11-10T00:00:00.000Z",
      },
      freezeBinding(project.projectId, workspaceRoot, ["cred_sb"]),
    );

    const settled = await api.settlePendingConnectorOp(
      project.projectId,
      loopId,
      "inst_settle",
    );
    expect(settled.result.ok).toBe(false);
    if (!settled.result.ok) {
      expect(settled.result.code).toBe("high_risk_disabled");
    }
    expect(scripted.requests).toHaveLength(0);
  });

  it("settle LocalApi refuses credential outside frozen RunBinding permissionSet", async () => {
    const { api, project, workspaceRoot, loopId } = await openWithLoop("Freeze settle");
    const scripted = createScriptedTransport([]);
    api.replaceLoopConnectorTransportForTests(scripted.transport);
    api.replaceLoopConnectorSecretResolverForTests(() => "sb_secret");
    seedPending(
      workspaceRoot,
      loopId,
      {
        nodeId: "n_sb",
        vendorId: "supabase",
        capabilityId: "read_rows",
        payload: {
          projectUrl: "https://example.supabase.co",
          table: "items",
        },
        credentialRefId: "cred_other",
        idempotencyKey: "sb-freeze",
        queuedAt: "2026-11-10T00:00:00.000Z",
      },
      {
        projectId: project.projectId,
        workspaceRoot,
        specVersion: "spec_b3gm_1",
        createdAt: "2026-11-10T00:00:00.000Z",
        codeDigest: "abc",
        codeDigestStatus: "complete",
        permissionSet: {
          credentialRefIds: ["cred_sb"],
          requireHitlForHighRisk: true,
        },
      },
    );

    const settled = await api.settlePendingConnectorOp(
      project.projectId,
      loopId,
      "inst_settle",
    );
    expect(settled.result.ok).toBe(false);
    if (!settled.result.ok) {
      expect(settled.result.message).toMatch(/not in frozen permissionSet/);
    }
    expect(scripted.requests).toHaveLength(0);
  });

  it("settle LocalApi refuses credential when instance has no RunBinding", async () => {
    const { api, project, workspaceRoot, loopId } = await openWithLoop("No binding settle");
    const scripted = createScriptedTransport([]);
    api.replaceLoopConnectorTransportForTests(scripted.transport);
    api.replaceLoopConnectorSecretResolverForTests(() => "sb_secret");
    seedPending(workspaceRoot, loopId, {
      nodeId: "n_sb",
      vendorId: "supabase",
      capabilityId: "read_rows",
      payload: {
        projectUrl: "https://example.supabase.co",
        table: "items",
      },
      credentialRefId: "cred_sb",
      idempotencyKey: "sb-nobind",
      queuedAt: "2026-11-10T00:00:00.000Z",
    });

    const settled = await api.settlePendingConnectorOp(
      project.projectId,
      loopId,
      "inst_settle",
    );
    expect(settled.result.ok).toBe(false);
    if (!settled.result.ok) {
      expect(settled.result.message).toMatch(/no RunBinding freeze|permissionSet was not frozen/);
    }
    expect(scripted.requests).toHaveLength(0);
  });

  it("offline queue persists across LocalApi reopen then drains", async () => {
    const sample = mkdtempSync(join(tmpdir(), "loop-eq-persist-"));
    roots.push(sample);
    cpSync(sampleWorkspaceRoot, sample, { recursive: true });
    mkdirSync(join(sample, "src"), { recursive: true });
    writeFileSync(join(sample, "src/a.ts"), "export const a = 1\n");

    const api1 = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project = await api1.openSampleWorkspace();
    let doc = await api1.createLoopGraph(project.projectId);
    doc = await api1.upsertLoopGraph(project.projectId, {
      ...doc,
      title: "EQ persist",
      draft: {
        revision: 1,
        graphPrompt: "eq",
        nodes: [
          {
            id: "n_impl",
            title: "Implement",
            prompt: "do",
            type: "agent",
            agentRole: "coder",
            position: { x: 0, y: 0 },
            timeoutMs: 60_000,
          },
        ],
        edges: [],
      },
    });
    const compiled = await api1.compileLoopGraph(project.projectId, doc.id);
    doc = await api1.approveLoopSpec(project.projectId, doc.id, {
      ...compiled.specDraft,
      version: "spec_eq_persist_1",
      createdAt: new Date().toISOString(),
    });
    const enq = await api1.enqueueOfflineLoopEvent(project.projectId, doc.id, {
      eventId: "ev_persist_1",
      eventType: "verification.failed",
      payload: { reason: "flake" },
    });
    expect(enq.outcome).toBe("queued");

    // New LocalApi handle on same workspace root — queue must still be listed.
    const api2 = new ProjectOSLocalApi({ sampleWorkspaceRoot: sample });
    const project2 = await api2.openSampleWorkspace();
    expect(project2.projectId).toBe(project.projectId);
    const listed = await api2.listOfflineLoopEventQueue(project2.projectId);
    expect(
      listed.some((e) => e.eventId === "ev_persist_1" && e.status === "queued"),
    ).toBe(true);

    const drained = await api2.drainOfflineLoopEventQueue(project2.projectId, {
      max: 5,
    });
    expect(drained.drained + drained.failed).toBeGreaterThanOrEqual(1);
  });
});
