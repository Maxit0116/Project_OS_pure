import { z } from "zod";

/** Product Lab — experiential debug mode (not a ChatSessionMode). */

export const LAB_EVIDENCE_BODY_MAX = 2_000;
export const LAB_EVIDENCE_MAX = 8;
export const LAB_FINDING_DETAIL_MAX = 4_000;
export const LAB_FINDING_TITLE_MAX = 240;

export const LabSessionStatusSchema = z.enum([
  "starting",
  "experiencing",
  "recording",
  "triaging",
  "fixing",
  "verifying",
  "idle",
  "ended",
]);
export type LabSessionStatus = z.infer<typeof LabSessionStatusSchema>;

export const LabFindingKindSchema = z.enum([
  "manual",
  "console_error",
  "unhandled_rejection",
  "network_failure",
  "friction",
  "journey_failure",
  "external",
]);
export type LabFindingKind = z.infer<typeof LabFindingKindSchema>;

export const LabFindingStatusSchema = z.enum([
  "open",
  "dismissed",
  "handed_off",
  "fix_proposed",
  "fix_applied",
  "verified_fixed",
  "verified_still_broken",
]);
export type LabFindingStatus = z.infer<typeof LabFindingStatusSchema>;

export const LabEvidenceKindSchema = z.enum([
  "note",
  "console",
  "network",
  "stack",
  "screenshot_ref",
  "url",
]);
export type LabEvidenceKind = z.infer<typeof LabEvidenceKindSchema>;

export const LabEvidenceSchema = z
  .object({
    id: z.string().min(1).max(120),
    kind: LabEvidenceKindSchema,
    label: z.string().min(1).max(240),
    body: z.string().max(LAB_EVIDENCE_BODY_MAX),
    capturedAt: z.string().min(1).max(64),
  })
  .strict();
export type LabEvidence = z.infer<typeof LabEvidenceSchema>;

export const LabCaptureConfigSchema = z
  .object({
    consoleErrors: z.boolean().default(true),
    unhandledRejections: z.boolean().default(true),
    failedNetwork: z.boolean().default(true),
    manualNotes: z.boolean().default(true),
  })
  .strict();
export type LabCaptureConfig = z.infer<typeof LabCaptureConfigSchema>;

export const LabLocationSchema = z
  .object({
    url: z.string().max(2_048).optional(),
    route: z.string().max(512).optional(),
    title: z.string().max(240).optional(),
  })
  .strict();
export type LabLocation = z.infer<typeof LabLocationSchema>;

export const LabCardPhaseSchema = z.enum([
  "bootstrapping",
  "experiencing",
  "reviewing",
  "fixing",
]);
export type LabCardPhase = z.infer<typeof LabCardPhaseSchema>;

export const LabCapabilityKindSchema = z.enum(["mcp", "skill", "rules", "other"]);
export type LabCapabilityKind = z.infer<typeof LabCapabilityKindSchema>;

export const LabCapabilitySourceSchema = z.enum(["marketplace", "web", "builtin"]);
export type LabCapabilitySource = z.infer<typeof LabCapabilitySourceSchema>;

export const LabCapabilityProposalStatusSchema = z.enum([
  "proposed",
  "approved",
  "denied",
  "installing",
  "installed",
  "failed",
]);
export type LabCapabilityProposalStatus = z.infer<
  typeof LabCapabilityProposalStatusSchema
>;

/** Candidate MCP/skill/rules discovered via Marketplace or web search. */
export const LabCapabilityProposalSchema = z
  .object({
    id: z.string().min(1).max(120),
    need: z.string().min(1).max(120),
    kind: LabCapabilityKindSchema,
    source: LabCapabilitySourceSchema,
    title: z.string().min(1).max(240),
    detail: z.string().max(2_000).default(""),
    listingId: z.string().max(120).nullable().default(null),
    gitUrl: z.string().max(2_048).nullable().default(null),
    homepageUrl: z.string().max(2_048).nullable().default(null),
    status: LabCapabilityProposalStatusSchema.default("proposed"),
    error: z.string().max(1_000).nullable().default(null),
  })
  .strict();
export type LabCapabilityProposal = z.infer<typeof LabCapabilityProposalSchema>;

