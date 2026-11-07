import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import type { McpServerConfig } from "../../contracts/settings.js";
import type { SecretStore } from "../../persistence/secret-store.js";
import { connectMcpServer, type McpConnectedSession } from "./mcp-transports.js";

export type McpConnectFn = (input: {
  config: McpServerConfig;
  workspaceRoot: string;
  secretStore: SecretStore;
}) => Promise<McpConnectedSession>;

interface CachedSession {
  fingerprint: string;
  session: McpConnectedSession;
}

export class McpSessionManager {
  private readonly sessions = new Map<string, CachedSession>();
  private readonly connect: McpConnectFn;

  constructor(options?: { connect?: McpConnectFn }) {
    this.connect = options?.connect ?? connectMcpServer;
  }

  async getClient(input: {
    projectId: string;
    config: McpServerConfig;
    workspaceRoot: string;
    secretStore: SecretStore;
  }): Promise<Client> {
    const key = `${input.projectId}:${input.config.id}`;
    const fingerprint = fingerprintConfig(input.config);
    const existing = this.sessions.get(key);
    if (existing && existing.fingerprint === fingerprint) {
      return existing.session.client;
    }
    if (existing) {
      await existing.session.close().catch(() => undefined);
      this.sessions.delete(key);
    }
    const session = await this.connect({
      config: input.config,
      workspaceRoot: input.workspaceRoot,
      secretStore: input.secretStore,
    });
    this.sessions.set(key, { fingerprint, session });
    return session.client;
  }

  async disposeServer(projectId: string, serverId: string): Promise<void> {
    const key = `${projectId}:${serverId}`;
    const existing = this.sessions.get(key);
    if (!existing) return;
    this.sessions.delete(key);
    await existing.session.close().catch(() => undefined);
  }

  async disposeProject(projectId: string): Promise<void> {
    const prefix = `${projectId}:`;
    const keys = [...this.sessions.keys()].filter((key) => key.startsWith(prefix));
    await Promise.all(keys.map(async (key) => {
      const existing = this.sessions.get(key);
      this.sessions.delete(key);
      await existing?.session.close().catch(() => undefined);
    }));
  }

  async disposeAll(): Promise<void> {
    const entries = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(entries.map((entry) => entry.session.close().catch(() => undefined)));
  }
}

function fingerprintConfig(config: McpServerConfig): string {
  return JSON.stringify({
    transport: config.transport,
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
    url: config.url,
    headers: config.headers,
    authRef: config.authRef,
  });
}
