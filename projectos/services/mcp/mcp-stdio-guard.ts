import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { McpServerConfig } from "../../contracts/settings.js";

export class McpStdioGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpStdioGuardError";
  }
}

export function assertMcpStdioConfigAllowed(
  config: McpServerConfig,
  workspaceRoot: string,
): { command: string; args: string[]; cwd: string; env?: Record<string, string> } {
  if (config.transport !== "stdio") {
    throw new McpStdioGuardError("stdio guard requires transport=stdio");
  }
  const command = config.command?.trim();
  if (!command) {
    throw new McpStdioGuardError("stdio MCP servers require a command");
  }
  if (command.includes("\0") || command.includes("\n") || command.includes("\r")) {
    throw new McpStdioGuardError("stdio MCP command contains invalid characters");
  }

  let cwd = workspaceRoot;
  if (config.cwd?.trim()) {
    const requested = config.cwd.trim();
    const absolute = isAbsolute(requested)
      ? requested
      : resolve(workspaceRoot, requested);
    let realRoot: string;
    let realCwd: string;
    try {
      realRoot = realpathSync(workspaceRoot);
      if (!existsSync(absolute)) {
        throw new McpStdioGuardError("stdio MCP cwd does not exist");
      }
      realCwd = realpathSync(absolute);
    } catch (error) {
      if (error instanceof McpStdioGuardError) throw error;
      throw new McpStdioGuardError(
        `stdio MCP cwd is not resolvable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const rootPrefix = realRoot.endsWith("/") ? realRoot : `${realRoot}/`;
    if (realCwd !== realRoot && !realCwd.startsWith(rootPrefix)) {
      throw new McpStdioGuardError("stdio MCP cwd must stay inside the workspace");
    }
    if (!statSync(realCwd).isDirectory()) {
      throw new McpStdioGuardError("stdio MCP cwd must be a directory");
    }
    cwd = realCwd;
  }

  const args = [...(config.args ?? [])];
  for (const arg of args) {
    if (arg.includes("\0")) {
      throw new McpStdioGuardError("stdio MCP args contain invalid characters");
    }
  }

  return {
    command,
    args,
    cwd,
    ...(config.env ? { env: { ...config.env } } : {}),
  };
}
