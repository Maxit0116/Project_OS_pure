import { z } from "zod";
import { looksLikeDiagramRequest } from "./diagram-graph.js";
import { StencilGenerationScopeSchema } from "./ui-stencil.js";

export const WIREFRAME_PACK_VISUAL_FAMILY = "ui-wireframe" as const;

export const WireframeFidelitySchema = z.enum(["l1", "l1_annotated", "l2"]);
export type WireframeFidelity = z.infer<typeof WireframeFidelitySchema>;

export const WireframePackStatusSchema = z.enum([
  "draft",
  "frozen",
  "realized",
  "archived",
]);
export type WireframePackStatus = z.infer<typeof WireframePackStatusSchema>;

export const WireframeScreenRoleSchema = z.enum([
  "main",
  "empty",
  "error",
  "loading",
  "settings",
  "other",
]);
export type WireframeScreenRole = z.infer<typeof WireframeScreenRoleSchema>;

export const WireframeGapLayerSchema = z.enum(["struct", "layout", "intent"]);
export type WireframeGapLayer = z.infer<typeof WireframeGapLayerSchema>;

export const WireframeGapSeveritySchema = z.enum(["block", "major", "minor"]);
export type WireframeGapSeverity = z.infer<typeof WireframeGapSeveritySchema>;

export const WireframeGapStatusSchema = z.enum([
  "open",
  "fixing",
  "closed",
  "accepted_intentional",
]);
export type WireframeGapStatus = z.infer<typeof WireframeGapStatusSchema>;

export const WireframeRegionSchema = z
  .object({
    id: z.string().min(1).max(120),
    label: z.string().min(1).max(160),
    intentBrief: z.string().max(2_000).default(""),
    fields: z.array(z.string().max(120)).max(40).default([]),
    cta: z.string().max(160).optional(),
    bbox: z
      .object({
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      })
      .optional(),
  })
  .strict();
export type WireframeRegion = z.infer<typeof WireframeRegionSchema>;

export const WireframeScreenImplementationSchema = z
  .object({
    route: z.string().max(512).optional(),
    previewUrl: z.string().max(2_048).optional(),
    lastCaptureRelPath: z.string().max(512).optional(),
    status: z.enum(["pending", "in_progress", "done"]).default("pending"),
  })
  .strict();
export type WireframeScreenImplementation = z.infer<
  typeof WireframeScreenImplementationSchema
>;

export const WireframeScreenSchema = z
  .object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    role: WireframeScreenRoleSchema.default("main"),
    htmlRelPath: z.string().min(1).max(512),
    html: z.string().max(2_000_000).optional(),
    regions: z.array(WireframeRegionSchema).max(40).default([]),
    notes: z.string().max(8_000).default(""),
    storyStepIds: z.array(z.string().max(120)).max(20).optional(),
    featureNodeIds: z.array(z.string().max(120)).max(20).optional(),
    implementation: WireframeScreenImplementationSchema.optional(),
  })
  .strict();
export type WireframeScreen = z.infer<typeof WireframeScreenSchema>;

export const ScreenFlowEdgeSchema = z
  .object({
    id: z.string().min(1).max(120),
    fromScreenId: z.string().min(1).max(120),
    toScreenId: z.string().min(1).max(120),
    label: z.string().max(160).default(""),
  })
  .strict();
export type ScreenFlowEdge = z.infer<typeof ScreenFlowEdgeSchema>;

export const WireframeFreezeModeSchema = z.enum(["full", "main_path"]);
export type WireframeFreezeMode = z.infer<typeof WireframeFreezeModeSchema>;

export const WireframeFreezeMetaSchema = z
  .object({
    frozenAt: z.string().min(1).max(64),
    frozenBy: z.string().max(120).default("user"),
    checksum: z.string().min(1).max(128),
    version: z.number().int().positive(),
    /** full = all screens; main_path = only role=main screens in acceptance scope */
    mode: WireframeFreezeModeSchema.default("full"),
    frozenScreenIds: z.array(z.string().min(1).max(120)).max(30).optional(),
  })
  .strict();
export type WireframeFreezeMeta = z.infer<typeof WireframeFreezeMetaSchema>;

export const WireframeGapSchema = z
  .object({
    id: z.string().min(1).max(120),
    packVersion: z.number().int().nonnegative(),
    screenId: z.string().min(1).max(120),
    regionId: z.string().max(120).optional(),
    layer: WireframeGapLayerSchema,
    severity: WireframeGapSeveritySchema.default("major"),
    summary: z.string().min(1).max(1_000),
    evidence: z.string().max(2_048).optional(),
    status: WireframeGapStatusSchema.default("open"),
    resolutionNote: z.string().max(2_000).optional(),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
  })
  .strict();
export type WireframeGap = z.infer<typeof WireframeGapSchema>;

