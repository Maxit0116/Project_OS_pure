/**
 * Agent Harness (runtime) — distinct from Debug HarnessRecord archives
 * (`contracts/harness.ts` / `.projectos/harness/*.json`).
 *
 * H0 ToolPolicy · H1 Ask exploration · H2 Instructions · H3 permissions
 * See `docs/features/Agent-Harness-Dev-Plan.md`.
 *
 * Convention: new tools must register in the tool registry and pass
 * {@link evaluateToolCall} / {@link assertToolAllowed}. Loop steps,
 * verification repair, and the symbol index do not add another spawn
 * or write entry. Do not add a switch that trusts the rest of a run.
 */

export {
  loadModelHarnessDocument,
  modelHarnessSystemDelta,
  resolveModelHarnessVariant,
} from "./model-variants.js";
export {
  loadAgentHarnessConfig,
  saveAgentHarnessConfig,
} from "./harness-config.js";
export { buildHarnessInstructions } from "./instructions.js";
export {
  UNTRUSTED_CONTENT_CATALOG,
  UNTRUSTED_CONTEXT_SOURCES,
  projectRulesSection,
} from "./untrusted-context.js";
export type {
  UntrustedContentKind,
  UntrustedContextSource,
} from "./untrusted-context.js";
export {
  AgentMemoryStore,
  hashMemoryIndex,
  parseExplicitMemoryCommand,
  renderMemoryFence,
} from "./memory.js";
export type {
  BuildHarnessInstructionsInput,
  HarnessSkillBody,
} from "./instructions.js";
export {
  loadToolPermissionDocument,
  matchPermissionGlob,
  resolvePermissionRules,
} from "./permissions.js";
export { reconcileInterruptedAgentRuns } from "./interrupted-runs.js";
export { decideHarnessResume } from "./resume-policy.js";
export { runHarnessShell } from "./run-shell.js";
export type { RunHarnessShellInput, RunHarnessShellResult } from "./run-shell.js";
export {
  applyDiffToToolResult,
  deniedToolResult,
  parseFailedTestCount,
  shellCommandToToolResult,
} from "./tool-result.js";
export { loadProjectRules, loadProjectRulesMarkdown } from "./rules.js";
export {
  classifyShellInvocation,
  loadShellSandboxConfig,
  PROTECTED_PATH_SUFFIXES,
  runSandboxedCommand,
} from "./shell-sandbox.js";
export type {
  RunSandboxedCommandInput,
  RunSandboxedCommandResult,
} from "./shell-sandbox.js";
export {
  assertToolAllowed,
  evaluateToolCall,
  harnessToolNameFromAgentTool,
  readCapabilityContext,
  writeCapabilityContext,
} from "./tool-policy.js";
export type { EvaluateToolCallOptions } from "./tool-policy.js";
export {
  createAgentWorktree,
  getAgentWorktree,
  getAgentWorktreeDiff,
  listAgentWorktrees,
  loadAgentWorktreeManifest,
  mergeAgentWorktree,
  removeAgentWorktree,
} from "./worktree.js";
