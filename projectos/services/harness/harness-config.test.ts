import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  loadAgentHarnessConfig,
  saveAgentHarnessConfig,
} from "./harness-config.js";

describe("agent harness config", () => {
  it("round-trips permissions, sandbox, and model variants", () => {
    const root = mkdtempSync(join(tmpdir(), "pos-harness-cfg-"));
    const saved = saveAgentHarnessConfig(root, {
      permissions: {
        version: "0.1.0",
        rules: [{ effect: "allow", tool: "shell", match: "npm *" }],
      },
      sandbox: {
        version: "0.1.0",
        networkAccess: false,
        additionalWritableRoots: [],
        allowTempWrites: true,
      },
      modelHarness: {
        version: "0.1.0",
        variants: [{ match: { model: "claude-*" }, systemDelta: "Be concise." }],
      },
    });
    expect(loadAgentHarnessConfig(root)).toEqual(saved);
    expect(saved.permissions.rules[0]?.tool).toBe("shell");
    expect(saved.modelHarness.variants[0]?.systemDelta).toBe("Be concise.");
  });
});