export const WireframePackSchema = z
  .object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    prompt: z.string().min(1).max(8_000),
    featureId: z.string().max(120).nullable().optional(),
    fidelity: WireframeFidelitySchema.default("l1"),
    status: WireframePackStatusSchema,
    /** Frozen version number; 0 while draft. */
    version: z.number().int().nonnegative().default(0),
    scope: StencilGenerationScopeSchema.default("ui_only"),
    nonGoals: z.array(z.string().max(500)).max(40).default([]),
    flow: z.array(ScreenFlowEdgeSchema).max(80).default([]),
    screens: z.array(WireframeScreenSchema).min(1).max(30),
    freezeMeta: WireframeFreezeMetaSchema.optional(),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
    sourceSessionId: z.string().max(120).nullable().optional(),
    visualFamily: z.literal(WIREFRAME_PACK_VISUAL_FAMILY).default(WIREFRAME_PACK_VISUAL_FAMILY),
  })
  .strict();
export type WireframePack = z.infer<typeof WireframePackSchema>;

export const WireframePackMetaSchema = z
  .object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    status: WireframePackStatusSchema,
    version: z.number().int().nonnegative(),
    fidelity: WireframeFidelitySchema,
    featureId: z.string().max(120).nullable().optional(),
    screenCount: z.number().int().nonnegative(),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
    prompt: z.string().min(1).max(8_000),
  })
  .strict();
export type WireframePackMeta = z.infer<typeof WireframePackMetaSchema>;

export const WireframePackIndexSchema = z
  .object({
    version: z.literal(1),
    packs: z.array(WireframePackMetaSchema).max(200),
  })
  .strict();
export type WireframePackIndex = z.infer<typeof WireframePackIndexSchema>;

export const GenerateWireframePackInputSchema = z
  .object({
    prompt: z.string().min(1).max(8_000),
    title: z.string().max(240).optional(),
    featureId: z.string().max(120).nullable().optional(),
    fidelity: WireframeFidelitySchema.optional(),
    scope: StencilGenerationScopeSchema.optional(),
    nonGoals: z.array(z.string().max(500)).max(40).optional(),
    sourceSessionId: z.string().max(120).nullable().optional(),
    /** Optional screen titles; otherwise inferred from prompt. */
    screenHints: z.array(z.string().max(160)).max(12).optional(),
  })
  .strict();
export type GenerateWireframePackInput = z.infer<
  typeof GenerateWireframePackInputSchema
>;

export const UpdateWireframePackDraftInputSchema = z
  .object({
    title: z.string().min(1).max(240).optional(),
    nonGoals: z.array(z.string().max(500)).max(40).optional(),
    scope: StencilGenerationScopeSchema.optional(),
    fidelity: WireframeFidelitySchema.optional(),
    featureId: z.string().max(120).nullable().optional(),
    screens: z.array(WireframeScreenSchema).min(1).max(30).optional(),
    flow: z.array(ScreenFlowEdgeSchema).max(80).optional(),
  })
  .strict();
export type UpdateWireframePackDraftInput = z.infer<
  typeof UpdateWireframePackDraftInputSchema
>;

export const FreezeWireframePackInputSchema = z
  .object({
    frozenBy: z.string().max(120).optional(),
    mode: WireframeFreezeModeSchema.optional(),
  })
  .strict();
export type FreezeWireframePackInput = z.infer<
  typeof FreezeWireframePackInputSchema
>;

export const ScanWireframeStructGapsInputSchema = z
  .object({
    /** Optional preview HTML keyed by screen id for L-struct text heuristics. */
    previewHtmlByScreen: z.record(z.string().max(2_000_000)).optional(),
  })
  .strict();
export type ScanWireframeStructGapsInput = z.infer<
  typeof ScanWireframeStructGapsInputSchema
>;

export const UpsertWireframeGapInputSchema = z
  .object({
    id: z.string().min(1).max(120).optional(),
    screenId: z.string().min(1).max(120),
    regionId: z.string().max(120).optional(),
    layer: WireframeGapLayerSchema,
    severity: WireframeGapSeveritySchema.optional(),
    summary: z.string().min(1).max(1_000),
    evidence: z.string().max(2_048).optional(),
    status: WireframeGapStatusSchema.optional(),
    resolutionNote: z.string().max(2_000).optional(),
  })
  .strict();
export type UpsertWireframeGapInput = z.infer<
  typeof UpsertWireframeGapInputSchema
>;

export const BuildImplementAgainstPackInputSchema = z
  .object({
    /** Must match frozen version; omitted → current frozen version. */
    version: z.number().int().positive().optional(),
  })
  .strict();
export type BuildImplementAgainstPackInput = z.infer<
  typeof BuildImplementAgainstPackInputSchema
>;

export const WireframeLoopAcceptanceItemSchema = z
  .object({
    id: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    kind: z.enum(["manual", "automated", "human_gate"]).default("human_gate"),
  })
  .strict();
