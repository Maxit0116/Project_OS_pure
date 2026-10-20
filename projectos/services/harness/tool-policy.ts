import type {
  CapabilityContext,
  HarnessToolName,
  PolicyDecision,
  ToolCallRequest,
  ToolPermissionRule,
} from "../../contracts/tool-policy.js";
import { HarnessToolNameSchema } from "../../contracts/tool-policy.js";
import { ProjectOSError } from "../../errors.js";
import { deniedToolResult, knownHarnessTool } from "./tool-result.js";
import { resolvePermissionRules } from "./permissions.js";

/** Tools that require an explicit project permission allow (H3). */
const SIDE_EFFECT_TOOLS: ReadonlySet<HarnessToolName> = new Set([
  "shell",
  "mcp_tool",
  "fetch",
]);

const WRITE_TOOLS: ReadonlySet<HarnessToolName> = new Set([
  "generate_diff",
  "apply_diff",
]);

const READ_PATH_TOOLS: ReadonlySet<HarnessToolName> = new Set([
  "read_file",
  "get_context",
  "grep_workspace",
]);

export interface EvaluateToolCallOptions {
  /** Project `.projectos/permissions.json` rules (Deny > Ask > Allow). */
  rules?: readonly ToolPermissionRule[];
}

function allow(tool: string, reason: string): PolicyDecision {
  return { decision: "allow", tool, reason };
}

function deny(tool: string, reason: string): PolicyDecision {
  return { decision: "deny", tool, reason };
}

