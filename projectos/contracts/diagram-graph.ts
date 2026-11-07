import { z } from "zod";

export const DIAGRAM_DESIGN_SKILL_ID = "community.diagram-design" as const;

export const DiagramVisualTypeHintSchema = z.enum([
  "auto",
  "architecture",
  "sequence",
  "flowchart",
  "data-flow",
  "state",
  /** Multi-screen L1 wireframe pack — see UI-Wireframe-Pack-Dev-Plan (hosted in Diagram Graph). */
  "ui-wireframe",
]);
export type DiagramVisualTypeHint = z.infer<typeof DiagramVisualTypeHintSchema>;

export const DiagramStyleProfileKindSchema = z.enum([
  "project-os-tech",
  "default",
  "custom",
  "url",
  "paste",
]);
export type DiagramStyleProfileKind = z.infer<typeof DiagramStyleProfileKindSchema>;

export const DiagramNoteBlockSchema = z
  .object({
    id: z.string().min(1).max(120),
    title: z.string().max(120).default(""),
    body: z.string().max(20_000).default(""),
    updatedAt: z.string().min(1).max(64),
  })
  .strict();
export type DiagramNoteBlock = z.infer<typeof DiagramNoteBlockSchema>;

export const DiagramNotesDocumentSchema = z
  .object({
    version: z.literal(1),
    diagramId: z.string().min(1).max(120),
    blocks: z.array(DiagramNoteBlockSchema).max(50),
    updatedAt: z.string().min(1).max(64),
  })
  .strict();
export type DiagramNotesDocument = z.infer<typeof DiagramNotesDocumentSchema>;

export const DiagramArtifactMetaSchema = z
  .object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    visualType: z.string().min(1).max(120),
    prompt: z.string().min(1).max(8_000),
    createdAt: z.string().min(1).max(64),
    sourceSessionId: z.string().min(1).max(120).nullable().optional(),
    htmlRelPath: z.string().min(1).max(512),
    styleProfile: DiagramStyleProfileKindSchema.optional(),
    /** True when at least one note block has non-empty title/body. */
    hasNotes: z.boolean().optional(),
    notesUpdatedAt: z.string().min(1).max(64).optional(),
  })
  .strict();
export type DiagramArtifactMeta = z.infer<typeof DiagramArtifactMetaSchema>;

export const DiagramArtifactSchema = DiagramArtifactMetaSchema.extend({
  html: z.string().min(1).max(2_000_000),
  notes: DiagramNotesDocumentSchema.optional(),
});
export type DiagramArtifact = z.infer<typeof DiagramArtifactSchema>;

export const UpdateDiagramNotesInputSchema = z
  .object({
    blocks: z.array(DiagramNoteBlockSchema).max(50),
  })
  .strict();
export type UpdateDiagramNotesInput = z.infer<typeof UpdateDiagramNotesInputSchema>;

export function emptyDiagramNotes(diagramId: string): DiagramNotesDocument {
  return {
    version: 1,
    diagramId,
    blocks: [],
    updatedAt: new Date().toISOString(),
  };
}

export function notesDocumentHasContent(notes: DiagramNotesDocument | null | undefined): boolean {
  if (!notes) return false;
  return notes.blocks.some(
    (block) => block.title.trim().length > 0 || block.body.trim().length > 0,
  );
}

export const DiagramIndexSchema = z
  .object({
    version: z.literal(1),
    styleProfileChosen: z.boolean().default(false),
    styleProfile: DiagramStyleProfileKindSchema.optional(),
    artifacts: z.array(DiagramArtifactMetaSchema).max(200),
  })
  .strict();
export type DiagramIndex = z.infer<typeof DiagramIndexSchema>;

export const DiagramSkillPackStatusSchema = z
  .object({
    installed: z.boolean(),
    skillId: z.literal(DIAGRAM_DESIGN_SKILL_ID),
    hasReferences: z.boolean(),
    version: z.string().max(64).optional(),
  })
  .strict();
export type DiagramSkillPackStatus = z.infer<typeof DiagramSkillPackStatusSchema>;

export const EnsureDiagramDesignSkillResultSchema = z
  .object({
    status: DiagramSkillPackStatusSchema,
    installedNow: z.boolean(),
  })
  .strict();
export type EnsureDiagramDesignSkillResult = z.infer<
  typeof EnsureDiagramDesignSkillResultSchema
>;

export const GenerateDiagramInputSchema = z
  .object({
    prompt: z.string().min(1).max(8_000),
    diagramTypeHint: DiagramVisualTypeHintSchema.optional(),
    styleProfile: DiagramStyleProfileKindSchema.optional(),
    sourceSessionId: z.string().min(1).max(120).nullable().optional(),
    contextNotes: z.string().max(16_000).optional(),
  })
  .strict();
export type GenerateDiagramInput = z.infer<typeof GenerateDiagramInputSchema>;

export const ChooseDiagramStyleInputSchema = z
  .object({
    kind: DiagramStyleProfileKindSchema,
    /** Optional pasted tokens or URL when kind is paste/url. */
    value: z.string().max(32_000).optional(),
  })
  .strict();
export type ChooseDiagramStyleInput = z.infer<typeof ChooseDiagramStyleInputSchema>;

export function emptyDiagramIndex(): DiagramIndex {
  return {
    version: 1,
    styleProfileChosen: false,
    artifacts: [],
  };
}

/** Chat → Diagram Graph intent (descriptive diagrams, not C4 / Function Map). */
export function looksLikeDiagramRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (
    /\b(function\s*map|c4\b|current\s+code\s+structure|代码结构|功能地图)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return (
    /\b(diagram|architecture\s+diagram|sequence\s+diagram|flowchart|swimlane|sankey|wardley|draw\s+(me\s+)?a\s+|visualize)\b/i.test(
      text,
    ) ||
    /(示意[图圖]|架构图|時序图|时序图|流程图|画一?[张個个]?|畫一?[張個个]?)/i.test(
      text,
    ) ||
    /\b(sequence|flowchart|data\s*flow|state\s*machine)\b/i.test(t)
  );
}

export function looksLikeFunctionMapRequest(text: string): boolean {
  return /\b(function\s*map|c4\b|current\s+code\s+structure|代码结构|功能地图|系统结构图)\b/i.test(
    text,
  );
}
