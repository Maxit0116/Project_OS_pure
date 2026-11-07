import { join } from "node:path";
import { DIAGRAM_DESIGN_SKILL_ID } from "../../contracts/diagram-graph.js";

export function diagramsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "diagrams");
}

export function diagramsIndexPath(workspaceRoot: string): string {
  return join(diagramsRoot(workspaceRoot), "index.json");
}

export function diagramHtmlPath(workspaceRoot: string, id: string): string {
  return join(diagramsRoot(workspaceRoot), `${id}.html`);
}

export function diagramNotesPath(workspaceRoot: string, id: string): string {
  return join(diagramsRoot(workspaceRoot), `${id}.notes.json`);
}

export function diagramSkillDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".projectos", "skills", DIAGRAM_DESIGN_SKILL_ID);
}

export function diagramStyleMarkerPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".diagram-design");
}
