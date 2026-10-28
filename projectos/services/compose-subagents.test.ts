import { describe, expect, it, vi } from "vitest";

import { emptyPinComposerHub } from "../contracts/spatial-pin.js";
import {
  buildComposeSubagentQuestion,
  spawnComposeSubagents,
} from "./compose-subagents.js";

describe("compose-subagents", () => {
  it("builds a role-scoped question with hub context", () => {
    const hub = {
      ...emptyPinComposerHub(),
      repo: { label: "acme/app", branch: "main" },
      folders: ["src/ui"],
      skillIds: ["motion"],
      researchEnabled: true,
    };
    const question = buildComposeSubagentQuestion({
      slotName: "Explorer",
      slotBrief: "Map the night sky module",
      parentPrompt: "Create a small night sky scene",
      hub,
    });
    expect(question).toContain('subagent "Explorer"');
    expect(question).toContain("Map the night sky module");
    expect(question).toContain("acme/app");
    expect(question).toContain("src/ui");
    expect(question).toContain("/motion".slice(1));
    expect(question).toContain("Create a small night sky scene");
  });

  it("spawns enabled slots and captures per-slot failures", async () => {
    const hub = {
      ...emptyPinComposerHub(),
      subagents: [
        { id: "a", name: "A", brief: "one", enabled: true },
        { id: "b", name: "B", brief: "two", enabled: false },
        { id: "c", name: "C", brief: "three", enabled: true },
      ],
    };
    const ask = vi.fn(async (input: { slotId: string }) => {
      if (input.slotId === "c") throw new Error("boom");
      return { answer: `ok-${input.slotId}`, runId: `run_${input.slotId}` };
    });
    const result = await spawnComposeSubagents(hub, "parent task", { ask });
    expect(result.results).toHaveLength(2);
    expect(result.links.find((l) => l.slotId === "a")?.status).toBe("done");
    expect(result.links.find((l) => l.slotId === "c")?.status).toBe("error");
    expect(result.childRunIds).toEqual(["run_a"]);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
