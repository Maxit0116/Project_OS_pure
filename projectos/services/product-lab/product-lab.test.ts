import { describe, expect, it } from "vitest";
import { labFindingHandoffMode } from "../../contracts/product-lab.js";
import { buildLabHandoffPrompt } from "./handoff.js";
import {
  addLabFinding,
  createEmptyLabDocument,
  endLabSession,
  getActiveLabSession,
  labNodeFindingCounts,
  patchLabFinding,
  patchLabSession,
  startLabSession,
} from "./session-ops.js";

describe("product-lab session-ops", () => {
  it("starts a session as active and ends the previous one", () => {
    let doc = createEmptyLabDocument("2026-11-05T00:00:00.000Z");
    const first = startLabSession(
      doc,
      { projectId: "p1", scopeNodeIds: ["n1"] },
      "2026-11-05T00:00:00.000Z",
    );
    doc = first.document;
    expect(getActiveLabSession(doc)?.id).toBe(first.session.id);

    const second = startLabSession(
      doc,
      { projectId: "p1" },
      "2026-11-05T00:01:00.000Z",
    );
    doc = second.document;
    expect(doc.activeSessionId).toBe(second.session.id);
    expect(doc.sessions.find((s) => s.id === first.session.id)?.status).toBe(
      "ended",
    );
  });

  it("adds findings and moves session into triaging", () => {
    let doc = createEmptyLabDocument();
    const started = startLabSession(doc, { projectId: "p1", scopeNodeIds: ["n1"] });
    doc = patchLabSession(started.document, started.session.id, {
      status: "experiencing",
    });
    const added = addLabFinding(doc, {
      sessionId: started.session.id,
      kind: "manual",
      title: "Signup stuck",
      nodeIds: ["n1"],
      detail: "Company size field",
    });
    doc = added.document;
    expect(added.finding.status).toBe("open");
    expect(getActiveLabSession(doc)?.status).toBe("triaging");
    expect(labNodeFindingCounts(doc, started.session.id)).toEqual({ n1: 1 });
  });

  it("ends session and clears active id", () => {
    let doc = createEmptyLabDocument();
    const started = startLabSession(doc, { projectId: "p1" });
    doc = endLabSession(started.document, started.session.id);
    expect(doc.activeSessionId).toBeNull();
    expect(getActiveLabSession(doc)).toBeNull();
  });

  it("routes handoff modes and builds a prompt", () => {
    expect(labFindingHandoffMode("console_error")).toBe("debug");
    expect(labFindingHandoffMode("manual")).toBe("change");

    let doc = createEmptyLabDocument();
    const started = startLabSession(doc, {
      projectId: "p1",
      scopeNodeIds: ["signup"],
    });
    const added = addLabFinding(started.document, {
      sessionId: started.session.id,
      kind: "console_error",
      title: "TypeError on checkout",
      evidence: [{ kind: "console", label: "error", body: "boom" }],
      location: { url: "http://localhost:5173/checkout" },
    });
    const { mode, prompt } = buildLabHandoffPrompt(
      added.finding,
      started.session,
    );
    expect(mode).toBe("debug");
    expect(prompt).toContain("TypeError on checkout");
    expect(prompt).toContain("boom");
  });

  it("patches finding status for verify flow", () => {
    let doc = createEmptyLabDocument();
    const started = startLabSession(doc, { projectId: "p1" });
    const added = addLabFinding(started.document, {
      sessionId: started.session.id,
      kind: "manual",
      title: "Bug",
    });
    doc = patchLabFinding(added.document, added.finding.id, {
      status: "verified_fixed",
    });
    expect(doc.findings[0]?.status).toBe("verified_fixed");
  });
});
