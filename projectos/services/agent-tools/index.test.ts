import { describe, expect, it } from "vitest";

import type { LoadedProjectOSWorkspace } from "../../persistence/workspace-store.js";
import { readCapabilityContext } from "../harness/tool-policy.js";
import { runAgentTool } from "./index.js";

describe("runAgentTool policy gate (T-2)", () => {
  const context = {
    workspace: { workspaceRoot: process.cwd() } as LoadedProjectOSWorkspace,
    getNodeContext: async () => {
      throw new Error("context should not be read");
    },
    getFileContext: async () => {
      throw new Error("context should not be read");
    },
  };
  const policy = readCapabilityContext({ allowedReadPaths: ["src/a.ts"] });

  it("denies grep_workspace and unknown tool names", async () => {
    await expect(
      runAgentTool("grep_workspace", { path: "src/a.ts" }, context, policy),
    ).rejects.toMatchObject({ code: "tool_policy_denied" });
    await expect(
      runAgentTool("brand_new_tool", {}, context, policy),
    ).rejects.toMatchObject({ code: "tool_policy_denied" });
  });
});