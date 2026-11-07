import { join } from "node:path";

export function labStatePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "lab", "state.json");
}
