import { join } from "node:path";

export function wireframesRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "wireframes");
}

export function wireframesIndexPath(workspaceRoot: string): string {
  return join(wireframesRoot(workspaceRoot), "index.json");
}

export function packDir(workspaceRoot: string, packId: string): string {
  return join(wireframesRoot(workspaceRoot), packId);
}

export function packDraftPath(workspaceRoot: string, packId: string): string {
  return join(packDir(workspaceRoot, packId), "draft.json");
}

export function packVersionDir(
  workspaceRoot: string,
  packId: string,
  version: number,
): string {
  return join(packDir(workspaceRoot, packId), `v${version}`);
}

export function packFrozenPath(
  workspaceRoot: string,
  packId: string,
  version: number,
): string {
  return join(packVersionDir(workspaceRoot, packId, version), "pack.json");
}

export function packScreenHtmlPath(
  workspaceRoot: string,
  packId: string,
  versionOrDraft: "draft" | number,
  screenId: string,
): string {
  const base =
    versionOrDraft === "draft"
      ? join(packDir(workspaceRoot, packId), "draft-screens")
      : join(packVersionDir(workspaceRoot, packId, versionOrDraft), "screens");
  return join(base, `${screenId}.html`);
}

export function packGapsPath(workspaceRoot: string, packId: string): string {
  return join(packDir(workspaceRoot, packId), "gaps.json");
}
