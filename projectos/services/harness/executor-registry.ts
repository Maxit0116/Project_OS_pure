import type { ExecutorCapabilities } from "../../contracts/executor-adapter.js";
import type { NodeExecutorAdapter } from "./executor-adapter.js";

export interface RegisteredExecutor {
  id: string;
  capabilities: ExecutorCapabilities;
  enabled: boolean;
}

export class ExecutorRegistry {
  private readonly adapters = new Map<string, NodeExecutorAdapter>();

  register(adapter: NodeExecutorAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Executor adapter '${adapter.id}' is already registered`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  resolve(id: string): NodeExecutorAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): RegisteredExecutor[] {
    return [...this.adapters.values()].map((adapter) => ({
      id: adapter.id,
      capabilities: adapter.describe(),
      enabled: true,
    }));
  }
}
