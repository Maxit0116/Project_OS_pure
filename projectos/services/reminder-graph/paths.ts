import { join } from "node:path";

export function reminderTimelinePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "timeline.json");
}

export function reminderDocsGlobRoots(workspaceRoot: string): string[] {
  return [join(workspaceRoot, "docs", "features")];
}
