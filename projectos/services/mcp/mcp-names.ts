const MCP_TOOL_PREFIX = "mcp:";

export function formatMcpToolName(serverId: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverId}:${toolName}`;
}

export function parseMcpToolName(
  qualifiedName: string,
): { serverId: string; toolName: string } | null {
  if (!qualifiedName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = qualifiedName.slice(MCP_TOOL_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0 || sep >= rest.length - 1) return null;
  const serverId = rest.slice(0, sep);
  const toolName = rest.slice(sep + 1);
  if (!serverId || !toolName) return null;
  return { serverId, toolName };
}