export type WireframeLoopAcceptanceItem = z.infer<
  typeof WireframeLoopAcceptanceItemSchema
>;

export const ImplementAgainstPackBriefSchema = z
  .object({
    packId: z.string().min(1).max(120),
    version: z.number().int().positive(),
    title: z.string().min(1).max(240),
    scope: StencilGenerationScopeSchema,
    nonGoals: z.array(z.string()),
    acceptanceRef: z.string().min(1).max(240),
    stopPolicy: z.string().min(1).max(1_000),
    freezeMode: WireframeFreezeModeSchema.default("full"),
    featureId: z.string().max(120).nullable().optional(),
    screens: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        role: WireframeScreenRoleSchema,
        htmlRelPath: z.string(),
        regions: z.array(WireframeRegionSchema),
        notes: z.string(),
        inAcceptanceScope: z.boolean().default(true),
      }),
    ),
    /** Serial screen slices for Loop / Chat multi-turn (acceptance-scoped only). */
    screenSlices: z.array(
      z.object({
        screenId: z.string(),
        title: z.string(),
        goal: z.string().max(1_000),
      }),
    ),
    loopAcceptance: z.array(WireframeLoopAcceptanceItemSchema).max(30),
    flow: z.array(ScreenFlowEdgeSchema),
    promptForAgent: z.string().min(1).max(32_000),
  })
  .strict();
export type ImplementAgainstPackBrief = z.infer<
  typeof ImplementAgainstPackBriefSchema
>;

/** Screens included in freeze acceptance (partial = main_path only). */
export function acceptanceScreenIds(pack: WireframePack): string[] {
  const frozen = pack.freezeMeta?.frozenScreenIds;
  if (frozen && frozen.length > 0) return frozen;
  if (pack.freezeMeta?.mode === "main_path") {
    return pack.screens.filter((s) => s.role === "main").map((s) => s.id);
  }
  return pack.screens.map((s) => s.id);
}

export function emptyWireframePackIndex(): WireframePackIndex {
  return { version: 1, packs: [] };
}

export function packAcceptanceRef(packId: string, version: number): string {
  return `wireframe-pack@${packId}@v${version}`;
}

/**
 * Hard constraint (D8): model-proposed acceptance changes are ignored.
 * Only human-authored refs that match the frozen pack are kept.
 */
export function resolveImmutableAcceptanceRef(input: {
  frozenRef: string;
  modelProposedRef?: string | null;
}): { acceptanceRef: string; ignoredModelProposal: boolean } {
  const proposed = input.modelProposedRef?.trim() || null;
  if (!proposed || proposed === input.frozenRef) {
    return { acceptanceRef: input.frozenRef, ignoredModelProposal: false };
  }
  return { acceptanceRef: input.frozenRef, ignoredModelProposal: true };
}

export function metaFromPack(pack: WireframePack): WireframePackMeta {
  return WireframePackMetaSchema.parse({
    id: pack.id,
    title: pack.title,
    status: pack.status,
    version: pack.version,
    fidelity: pack.fidelity,
    featureId: pack.featureId ?? null,
    screenCount: pack.screens.length,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    prompt: pack.prompt,
  });
}

/** Open overlay only (no generate) — e.g. “open wireframe pack”. */
export function looksLikeOpenWireframePackRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /^(open|show|打开|開啟)\s*(ui\s*)?(wireframe|screen)\s*pack/i.test(t) ||
    /^(打开|開啟)\s*(ui\s*)?线稿(套装|圖集|图集)?/i.test(t) ||
    /^open\s+wireframe\s+pack$/i.test(t)
  );
}

/** Chat → Wireframe Pack intent (UI screens from zero), not architecture diagrams. */
export function looksLikeWireframePackRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (looksLikeOpenWireframePackRequest(t)) return true;
  if (
    /\b(function\s*map|c4\b|current\s+code\s+structure|代码结构|功能地图)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  // Prefer diagram graph for pure architecture/sequence asks without UI surface words.
  const hasUiSurface =
    /\b(wireframe|screen\s*pack|ui\s*mock|mockup|wire\s*frame|线稿|线框图|屏幕套装|界面稿|多屏|从\s*0\s*做|from\s*scratch.*(ui|screen|frontend|界面)|build.*(ui|screen|frontend|界面))\b/i.test(
      t,
    ) ||
    /(线稿|线框|屏幕包|界面原型|多屏流程|前端大功能|从零.*(界面|前端|页面))/.test(t);

  if (!hasUiSurface) return false;

  // If also sounds like architecture-only, still wireframe when UI words present.
  return true;
}

/** Ambiguous when both diagram and wireframe signals fire — UI should ask once. */
export function wireframeVsDiagramAmbiguous(text: string): boolean {
  return looksLikeWireframePackRequest(text) && looksLikeDiagramRequest(text);
}
