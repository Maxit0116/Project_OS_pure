import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import {
  DiagramArtifactMetaSchema,
  DiagramArtifactSchema,
  DiagramIndexSchema,
  DiagramNoteBlockSchema,
  DiagramNotesDocumentSchema,
  emptyDiagramIndex,
  emptyDiagramNotes,
  notesDocumentHasContent,
  type ChooseDiagramStyleInput,
  type DiagramArtifact,
  type DiagramArtifactMeta,
  type DiagramIndex,
  type DiagramNoteBlock,
  type DiagramNotesDocument,
  type DiagramStyleProfileKind,
  type UpdateDiagramNotesInput,
} from "../../contracts/diagram-graph.js";
import {
  diagramHtmlPath,
  diagramNotesPath,
  diagramSkillDir,
  diagramsIndexPath,
  diagramsRoot,
  diagramStyleMarkerPath,
} from "./paths.js";
import { join } from "node:path";

function readIndex(workspaceRoot: string): DiagramIndex {
  const path = diagramsIndexPath(workspaceRoot);
  if (!existsSync(path)) return emptyDiagramIndex();
  try {
    return DiagramIndexSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return emptyDiagramIndex();
  }
}

function writeIndex(workspaceRoot: string, index: DiagramIndex): DiagramIndex {
  mkdirSync(diagramsRoot(workspaceRoot), { recursive: true });
  const parsed = DiagramIndexSchema.parse(index);
  writeFileSync(diagramsIndexPath(workspaceRoot), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export function listDiagramArtifacts(workspaceRoot: string): DiagramArtifactMeta[] {
  return readIndex(workspaceRoot).artifacts;
}

export function getDiagramIndex(workspaceRoot: string): DiagramIndex {
  return readIndex(workspaceRoot);
}

export function readDiagramNotes(
  workspaceRoot: string,
  id: string,
): DiagramNotesDocument {
  const path = diagramNotesPath(workspaceRoot, id);
  if (!existsSync(path)) return emptyDiagramNotes(id);
  try {
    return DiagramNotesDocumentSchema.parse({
      ...JSON.parse(readFileSync(path, "utf8")),
      diagramId: id,
    });
  } catch {
    return emptyDiagramNotes(id);
  }
}

function patchMetaNotesFlags(
  workspaceRoot: string,
  id: string,
  notes: DiagramNotesDocument,
): void {
  const index = readIndex(workspaceRoot);
  const hasNotes = notesDocumentHasContent(notes);
  const nextArtifacts = index.artifacts.map((item) =>
    item.id === id
      ? DiagramArtifactMetaSchema.parse({
          ...item,
          hasNotes,
          notesUpdatedAt: hasNotes ? notes.updatedAt : undefined,
        })
      : item,
  );
  writeIndex(workspaceRoot, { ...index, artifacts: nextArtifacts });
}

export function writeDiagramNotes(
  workspaceRoot: string,
  id: string,
  input: UpdateDiagramNotesInput,
): DiagramNotesDocument {
  const index = readIndex(workspaceRoot);
  if (!index.artifacts.some((item) => item.id === id)) {
    throw new Error(`Diagram not found: ${id}`);
  }
  const now = new Date().toISOString();
  const blocks: DiagramNoteBlock[] = input.blocks.map((block) =>
    DiagramNoteBlockSchema.parse({
      ...block,
      updatedAt: block.updatedAt || now,
    }),
  );
  const notes = DiagramNotesDocumentSchema.parse({
    version: 1,
    diagramId: id,
    blocks,
    updatedAt: now,
  });
  mkdirSync(diagramsRoot(workspaceRoot), { recursive: true });
  writeFileSync(
    diagramNotesPath(workspaceRoot, id),
    `${JSON.stringify(notes, null, 2)}\n`,
    "utf8",
  );
  patchMetaNotesFlags(workspaceRoot, id, notes);
  return notes;
}

export function copyDiagramNotes(
  workspaceRoot: string,
  fromId: string,
  toId: string,
): DiagramNotesDocument | null {
  const source = readDiagramNotes(workspaceRoot, fromId);
  if (!notesDocumentHasContent(source)) return null;
  return writeDiagramNotes(workspaceRoot, toId, {
    blocks: source.blocks.map((block) => ({
      ...block,
      updatedAt: new Date().toISOString(),
    })),
  });
}

export function getDiagramArtifact(
  workspaceRoot: string,
  id: string,
): DiagramArtifact | null {
  const meta = readIndex(workspaceRoot).artifacts.find((item) => item.id === id);
  if (!meta) return null;
  const htmlPath = diagramHtmlPath(workspaceRoot, id);
  if (!existsSync(htmlPath)) return null;
  const html = readFileSync(htmlPath, "utf8");
  const notes = readDiagramNotes(workspaceRoot, id);
  return DiagramArtifactSchema.parse({ ...meta, html, notes });
}

export function saveDiagramArtifact(
  workspaceRoot: string,
  artifact: DiagramArtifact,
): DiagramArtifact {
  const parsed = DiagramArtifactSchema.parse(artifact);
  mkdirSync(diagramsRoot(workspaceRoot), { recursive: true });
  const htmlPath = diagramHtmlPath(workspaceRoot, parsed.id);
  writeFileSync(htmlPath, parsed.html, "utf8");
  const htmlRelPath = relative(workspaceRoot, htmlPath).replaceAll("\\", "/");
  const existingNotes = readDiagramNotes(workspaceRoot, parsed.id);
  const notes =
    parsed.notes ??
    (notesDocumentHasContent(existingNotes) ? existingNotes : undefined);
  const hasNotes = notesDocumentHasContent(notes);
  const meta: DiagramArtifactMeta = DiagramArtifactMetaSchema.parse({
    id: parsed.id,
    title: parsed.title,
    visualType: parsed.visualType,
    prompt: parsed.prompt,
    createdAt: parsed.createdAt,
    sourceSessionId: parsed.sourceSessionId ?? null,
    htmlRelPath,
    styleProfile: parsed.styleProfile,
    hasNotes: hasNotes || undefined,
    notesUpdatedAt: hasNotes && notes ? notes.updatedAt : undefined,
  });
  if (parsed.notes) {
    writeFileSync(
      diagramNotesPath(workspaceRoot, parsed.id),
      `${JSON.stringify(parsed.notes, null, 2)}\n`,
      "utf8",
    );
  }
  const index = readIndex(workspaceRoot);
  const nextArtifacts = [meta, ...index.artifacts.filter((item) => item.id !== meta.id)].slice(
    0,
    200,
  );
  writeIndex(workspaceRoot, { ...index, artifacts: nextArtifacts });
  return DiagramArtifactSchema.parse({
    ...meta,
    html: parsed.html,
    notes: notes ?? emptyDiagramNotes(parsed.id),
  });
}

export function deleteDiagramArtifact(workspaceRoot: string, id: string): boolean {
  const index = readIndex(workspaceRoot);
  const next = index.artifacts.filter((item) => item.id !== id);
  if (next.length === index.artifacts.length) return false;
  writeIndex(workspaceRoot, { ...index, artifacts: next });
  const htmlPath = diagramHtmlPath(workspaceRoot, id);
  if (existsSync(htmlPath)) rmSync(htmlPath, { force: true });
  const notesPath = diagramNotesPath(workspaceRoot, id);
  if (existsSync(notesPath)) rmSync(notesPath, { force: true });
  return true;
}

const PROJECT_OS_TECH_STYLE_GUIDE = `# Project OS tech theme (diagram-design profile)

| Role | Hex |
|------|-----|
| paper | #181818 |
| paper-2 | #1c1c1c |
| ink | #ebebeb |
| muted | #a0a0a0 |
| soft | #6e6e6e |
| rule | #2a2a2a |
| rule-solid | #3a3a3a |
| accent | #ececec |
| accent-tint | #2a2a2a |
| link | #8cb4ff |

Typography: Geist Sans for node names; Geist Mono for ports/commands; Instrument Serif optional for H1.
Shadows: none. Max corner radius: 8px.
Focal accent: 1–2 nodes max.
`;

export function chooseDiagramStyle(
  workspaceRoot: string,
  input: ChooseDiagramStyleInput,
): DiagramIndex {
  const kind: DiagramStyleProfileKind = input.kind;
  mkdirSync(diagramsRoot(workspaceRoot), { recursive: true });
  const marker = {
    profile: kind,
    updatedAt: new Date().toISOString(),
    ...(kind === "project-os-tech"
      ? { styleGuide: PROJECT_OS_TECH_STYLE_GUIDE }
      : {}),
    ...(input.value?.trim() ? { value: input.value.trim() } : {}),
  };
  writeFileSync(
    diagramStyleMarkerPath(workspaceRoot),
    `${JSON.stringify(marker, null, 2)}\n`,
    "utf8",
  );
  if (kind === "project-os-tech") {
    const guidePath = join(
      diagramSkillDir(workspaceRoot),
      "references",
      "style-guide.md",
    );
    try {
      mkdirSync(join(diagramSkillDir(workspaceRoot), "references"), {
        recursive: true,
      });
      writeFileSync(guidePath, `${PROJECT_OS_TECH_STYLE_GUIDE}\n`, "utf8");
    } catch {
      /* skill pack may not be installed yet; ensure will create it later */
    }
  }
  const index = readIndex(workspaceRoot);
  return writeIndex(workspaceRoot, {
    ...index,
    styleProfileChosen: true,
    styleProfile: kind,
  });
}

export function isDiagramStyleChosen(workspaceRoot: string): boolean {
  const index = readIndex(workspaceRoot);
  if (index.styleProfileChosen) return true;
  return existsSync(diagramStyleMarkerPath(workspaceRoot));
}

/** Re-apply Project OS tech style-guide after a late skill-pack install. */
export function reapplyDiagramStyleGuideIfNeeded(workspaceRoot: string): void {
  const markerPath = diagramStyleMarkerPath(workspaceRoot);
  if (!existsSync(markerPath)) return;
  try {
    const raw = JSON.parse(readFileSync(markerPath, "utf8")) as {
      profile?: string;
    };
    if (raw.profile !== "project-os-tech") return;
    const guidePath = join(
      diagramSkillDir(workspaceRoot),
      "references",
      "style-guide.md",
    );
    mkdirSync(join(diagramSkillDir(workspaceRoot), "references"), {
      recursive: true,
    });
    writeFileSync(guidePath, `${PROJECT_OS_TECH_STYLE_GUIDE}\n`, "utf8");
  } catch {
    /* ignore corrupt marker */
  }
}
