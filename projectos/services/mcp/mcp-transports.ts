import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type { McpServerConfig } from "../../contracts/settings.js";
import type { SecretStore } from "../../persistence/secret-store.js";
import {
  assertMcpHttpHostResolvesSafely,
  assertMcpHttpUrlAllowed,
  createMcpGuardedFetch,
} from "./mcp-http-guard.js";
import { assertMcpStdioConfigAllowed } from "./mcp-stdio-guard.js";

export interface McpConnectedSession {
  client: Client;
  close: () => Promise<void>;
}

export async function connectMcpServer(input: {
  config: McpServerConfig;
  workspaceRoot: string;
  secretStore: SecretStore;
}): Promise<McpConnectedSession> {
  const { config, workspaceRoot, secretStore } = input;
  if (config.transport === "stdio") {
    const guarded = assertMcpStdioConfigAllowed(config, workspaceRoot);
    const env = {
      ...getDefaultEnvironment(),
      ...(guarded.env ?? {}),
    };
    const transport = new StdioClientTransport({
      command: guarded.command,
      args: guarded.args,
      env,
      cwd: guarded.cwd,
      stderr: "pipe",
    });
    return connectWithTransport(transport);
  }

  const url = assertMcpHttpUrlAllowed(config.url ?? "");
  await assertMcpHttpHostResolvesSafely(url);
  const headers: Record<string, string> = { ...(config.headers ?? {}) };
  if (config.authRef) {
    const token = await secretStore.get(config.authRef);
    if (token?.trim()) {
      headers.Authorization = headers.Authorization ?? `Bearer ${token.trim()}`;
    }
  }
  const requestInit =
    Object.keys(headers).length > 0 ? { headers } : undefined;
  const guardedFetch = createMcpGuardedFetch();

  // Prefer Streamable HTTP; fall back to legacy SSE for servers still on that transport.
  try {
    const transport = new StreamableHTTPClientTransport(url, {
      ...(requestInit ? { requestInit } : {}),
      fetch: guardedFetch,
    });
    return await connectWithTransport(transport as Transport);
  } catch (streamableError) {
    try {
      const transport = new SSEClientTransport(url, {
        ...(requestInit ? { requestInit } : {}),
        fetch: guardedFetch,
      });
      return await connectWithTransport(transport as Transport);
    } catch (sseError) {
      const streamableMessage =
        streamableError instanceof Error
          ? streamableError.message
          : String(streamableError);
      const sseMessage =
        sseError instanceof Error ? sseError.message : String(sseError);
      throw new Error(
        `MCP HTTP connect failed (streamable: ${streamableMessage}; sse: ${sseMessage})`,
      );
    }
  }
}

async function connectWithTransport(transport: Transport): Promise<McpConnectedSession> {
  const client = new Client({ name: "project-os", version: "0.1.0" });
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close().catch(() => undefined);
      await transport.close?.().catch(() => undefined);
    },
  };
}
