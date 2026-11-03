import { describe, expect, it } from "vitest";

import { getLoopGraphPreset } from "../contracts/loop-presets.js";
import { validateLoopSpecTopology } from "../contracts/loop-graph.js";
import { compileIntentGraphHeuristic } from "./loop-graph-compiler.js";

describe("loop-graph-compiler architecture", () => {
  it("compiles Feature Development preset with typed nodes and PR permission", () => {
    const preset = getLoopGraphPreset("feature_development");
    expect(preset).toBeTruthy();
    const compiled = compileIntentGraphHeuristic(preset!.draft, {
      now: "2026-11-03T00:00:00.000Z",
    });
    expect(compiled.specDraft.nodes.some((node) => node.agentRole === "planner")).toBe(
      true,
    );
    expect(
      compiled.specDraft.nodes.some(
        (node) =>
          node.type === "logic" && node.logicKind === "condition",
      ),
    ).toBe(true);
    expect(
      compiled.specDraft.permissions.some((perm) => perm.action === "github.create_pr"),
    ).toBe(true);
    expect(validateLoopSpecTopology(compiled.specDraft)).toEqual([]);
  });
});
