/**
 * Electron IPC loopback mode — parse user_request only (not draft Human nodes).
 */
import { afterEach, describe, expect, it } from "vitest";
import { ProjectOSLocalApi } from "./project-os-local-api.js";
import { setLoopAuthoringCompleteOverride } from "./loop-graph-service.js";

describe("setLoopAuthoringLoopbackMode demo_edit", () => {
  afterEach(async () => {
    setLoopAuthoringCompleteOverride(null);
  });

  it("timeout patch ignores Human nodes in authoring prompt context", async () => {
    // No workspace needed — demo_edit only injects the complete override.
    const api = new ProjectOSLocalApi({});
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
    const api = new ProjectOSLocalApi({});
    await api.setLoopAuthoringLoopbackMode("demo_edit");
    const { getLoopAuthoringCompleteOverride } = await import("./loop-graph-service.js");
    const complete = getLoopAuthoringCompleteOverride();
    const raw = await complete!({
      system: "test",
      user: ["mode: edit", "user_request: insert approval"].join("\n"),
    });
    const parsed = JSON.parse(raw) as { kind: string; summary?: string; gate?: string };
    expect(parsed.kind).toBe("approval_insert");
    expect(parsed.summary).toMatch(/insert approval gate/i);
    expect(parsed.gate).toBe("before_test");
    const rawWrite = await complete!({
      system: "test",
      user: ["mode: edit", "user_request: insert approval before write"].join("\n"),
    });
    const writeParsed = JSON.parse(rawWrite) as { gate?: string };
    expect(writeParsed.gate).toBe("before_write");
    await api.setLoopAuthoringLoopbackMode("off");
  });

  it("scaffold generates mixed Agent/Action/Logic/Human graph", async () => {
    const api = new ProjectOSLocalApi({});
    await api.setLoopAuthoringLoopbackMode("demo_edit");
    const { getLoopAuthoringCompleteOverride } = await import("./loop-graph-service.js");
    const complete = getLoopAuthoringCompleteOverride();
    const raw = await complete!({
      system: "test",
      user: ["mode: edit", "user_request: generate workflow from empty"].join("\n"),
    });
    const parsed = JSON.parse(raw) as {
      kind: string;
      draft?: { nodes: Array<{ id: string; type?: string }> };
    };
    expect(parsed.kind).toBe("graph");
    const types = new Set((parsed.draft?.nodes ?? []).map((n) => n.type));
    expect(types.has("agent")).toBe(true);
    expect(types.has("action")).toBe(true);
    expect(types.has("logic")).toBe(true);
    expect(types.has("human")).toBe(true);
    await api.setLoopAuthoringLoopbackMode("off");
  });
});
