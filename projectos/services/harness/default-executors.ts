import { ExecutorRegistry } from "./executor-registry.js";
import { ScriptedExecutorAdapter } from "./scripted-executor.js";

/**
 * The executors a build offers besides model profiles. The production list is
 * empty today; the scripted executor is added only for development and demo
 * builds, and its label always says so.
 */
export function createExecutorRegistry(options: { scripted: boolean }): ExecutorRegistry {
  const registry = new ExecutorRegistry();
  if (options.scripted) registry.register(new ScriptedExecutorAdapter());
  return registry;
}
