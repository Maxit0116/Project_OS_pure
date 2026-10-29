import { describe, expect, it, vi } from "vitest";

import { InMemorySecretStore } from "../../persistence/secret-store.js";
import { McpSessionManager } from "./mcp-session-manager.js";

describe("McpSessionManager", () => {
  it("caches clients per project+server and reconnects on config change", async () => {
    const close = vi.fn(async () => undefined);
    const connect = vi.fn(async () => ({
      client: { id: Math.random() } as never,
      close,
    }));
    const manager = new McpSessionManager({ connect });
    const secrets = new InMemorySecretStore();
    const base = {
      id: "docs",
      name: "Docs",
      enabled: true,
      transport: "stdio" as const,
      command: "node",
    };

    const first = await manager.getClient({
      projectId: "p1",
      config: base,
      workspaceRoot: "/tmp",
      secretStore: secrets,
    });
    const second = await manager.getClient({
      projectId: "p1",
      config: base,
      workspaceRoot: "/tmp",
      secretStore: secrets,
    });
    expect(first).toBe(second);
    expect(connect).toHaveBeenCalledTimes(1);

    await manager.getClient({
      projectId: "p1",
      config: { ...base, args: ["--reload"] },
      workspaceRoot: "/tmp",
      secretStore: secrets,
    });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);

    await manager.disposeProject("p1");
    expect(close).toHaveBeenCalledTimes(2);
  });
});
