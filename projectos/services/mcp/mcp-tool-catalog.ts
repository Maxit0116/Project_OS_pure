import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import type {
  McpServerConfig,
  McpToolDescriptor,
} from "../../contracts/settings.js";
import type { ModelToolDefinition } from "../../contracts/model-gateway.js";
import type { ToolPermissionRule } from "../../contracts/tool-policy.js";
import { resolvePermissionRules } from "../harness/permissions.js";
import { formatMcpToolName } from "./mcp-names.js";

export interface ListedMcpTool {
  serverId: string;
  descriptor: McpToolDescriptor;
  modelTool: ModelToolDefinition;
  qualifiedName: string;
}

export async function listServerToolDescriptors(
  client: Client,
): Promise<McpToolDescriptor[]> {
  const listed = await client.listTools();
  return listed.tools.map((tool) => ({
    name: tool.name,
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.inputSchema
      ? { inputSchema: tool.inputSchema as Record<string, unknown> }
      : {}),
  }));
}

export function buildMcpToolCatalog(input: {
  servers: readonly McpServerConfig[];
  toolsByServerId: ReadonlyMap<string, readonly McpToolDescriptor[]>;
  permissionRules: readonly ToolPermissionRule[];
}): ListedMcpTool[] {
  const out: ListedMcpTool[] = [];
  for (const server of input.servers) {
    if (!server.enabled) continue;
    const tools = input.toolsByServerId.get(server.id) ?? [];
    const allowlist = server.toolAllowlist
      ? new Set(server.toolAllowlist)
      : null;
    for (const tool of tools) {
      if (allowlist && !allowlist.has(tool.name)) continue;
      const qualifiedName = formatMcpToolName(server.id, tool.name);
      const effect = resolvePermissionRules(
        input.permissionRules,
        "mcp_tool",
        qualifiedName,
      );
      // Only expose tools that project permissions allow (or ask — ask still
      // needs to be in the model tool table so the gateway can return ask).
      if (effect !== "allow" && effect !== "ask") continue;
      out.push({
        serverId: server.id,
        descriptor: tool,
        qualifiedName,
        modelTool: {
          type: "function",
          function: {
            name: qualifiedName,
            ...(tool.description ? { description: tool.description } : {}),
            parameters: (tool.inputSchema ?? {
              type: "object",
              properties: {},
            }) as Record<string, unknown>,
          },
        },
      });
    }
  }
  return out;
}