export const LabSessionSchema = z
  .object({
    id: z.string().min(1).max(120),
    projectId: z.string().min(1).max(120),
    status: LabSessionStatusSchema,
    cardPhase: LabCardPhaseSchema.default("experiencing"),
    scopeNodeIds: z.array(z.string().min(1).max(120)).max(64).default([]),
    previewUrl: z.string().max(2_048).nullable().default(null),
    browserTabId: z.string().max(120).nullable().default(null),
    capture: LabCaptureConfigSchema.default({
      consoleErrors: true,
      unhandledRejections: true,
      failedNetwork: true,
      manualNotes: true,
    }),
    journeyId: z.string().max(120).nullable().default(null),
    findingIds: z.array(z.string().min(1).max(120)).max(500).default([]),
    /** null = not confirmed yet; array = frozen Debug List finding ids. */
    debugListFindingIds: z
      .array(z.string().min(1).max(120))
      .max(500)
      .nullable()
      .default(null),
    capabilityNeeds: z.array(z.string().min(1).max(120)).max(32).default([]),
    capabilityProposals: z.array(LabCapabilityProposalSchema).max(40).default([]),
    chatSessionId: z.string().max(120).nullable().default(null),
    activeFixRunId: z.string().max(120).nullable().default(null),
    startError: z.string().max(1_000).nullable().default(null),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
    endedAt: z.string().max(64).nullable().default(null),
  })
  .strict();
export type LabSession = z.infer<typeof LabSessionSchema>;

export const LabFindingSchema = z
  .object({
    id: z.string().min(1).max(120),
    sessionId: z.string().min(1).max(120),
    kind: LabFindingKindSchema,
    status: LabFindingStatusSchema,
    title: z.string().min(1).max(LAB_FINDING_TITLE_MAX),
    detail: z.string().max(LAB_FINDING_DETAIL_MAX).default(""),
    nodeIds: z.array(z.string().min(1).max(120)).max(64).default([]),
    evidence: z.array(LabEvidenceSchema).max(LAB_EVIDENCE_MAX).default([]),
    location: LabLocationSchema.optional(),
    agentRunId: z.string().max(120).nullable().default(null),
    createdAt: z.string().min(1).max(64),
    updatedAt: z.string().min(1).max(64),
  })
  .strict();
export type LabFinding = z.infer<typeof LabFindingSchema>;

export const LabStateDocumentSchema = z
  .object({
    version: z.literal(1),
    activeSessionId: z.string().max(120).nullable().default(null),
    sessions: z.array(LabSessionSchema).max(50).default([]),
    findings: z.array(LabFindingSchema).max(2_000).default([]),
    updatedAt: z.string().min(1).max(64),
  })
  .strict();
export type LabStateDocument = z.infer<typeof LabStateDocumentSchema>;

export function emptyLabStateDocument(
  nowIso = new Date().toISOString(),
): LabStateDocument {
  return {
    version: 1,
    activeSessionId: null,
    sessions: [],
    findings: [],
    updatedAt: nowIso,
  };
}

/** Handoff routing locked in Phase 0. */
export function labFindingHandoffMode(
  kind: LabFindingKind,
): "change" | "debug" {
  switch (kind) {
    case "console_error":
    case "unhandled_rejection":
    case "network_failure":
      return "debug";
    default:
      return "change";
  }
}

export function truncateLabText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

export function newLabId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const LabLaunchSurfaceSchema = z.enum(["web", "native", "unknown"]);
export type LabLaunchSurface = z.infer<typeof LabLaunchSurfaceSchema>;

/** How Product Lab should open Browser / Terminal / IDE for a workspace. */
export const LabLaunchProfileSchema = z
  .object({
    hasWebPreview: z.boolean(),
    needsTerminalStart: z.boolean(),
    /** True when Xcode / Android Studio / simulators are the real launch path. */
    needsIdeCapabilities: z.boolean().default(false),
    /** Stable need keys, e.g. ios-simulator, android-emulator, xcode, android-studio. */
    capabilityNeeds: z.array(z.string().max(120)).max(16).default([]),
    surface: LabLaunchSurfaceSchema,
    suggestedCommands: z.array(z.string().max(500)).max(8).default([]),
    startHints: z.array(z.string().max(240)).max(12).default([]),
    rationale: z.string().max(120),
  })
  .strict();
export type LabLaunchProfile = z.infer<typeof LabLaunchProfileSchema>;
