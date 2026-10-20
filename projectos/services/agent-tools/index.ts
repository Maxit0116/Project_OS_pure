import { readFileSync } from "node:fs";

import type { CapabilityContext } from "../../contracts/tool-policy.js";
import type { ContextPayload } from "../../contracts/context.js";
import type { LoadedProjectOSWorkspace } from "../../persistence/workspace-store.js";
import { resolveContainedPath } from "../../utils/path-containment.js";
import type { ToolResult } from "../../contracts/tool-result.js";
import { queryGitReadOnlyStatus } from "../git-context-service.js";
import {
  assertToolAllowed,
  harnessToolNameFromAgentTool,
} from "../harness/tool-policy.js";

export interface AgentToolContext {
  workspace: LoadedProjectOSWorkspace;
  getNodeContext: (nodeId: string) => Promise<ContextPayload>;
  getFileContext: (path: string) => Promise<ContextPayload>;
}

export interface AgentToolResult {
  tool: string;
  output: string;
  toolResult?: ToolResult;
}

/**
 * Execute a legacy agent-tools call under Agent Harness ToolPolicy.
 * Callers must supply a server-assembled {@link CapabilityContext}.
 */
export async function runAgentTool(
  toolName: string,
  args: Record<string, string>,
  context: AgentToolContext,
  policy: CapabilityContext,
): Promise<AgentToolResult> {
  switch (toolName) {
    case "readFile": {
      assertToolAllowed(
        { tool: "read_file", path: args.path ?? "" },
        policy,
      );
      return {
        tool: toolName,
        output: readWorkspaceFile(context.workspace, args.path ?? ""),
      };
    }
    case "listFiles": {
      assertToolAllowed({ tool: "list_files" }, policy);
      return {
        tool: toolName,
        output: listSemanticFiles(context.workspace, args.nodeId),
      };
    }
    case "git_status": {
      const toolResult = queryGitReadOnlyStatus(
        context.workspace.workspaceRoot,
        policy,
      );
      return { tool: toolName, output: toolResult.summary, toolResult };
    }
    case "getContext": {
      if (args.filePath?.trim()) {
        assertToolAllowed(
          { tool: "get_context", path: args.filePath },
          policy,
        );
        const fileContext = await context.getFileContext(args.filePath);
        return { tool: toolName, output: fileContext.rawContextMarkdown };
      }
      if (args.nodeId?.trim()) {
        // Node-scoped context has no single path; treat as read-only index access.
        assertToolAllowed({ tool: "list_files" }, policy);
        const nodeContext = await context.getNodeContext(args.nodeId);
        return { tool: toolName, output: nodeContext.rawContextMarkdown };
      }
      return { tool: toolName, output: "No nodeId or filePath provided." };
    }
    default: {
      // Unknown legacy names fail closed through Policy.
      assertToolAllowed(
        { tool: harnessToolNameFromAgentTool(toolName) },
        policy,
      );
      return { tool: toolName, output: `Unknown tool: ${toolName}` };
    }
  }
}

function readWorkspaceFile(workspace: LoadedProjectOSWorkspace, relativePath: string): string {
  if (!relativePath.trim()) return "readFile requires path";
  const absolute = resolveContainedPath(workspace.workspaceRoot, relativePath);
  return readFileSync(absolute, "utf8");
}

function listSemanticFiles(workspace: LoadedProjectOSWorkspace, nodeId?: string): string {
  const files = workspace.graph.fileIndex
    .filter((entry) => !nodeId || entry.nodeIds.includes(nodeId))
    .map((entry) => entry.path);
  return files.length > 0 ? files.join("\n") : "(no files)";
}
