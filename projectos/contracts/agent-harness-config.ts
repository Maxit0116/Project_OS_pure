import { z } from "zod";

import { ModelHarnessDocumentSchema } from "./model-harness.js";
import { ShellSandboxConfigSchema } from "./shell-sandbox.js";
import { ToolPermissionDocumentSchema } from "./tool-policy.js";

/** Editable Agent Harness project files (permissions, sandbox, model variants). */
export const AgentHarnessConfigSchema = z
  .object({
    permissions: ToolPermissionDocumentSchema,
    sandbox: ShellSandboxConfigSchema,
    modelHarness: ModelHarnessDocumentSchema,
  })
  .strict();

export type AgentHarnessConfig = z.infer<typeof AgentHarnessConfigSchema>;
