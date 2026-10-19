import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  AgentHarnessConfigSchema,
  type AgentHarnessConfig,
} from "../../contracts/agent-harness-config.js";
import { loadModelHarnessDocument } from "./model-variants.js";
import { loadToolPermissionDocument } from "./permissions.js";
import { loadShellSandboxConfig } from "./shell-sandbox.js";

const PERMISSIONS_FILE = ".projectos/permissions.json";
const SANDBOX_FILE = ".projectos/sandbox.json";
const MODEL_HARNESS_FILE = ".projectos/model-harness.json";

export function loadAgentHarnessConfig(workspaceRoot: string): AgentHarnessConfig {
  return AgentHarnessConfigSchema.parse({
    permissions: loadToolPermissionDocument(workspaceRoot),
    sandbox: loadShellSandboxConfig(workspaceRoot),
    modelHarness: loadModelHarnessDocument(workspaceRoot),
  });
}

function writeDocument(workspaceRoot: string, relativePath: string, value: unknown): void {
  const absolute = join(workspaceRoot, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function saveAgentHarnessConfig(
  workspaceRoot: string,
  config: AgentHarnessConfig,
): AgentHarnessConfig {
  const parsed = AgentHarnessConfigSchema.parse(config);
  writeDocument(workspaceRoot, PERMISSIONS_FILE, parsed.permissions);
  writeDocument(workspaceRoot, SANDBOX_FILE, parsed.sandbox);
  writeDocument(workspaceRoot, MODEL_HARNESS_FILE, parsed.modelHarness);
  return loadAgentHarnessConfig(workspaceRoot);
}
