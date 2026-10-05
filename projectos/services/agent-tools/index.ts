import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ContextPayload } from "../../contracts/context.js";
import type { LoadedProjectOSWorkspace } from "../../persistence/workspace-store.js";
import { resolveContainedPath } from "../../utils/path-containment.js";

export interface AgentToolContext {
  workspace: LoadedProjectOSWorkspace;
  getNodeContext: (nodeId: string) => Promise<ContextPayload>;
  getFileContext: (path: string) => Promise<ContextPayload>;
}

export interface AgentToolResult {
  tool: string;
  output: string;
}

export async function runAgentTool(
  toolName: string,
  args: Record<string, string>,
  context: AgentToolContext,
): Promise<AgentToolResult> {
  switch (toolName) {
    case "readFile":
      return {
        tool: toolName,
        output: readWorkspaceFile(context.workspace, args.path ?? ""),
      };
    case "listFiles":
      return {
        tool: toolName,
        output: listSemanticFiles(context.workspace, args.nodeId),
      };
    case "getContext":
      if (args.filePath) {
        const fileContext = await context.getFileContext(args.filePath);
        return { tool: toolName, output: fileContext.rawContextMarkdown };
      }
      if (args.nodeId) {
        const nodeContext = await context.getNodeContext(args.nodeId);
        return { tool: toolName, output: nodeContext.rawContextMarkdown };
      }
      return { tool: toolName, output: "No nodeId or filePath provided." };
    default:
      return { tool: toolName, output: `Unknown tool: ${toolName}` };
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