function ask(tool: string, reason: string): PolicyDecision {
  return { decision: "ask", tool, reason };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function pathAllowed(path: string, allowed: readonly string[]): boolean {
  const target = normalizePath(path);
  return allowed.some((entry) => normalizePath(entry) === target);
}

function requestedPaths(request: ToolCallRequest): string[] {
  const paths: string[] = [];
  if (request.path) paths.push(request.path);
  if (request.paths) paths.push(...request.paths);
  return [...new Set(paths.map(normalizePath))];
}

function evaluateRead(
  tool: HarnessToolName,
  request: ToolCallRequest,
  context: CapabilityContext,
): PolicyDecision {
  const paths = requestedPaths(request);
  if (paths.length === 0) {
    return deny(tool, `${tool} requires a path inside allowedReadPaths`);
  }
  for (const path of paths) {
    if (!pathAllowed(path, context.allowedReadPaths)) {
      return deny(
        tool,
        `Path '${path}' is outside allowedReadPaths for mode '${context.mode}'`,
      );
    }
  }
  return allow(tool, `Read authorized for ${paths.length} path(s)`);
}

function evaluateWrite(
  tool: HarnessToolName,
  request: ToolCallRequest,
  context: CapabilityContext,
): PolicyDecision {
  if (!context.writeCapability) {
    return deny(
      tool,
      `Write tool '${tool}' denied: mode '${context.mode}' has writeCapability=false`,
    );
  }
  if (context.allowedWritePaths.length === 0) {
    return deny(tool, `Write tool '${tool}' denied: zero write authorization`);
  }
  const paths = requestedPaths(request);
  if (paths.length === 0) {
    return deny(tool, `${tool} requires at least one target path`);
  }
  for (const path of paths) {
    if (!pathAllowed(path, context.allowedWritePaths)) {
      return deny(
        tool,
        `Path '${path}' is outside allowedWritePaths`,
      );
    }
  }
  return allow(tool, `Write authorized for ${paths.length} path(s)`);
}

function evaluateSideEffectTool(
  tool: HarnessToolName,
  request: ToolCallRequest,
  rules: readonly ToolPermissionRule[],
): PolicyDecision {
  const effect = resolvePermissionRules(rules, tool, request.match);
  if (effect === "allow") {
    return allow(
      tool,
      `Allowed by project permissions${request.match ? ` for '${request.match}'` : ""}`,
    );
  }
  if (effect === "ask") {
    return ask(
      tool,
      `Project permissions require approval for '${tool}'${request.match ? ` (${request.match})` : ""}`,
    );
  }
  if (effect === "deny") {
    return deny(
      tool,
      `Denied by project permissions for '${tool}'${request.match ? ` (${request.match})` : ""}`,
    );
  }
  return deny(
    tool,
    `Tool '${tool}' requires an allow rule in .projectos/permissions.json`,
  );
}

/**
 * Evaluate a tool call against capability context + optional project rules.
 * Project rules use Deny > Ask > Allow; unmatched side-effect tools deny.
 */
export function evaluateToolCall(
  request: ToolCallRequest,
  context: CapabilityContext,
  options: EvaluateToolCallOptions = {},
): PolicyDecision {
  const rules = options.rules ?? [];
  const parsedName = HarnessToolNameSchema.safeParse(request.tool);
  if (!parsedName.success) {
    return deny(request.tool, `Unknown tool '${request.tool}'`);
  }
  const tool = parsedName.data;

  // Project rules can deny anything first (including otherwise-allowed reads).
  const ruleEffect = resolvePermissionRules(rules, tool, request.match);
  if (ruleEffect === "deny") {
    return deny(
      tool,
      `Denied by project permissions for '${tool}'${request.match ? ` (${request.match})` : ""}`,
    );
  }

  if (SIDE_EFFECT_TOOLS.has(tool)) {
    return evaluateSideEffectTool(tool, request, rules);
  }

  if (tool === "grep_workspace") {
    // Named tool still deferred as model-callable; heuristic Ask uses read_file.
    if (ruleEffect === "allow") {
      return evaluateRead(tool, request, context);
    }
    return deny(
      tool,
      `Tool '${tool}' is not enabled as a model-callable tool (use Ask exploration)`,
    );
  }

  if (tool === "list_files" || tool === "git_status") {
    if (ruleEffect === "ask") {
      return ask(tool, `Project permissions require approval for ${tool}`);
    }
    return allow(
      tool,
      tool === "git_status"
        ? "Git status is read-only repository metadata"
        : "Listing semantic file index is read-only metadata",
    );
  }

  if (READ_PATH_TOOLS.has(tool)) {
    const pathDecision = evaluateRead(tool, request, context);
    if (pathDecision.decision !== "allow") return pathDecision;
    if (ruleEffect === "ask") {
      return ask(tool, `Project permissions require approval for '${tool}'`);
    }
    return pathDecision;
  }

  if (WRITE_TOOLS.has(tool)) {
    const writeDecision = evaluateWrite(tool, request, context);
    if (writeDecision.decision !== "allow") return writeDecision;
    if (ruleEffect === "ask") {
      return ask(tool, `Project permissions require approval for '${tool}'`);
    }
    return writeDecision;
  }

  if (tool === "run_verification") {
    if (!context.writeCapability) {
      return deny(
        tool,
        "Verification requires a write-capable agent mode",
      );
    }
    if (ruleEffect === "ask") {
      return ask(tool, "Project permissions require approval for verification");
    }
    return allow(tool, "Verification allowed after authorized write path");
  }

  return deny(tool, `No policy rule for tool '${tool}'`);
}

/** Throw {@link ProjectOSError} `tool_policy_denied` unless decision is allow. */
export function assertToolAllowed(
  request: ToolCallRequest,
  context: CapabilityContext,
  options: EvaluateToolCallOptions = {},
): PolicyDecision {
  const decision = evaluateToolCall(request, context, options);
  if (decision.decision === "allow") {
    return decision;
  }
  const harnessTool = knownHarnessTool(decision.tool);
  throw new ProjectOSError("tool_policy_denied", decision.reason, {
    details: {
      tool: decision.tool,
      decision: decision.decision,
      mode: context.mode,
      allowedReadPaths: context.allowedReadPaths,
      allowedWritePaths: context.allowedWritePaths,
      writeCapability: context.writeCapability,
      ...(harnessTool
        ? { toolResult: deniedToolResult(harnessTool, decision.reason) }
        : {}),
    },
  });
}

/**
 * Build a write-capable context for generate/apply scope checks.
 * Identity (inode/device) revalidation stays in the caller after this allows.
 */
export function writeCapabilityContext(options: {
  mode?: CapabilityContext["mode"];
  allowedWritePaths: readonly string[];
  executionPolicy?: CapabilityContext["executionPolicy"];
}): CapabilityContext {
  return {
    mode: options.mode ?? "change",
    allowedReadPaths: [],
    allowedWritePaths: [...options.allowedWritePaths],
    writeCapability: true,
    ...(options.executionPolicy
      ? { executionPolicy: options.executionPolicy }
      : {}),
  };
}

export function readCapabilityContext(options: {
  mode?: CapabilityContext["mode"];
  allowedReadPaths: readonly string[];
}): CapabilityContext {
  return {
    mode: options.mode ?? "ask",
    allowedReadPaths: [...options.allowedReadPaths],
    allowedWritePaths: [],
    writeCapability: false,
  };
}

/** Map legacy agent-tools camelCase names onto harness tool ids. */
export function harnessToolNameFromAgentTool(
  toolName: string,
): string {
  switch (toolName) {
    case "readFile":
      return "read_file";
    case "listFiles":
      return "list_files";
    case "getContext":
      return "get_context";
    default:
      return toolName;
  }
}
