import { describe, expect, it } from "vitest";

import type { DebugSession } from "../contracts/debug-session.js";
import { resolveDebugFixFilePath } from "./debug-session-service.js";

const graph = {
  nodes: [{ id: "feat_team", linkedFiles: [{ path: "lib/team.ts", role: "primary" }] }],
  fileIndex: [
    { path: "lib/team.ts", nodeIds: ["feat_team"] },
    { path: "app/team/page.tsx", nodeIds: ["feat_team"] },
  ],
};
const workspace = { graph } as never;

function session(overrides: Partial<DebugSession>): DebugSession {
  return {
    scope: { kind: "global" },
    instrumentation: [],
    proposedFix: undefined,
    ...overrides,
  } as unknown as DebugSession;
}

describe("resolveDebugFixFilePath", () => {
  it("fixes a bug reported with no file selected in the file the analysis names", () => {
    const resolved = resolveDebugFixFilePath(
      session({ proposedFix: { summary: "x", touchedFiles: ["lib/team.ts"], patchKind: "root_cause" } }),
      workspace,
    );
    expect(resolved).toBe("lib/team.ts");
  });

  it("skips a path the model invented and takes the first one the project has", () => {
    const resolved = resolveDebugFixFilePath(
      session({ proposedFix: { summary: "x", touchedFiles: ["src/teams/index.ts", " app/team/page.tsx "], patchKind: "root_cause" } }),
      workspace,
    );
    expect(resolved).toBe("app/team/page.tsx");
  });

  it("resolves to nothing, not to an invented path, when the analysis names only files the project lacks", () => {
    // The caller then says "select the file"; an invented path would instead fail later as
    // "not owned by any feature", which is not what is wrong.
    expect(resolveDebugFixFilePath(
      session({ proposedFix: { summary: "x", touchedFiles: ["src/teams/index.ts"], patchKind: "root_cause" } }),
      workspace,
    )).toBeUndefined();
  });

  it("still uses the selected file or node when the analysis names none", () => {
    expect(resolveDebugFixFilePath(
      session({ scope: { kind: "file", nodeId: "feat_team", selectedFilePath: "lib/team.ts" } as never }),
      workspace,
    )).toBe("lib/team.ts");
    expect(resolveDebugFixFilePath(
      session({ scope: { kind: "node", nodeId: "feat_team" } as never }),
      workspace,
    )).toBe("lib/team.ts");
  });
});
