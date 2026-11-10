/**
 * Electron IPC loopback mode — parse user_request only (not draft Human nodes).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

describe("setLoopAuthoringLoopbackMode demo_edit", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("timeout patch ignores Human nodes in authoring prompt context", async () => {
    const root = mkdtempSync(join(tmpdir(), "loopback-mode-"));
    roots.push(root);
    const api = new ProjectOSLocalApi({ workspaceRoot: root });
    const mode = await api.setLoopAuthoringLoopbackMode("demo_edit");
    expect(mode).toEqual({ mode: "demo_edit", live: false });

    // Simulate the production authoring user prompt shape (Human in draft).
    const { getLoopAuthoringCompleteOverride } = await import("./loop-graph-service.js");
    const complete = getLoopAuthoringCompleteOverride();
    expect(complete).toBeTypeOf("function");
    const raw = await complete!({
      system: "test",
      user: [
        "mode: edit",
        "user_request: nodeId=n_coder timeout=7777",
        'workflow_draft: {"nodes":[{"id":"n_human","type":"human","title":"Human Review","humanMode":"approval"}]}',
      ].join("\n"),
    });
    const parsed = JSON.parse(raw) as {
      kind: string;
      nodeId?: string;
      patch?: { timeoutMs?: number };
      summary?: string;
    };
    expect(parsed.kind).toBe("node_patch");
    expect(parsed.nodeId).toBe("n_coder");
    expect(parsed.patch?.timeoutMs).toBe(7777);
    expect(parsed.summary).toMatch(/loopback: set timeoutMs=7777/);

    await api.setLoopAuthoringLoopbackMode("off");
  });

  it("insert approval still matches explicit approval request", async () => {
    const root = mkdtempSync(join(tmpdir(), "loopback-mode-"));
    roots.push(root);
    const api = new ProjectOSLocalApi({ workspaceRoot: root });
    await api.setLoopAuthoringLoopbackMode("demo_edit");
    const { getLoopAuthoringCompleteOverride } = await import("./loop-graph-service.js");
    const complete = getLoopAuthoringCompleteOverride();
    const raw = await complete!({
      system: "test",
      user: ["mode: edit", "user_request: insert approval"].join("\n"),
    });
    const parsed = JSON.parse(raw) as { kind: string; summary?: string };
    expect(parsed.kind).toBe("graph");
    expect(parsed.summary).toMatch(/insert human approval/i);
    await api.setLoopAuthoringLoopbackMode("off");
  });
});
