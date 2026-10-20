import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { LoadedProjectOSWorkspace } from "../../persistence/workspace-store.js";
import { retrieve } from "./broker.js";
import {
  RETRIEVAL_EVAL_QUERIES,
  scoreRetrievalEval,
  type RetrievalEvalObservation,
} from "./retrieval-eval.js";

function workspace(): LoadedProjectOSWorkspace {
  const root = mkdtempSync(join(tmpdir(), "rag-eval-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "billing.ts"), "export function InvoiceTotal() {\n  return 1\n}\n");
  writeFileSync(join(root, "src", "owned.ts"), "export const ownedMarker = 1\n");
  return {
    workspaceRoot: root,
    project: { projectId: "proj_eval" },
    graph: {
      nodes: [{
        id: "billing",
        name: "Billing",
        summary: "Invoices",
        downstream: [],
        upstream: [],
      }],
      fileIndex: [{ path: "src/owned.ts", nodeIds: ["billing"] }],
    },
  } as unknown as LoadedProjectOSWorkspace;
}

function observe(
  loaded: LoadedProjectOSWorkspace,
): RetrievalEvalObservation[] {
  const fileIndex = loaded.graph.fileIndex;
  return RETRIEVAL_EVAL_QUERIES.map((query) => {
    const outcome = retrieve(
      loaded,
      { projectId: "proj_eval", kind: query.kind, query: query.query },
      "ask",
    );
    const paths = new Set<string>();
    for (const hit of outcome.snapshot.hits) {
      if (hit.path) paths.add(hit.path);
      if (hit.nodeId) {
        for (const file of fileIndex) {
          if (file.nodeIds.includes(hit.nodeId)) paths.add(file.path);
        }
      }
    }
    return {
      id: query.id,
      expectedPath: query.expectedPath,
      paths: [...paths],
      omissionCount: outcome.snapshot.omissions.reduce((sum, item) => sum + item.count, 0),
    };
  });
}

describe("retrieval eval", () => {
  it("reports a miss after the expected file is renamed", () => {
    const loaded = workspace();
    const before = scoreRetrievalEval(observe(loaded));
    expect(before.every((score) => score.hit)).toBe(true);
    expect(before.every((score) => score.countsAsAnswer === false)).toBe(true);
    renameSync(
      join(loaded.workspaceRoot, "src", "billing.ts"),
      join(loaded.workspaceRoot, "src", "billing-next.ts"),
    );
    const after = scoreRetrievalEval(observe(loaded));
    const symbol = after.find((score) => score.id === "symbol-invoice");
    expect(symbol?.hit).toBe(false);
    const observation = observe(loaded).find((item) => item.id === "symbol-invoice");
    expect(observation?.paths).not.toContain("src/billing.ts");
  });
});
