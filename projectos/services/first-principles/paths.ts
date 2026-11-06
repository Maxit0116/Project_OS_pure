import { join } from "node:path";

export function thesisDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "thesis");
}

export function thesisIndexPath(workspaceRoot: string): string {
  return join(thesisDir(workspaceRoot), "index.json");
}

export function thesisSessionPath(workspaceRoot: string, id: string): string {
  return join(thesisDir(workspaceRoot), `${id}.json`);
}
