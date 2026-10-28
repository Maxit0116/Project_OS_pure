import { z } from "zod";

import {
  StencilGenerationScopeSchema,
  buildSpatialPinUserContentWithStencils,
  type StencilPlacement,
} from "./ui-stencil.js";

export const SpatialPinVersionSchema = z.literal("0.1.0");

export const SpatialPinStatusSchema = z.enum([
  "draft",
  "submitted",
  "running",
  "awaiting_review",
  "done",
  "error",
  "orphaned",
]);

export const SpatialPinModeSchema = z.enum(["ask", "change", "plan", "debug"]);

/** Primary path is screen/workspace; chrome/browser are optional DOM enhancers. */
export const SpatialPinSurfaceSchema = z.enum([
  "screen",
  "workspace",
  "terminal",
  "chrome",
  "projectos-browser",
]);

export const SpatialPinConfidenceSchema = z.enum([
  "exact",
  "approx",
  "snapshot_only",
]);

/** Best-effort host classification for external IDEs / virtual devices (macOS). */
export const SpatialPinDeviceKindSchema = z.enum([
  "ide",
  "ios-simulator",
  "android-emulator",
  "other",
]);

export const ScreenRectSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .strict();

export const LocationKeySchema = z
  .object({
    surface: SpatialPinSurfaceSchema,
    /** Stable identity. For screen/workspace use spatial://… synthetic URLs. */
    url: z.string().min(1).max(4096),
    routePath: z.string().max(2048).optional(),
    selector: z.string().max(2048).optional(),
    axName: z.string().max(512).optional(),
    textHint: z.string().max(512).optional(),
    visualHash: z.string().max(128).optional(),
    nodeId: z.string().min(1).optional(),
    workspacePath: z.string().max(4096).optional(),
    terminalCwd: z.string().max(4096).optional(),
    /** Frontmost host app display name (e.g. Xcode, Simulator). */
    appName: z.string().max(256).optional(),
    bundleId: z.string().max(256).optional(),
    windowTitle: z.string().max(1024).optional(),
    deviceKind: SpatialPinDeviceKindSchema.optional(),
    /** Workspace-relative subtree guess (e.g. ios/, android/app). */
    inferredPath: z.string().max(1024).optional(),
  })
  .strict();

/** In-rect normalized point (pen / legacy rect strokes). */
export const AnnotationPointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

/**
 * Region-relative point that may lie outside [0,1] (arrow tails beyond the crop).
 * (0,0) = region top-left; (1,1) = region bottom-right.
 */
export const AnnotationPointUnboundedSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

/**
 * Anchors on a capture / compose rect.
 * Region→compose arrow heads use edge midpoints only; corners remain for
 * compose-card docking and legacy data (normalized to edges at draw time).
 */
export const AnnotationAnchorSchema = z.enum([
  "top",
  "right",
  "bottom",
  "left",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
]);

const AnnotationStrokePenSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("pen"),
    color: z.string().min(1).max(32),
    width: z.number().positive().max(32),
    points: z.array(AnnotationPointSchema).min(1).max(2000),
  })
  .strict();

/** Legacy rect annotation (kept for back-compat; overlay no longer creates these). */
const AnnotationStrokeRectSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("rect"),
    color: z.string().min(1).max(32),
    width: z.number().positive().max(32),
    points: z.array(AnnotationPointSchema).min(1).max(2000),
  })
  .strict();

const AnnotationStrokeArrowSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("arrow"),
    color: z.string().min(1).max(32),
    width: z.number().positive().max(32),
    /** 1-based display number for the colored badge. */
    index: z.number().int().positive().max(200),
    anchor: AnnotationAnchorSchema,
    head: AnnotationPointUnboundedSchema,
    tail: AnnotationPointUnboundedSchema,
    /**
     * Legacy two-point arrow (head, tail) in clamped [0,1] space.
     * New arrows prefer head/tail; parsers may synthesize from points.
     */
    points: z.array(AnnotationPointUnboundedSchema).min(1).max(2000).optional(),
  })
  .strict();

export const AnnotationStrokeSchema = z.discriminatedUnion("kind", [
  AnnotationStrokePenSchema,
  AnnotationStrokeRectSchema,
  AnnotationStrokeArrowSchema,
]);

export const AnnotationDocSchema = z
  .object({
    version: SpatialPinVersionSchema,
    strokes: z.array(AnnotationStrokeSchema).max(200),
  })
  .strict();

export const PinComposerHubRepoSchema = z
  .object({
    label: z.string().min(1).max(240),
    branch: z.string().min(1).max(240).optional(),
  })
  .strict();

export const PinComposerHubReferenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("image"),
      id: z.string().min(1),
      assetPath: z.string().min(1).max(1024),
      label: z.string().min(1).max(240).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("file"),
      id: z.string().min(1),
      path: z.string().min(1).max(4096),
      label: z.string().min(1).max(240).optional(),
    })
    .strict(),
]);

export const PinComposerHubSubagentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    brief: z.string().max(4_000).default(""),
    enabled: z.boolean().default(true),
  })
  .strict();

export const PinComposerHubSubagentStatusSchema = z.enum([
  "ready",
  "queued",
  "running",
  "done",
  "error",
]);

export const PinComposerHubSubagentLinkSchema = z
  .object({
    slotId: z.string().min(1),
    status: PinComposerHubSubagentStatusSchema,
    runId: z.string().min(1).optional(),
    summary: z.string().max(2_000).optional(),
  })
  .strict();

/** Spatial compose hub: left context, research toggle, configurable subagent slots. */
export const PinComposerHubSchema = z
  .object({
    researchEnabled: z.boolean().default(false),
    repo: PinComposerHubRepoSchema.optional(),
    folders: z.array(z.string().min(1).max(4096)).max(40).default([]),
    skillIds: z.array(z.string().min(1)).max(40).default([]),
    references: z.array(PinComposerHubReferenceSchema).max(40).default([]),
    subagents: z.array(PinComposerHubSubagentSchema).max(12).default([]),
  })
  .strict();

export const PinComposerSchema = z
  .object({
    mode: SpatialPinModeSchema,
    prompt: z.string().max(16_000),
    snapshotAssetPath: z.string().max(1024).optional(),
    /** User-edited or baked stencil brief carried into submit (UI Stencil on Capture). */
    stencilBrief: z.string().max(16_000).optional(),
    generationScope: StencilGenerationScopeSchema.optional(),
    /** Star-topology assemble state around the compose card. */
    hub: PinComposerHubSchema.optional(),
  })
  .strict();

export const PinLinksSchema = z
  .object({
    chatSessionId: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
    refinementId: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    debugSessionId: z.string().min(1).optional(),
    /** Compose-hub subagent slot outcomes (child asks / runs). */
    composeSubagents: z.array(PinComposerHubSubagentLinkSchema).max(12).optional(),
    childRunIds: z.array(z.string().min(1)).max(12).optional(),
  })
  .strict();

export const ResolveStateSchema = z
  .object({
    confidence: SpatialPinConfidenceSchema,
    method: z.enum([
      "selector",
      "text_hint",
      "visual_hash",
      "url_only",
      "snapshot",
      "host_window",
      "unresolved",
    ]),
    lastRect: ScreenRectSchema.optional(),
    lastResolvedAt: z.string().min(1).optional(),
  })
  .strict();

export const SpatialPinSchema = z
  .object({
    version: SpatialPinVersionSchema,
    id: z.string().min(1),
    projectId: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    status: SpatialPinStatusSchema,
    title: z.string().max(240).optional(),
    location: LocationKeySchema,
    annotations: AnnotationDocSchema,
    composer: PinComposerSchema,
    links: PinLinksSchema.optional(),
    resolve: ResolveStateSchema.optional(),
    captureRect: ScreenRectSchema.optional(),
  })
  .strict();

export const SpatialPinHeadSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    url: z.string().min(1).max(4096),
    status: SpatialPinStatusSchema,
    mode: SpatialPinModeSchema,
    title: z.string().max(240).optional(),
    updatedAt: z.string().min(1),
    chatSessionId: z.string().min(1).optional(),
    runId: z.string().min(1).optional(),
  })
  .strict();

export const SpatialPinIndexSchema = z
  .object({
    version: SpatialPinVersionSchema,
    heads: z.array(SpatialPinHeadSchema),
  })
  .strict();

export const LocationHintSchema = z
  .object({
    surface: SpatialPinSurfaceSchema.optional(),
    url: z.string().min(1).max(4096),
    routePath: z.string().max(2048).optional(),
    selector: z.string().max(2048).optional(),
    axName: z.string().max(512).optional(),
    textHint: z.string().max(512).optional(),
    visualHash: z.string().max(128).optional(),
    viewportRect: ScreenRectSchema.optional(),
    workspacePath: z.string().max(4096).optional(),
    terminalCwd: z.string().max(4096).optional(),
    appName: z.string().max(256).optional(),
    bundleId: z.string().max(256).optional(),
    windowTitle: z.string().max(1024).optional(),
    deviceKind: SpatialPinDeviceKindSchema.optional(),
    inferredPath: z.string().max(1024).optional(),
  })
  .strict();

export const SpatialPinProjectCandidateSchema = z
  .object({
    projectId: z.string().min(1),
    workspacePath: z.string().min(1),
    displayName: z.string().min(1),
    source: z.enum([
      "focused-window",
      "open-window",
      "terminal-cwd",
      "loaded",
    ]),
  })
  .strict();

export const SpatialPinSessionContextSchema = z
  .object({
    projectId: z.string().nullable(),
    workspacePath: z.string().nullable(),
    candidates: z.array(SpatialPinProjectCandidateSchema),
    /** Best-effort location: screen by default; browser/chrome when available. */
    location: LocationKeySchema,
    webEnhanceAvailable: z.boolean(),
  })
  .strict();

export const ResolvedSpatialPinSchema = z
  .object({
    pin: SpatialPinSchema,
    confidence: SpatialPinConfidenceSchema,
    method: ResolveStateSchema.shape.method,
    rect: ScreenRectSchema.optional(),
  })
  .strict();

export const SubmitSpatialPinResultSchema = z
  .object({
    pin: SpatialPinSchema,
    chatSessionId: z.string().min(1),
    runId: z.string().min(1).optional(),
    refinementId: z.string().min(1).optional(),
    planId: z.string().min(1).optional(),
    debugSessionId: z.string().min(1).optional(),
  })
  .strict();

export type SpatialPinVersion = z.infer<typeof SpatialPinVersionSchema>;
export type SpatialPinStatus = z.infer<typeof SpatialPinStatusSchema>;
export type SpatialPinMode = z.infer<typeof SpatialPinModeSchema>;
export type SpatialPinSurface = z.infer<typeof SpatialPinSurfaceSchema>;
export type SpatialPinConfidence = z.infer<typeof SpatialPinConfidenceSchema>;
export type SpatialPinDeviceKind = z.infer<typeof SpatialPinDeviceKindSchema>;
export type ScreenRect = z.infer<typeof ScreenRectSchema>;
export type LocationKey = z.infer<typeof LocationKeySchema>;
export type AnnotationPoint = z.infer<typeof AnnotationPointSchema>;
export type AnnotationPointUnbounded = z.infer<
  typeof AnnotationPointUnboundedSchema
>;
export type AnnotationAnchor = z.infer<typeof AnnotationAnchorSchema>;
export type AnnotationStroke = z.infer<typeof AnnotationStrokeSchema>;
export type AnnotationStrokeArrow = z.infer<typeof AnnotationStrokeArrowSchema>;
export type AnnotationDoc = z.infer<typeof AnnotationDocSchema>;
export type PinComposerHubRepo = z.infer<typeof PinComposerHubRepoSchema>;
export type PinComposerHubReference = z.infer<
  typeof PinComposerHubReferenceSchema
>;
export type PinComposerHubSubagent = z.infer<
  typeof PinComposerHubSubagentSchema
>;
export type PinComposerHubSubagentStatus = z.infer<
  typeof PinComposerHubSubagentStatusSchema
>;
export type PinComposerHubSubagentLink = z.infer<
  typeof PinComposerHubSubagentLinkSchema
>;
export type PinComposerHub = z.infer<typeof PinComposerHubSchema>;
export type PinComposer = z.infer<typeof PinComposerSchema>;
export type PinLinks = z.infer<typeof PinLinksSchema>;
export type ResolveState = z.infer<typeof ResolveStateSchema>;
export type SpatialPin = z.infer<typeof SpatialPinSchema>;
export type SpatialPinHead = z.infer<typeof SpatialPinHeadSchema>;
export type SpatialPinIndex = z.infer<typeof SpatialPinIndexSchema>;
export type LocationHint = z.infer<typeof LocationHintSchema>;
export type ResolvedSpatialPin = z.infer<typeof ResolvedSpatialPinSchema>;
export type SubmitSpatialPinResult = z.infer<typeof SubmitSpatialPinResultSchema>;
export type SpatialPinProjectCandidate = z.infer<
  typeof SpatialPinProjectCandidateSchema
>;
export type SpatialPinSessionContext = z.infer<
  typeof SpatialPinSessionContextSchema
>;

export function isWebSurface(surface: SpatialPinSurface): boolean {
  return surface === "chrome" || surface === "projectos-browser";
}

export function isScreenLikeSurface(surface: SpatialPinSurface): boolean {
  return (
    surface === "screen" || surface === "workspace" || surface === "terminal"
  );
}

export function workspaceSpatialUrl(workspacePath: string): string {
  return `spatial://workspace/${encodeURIComponent(workspacePath)}`;
}

export function screenSpatialUrl(): string {
  return "spatial://screen";
}

export function buildScreenLocationKey(input: {
  workspacePath?: string | null;
  terminalCwd?: string | null;
  textHint?: string;
  appName?: string;
  bundleId?: string;
  windowTitle?: string;
  deviceKind?: SpatialPinDeviceKind;
  inferredPath?: string;
}): LocationKey {
  const workspacePath = input.workspacePath?.trim() || undefined;
  const terminalCwd = input.terminalCwd?.trim() || undefined;
  const hostFields = {
    ...(input.textHint ? { textHint: input.textHint } : {}),
    ...(input.appName?.trim() ? { appName: input.appName.trim() } : {}),
    ...(input.bundleId?.trim() ? { bundleId: input.bundleId.trim() } : {}),
    ...(input.windowTitle?.trim()
      ? { windowTitle: input.windowTitle.trim() }
      : {}),
    ...(input.deviceKind ? { deviceKind: input.deviceKind } : {}),
    ...(input.inferredPath?.trim()
      ? { inferredPath: input.inferredPath.trim() }
      : {}),
  };
  if (terminalCwd) {
    return {
      surface: "terminal",
      url: `spatial://terminal/${encodeURIComponent(terminalCwd)}`,
      workspacePath,
      terminalCwd,
      ...hostFields,
    };
  }
  if (workspacePath) {
    return {
      surface: "workspace",
      url: workspaceSpatialUrl(workspacePath),
      workspacePath,
      ...hostFields,
    };
  }
  return {
    surface: "screen",
    url: screenSpatialUrl(),
    ...hostFields,
  };
}

export interface MacHostClassification {
  deviceKind: SpatialPinDeviceKind;
  bundleId?: string;
}

/**
 * Classify a macOS frontmost application for Spatial Pin host enrichment.
 */
export function classifyMacHostApp(
  appName: string | null | undefined,
  windowTitle?: string | null,
): MacHostClassification {
  const name = (appName ?? "").trim().toLowerCase();
  const title = (windowTitle ?? "").trim().toLowerCase();
  const haystack = `${name} ${title}`;

  if (
    name.includes("simulator") ||
    haystack.includes("iphone") ||
    haystack.includes("ipad")
  ) {
    if (
      name.includes("android") ||
      name.includes("emulator") ||
      name.includes("qemu")
    ) {
      return {
        deviceKind: "android-emulator",
        bundleId: "com.google.android.emulator",
      };
    }
    return {
      deviceKind: "ios-simulator",
      bundleId: "com.apple.iphonesimulator",
    };
  }

  if (
    name.includes("emulator") ||
    name.includes("qemu") ||
    haystack.includes("android emulator")
  ) {
    return {
      deviceKind: "android-emulator",
      bundleId: "com.google.android.emulator",
    };
  }

  if (name === "xcode" || name.startsWith("xcode ")) {
    return { deviceKind: "ide", bundleId: "com.apple.dt.Xcode" };
  }
  if (
    name.includes("android studio") ||
    name === "studio" ||
    name.includes("intellij")
  ) {
    return { deviceKind: "ide", bundleId: "com.google.android.studio" };
  }

  if (
    name.includes("code") ||
    name.includes("cursor") ||
    name.includes("terminal") ||
    name.includes("iterm") ||
    name.includes("chrome") ||
    name.includes("safari") ||
    name.includes("firefox") ||
    name.includes("project os")
  ) {
    return { deviceKind: "other" };
  }

  if (name.length > 0) {
    return { deviceKind: "other" };
  }
  return { deviceKind: "other" };
}

function hasHostLocationFields(location: LocationKey): boolean {
  return Boolean(
    location.appName ||
      location.windowTitle ||
      location.deviceKind ||
      location.bundleId ||
      location.inferredPath,
  );
}

/** Host / snapshot / arrow metadata line historically wrapped in `[...]`. */
export function formatSpatialPinLocationLine(pin: SpatialPin): string {
  const loc = pin.location;
  const lines: string[] = [
    `Spatial pin on ${loc.surface}`,
    loc.url,
  ];
  if (loc.appName) lines.push(`app=${loc.appName}`);
  if (loc.bundleId) lines.push(`bundleId=${loc.bundleId}`);
  if (loc.windowTitle) lines.push(`window=${loc.windowTitle}`);
  if (loc.deviceKind) lines.push(`device=${loc.deviceKind}`);
  if (loc.inferredPath) lines.push(`inferredPath=${loc.inferredPath}`);
  if (loc.workspacePath) lines.push(`workspace=${loc.workspacePath}`);
  if (loc.selector) lines.push(`selector=${loc.selector}`);
  if (loc.textHint) lines.push(`hint=${loc.textHint}`);
  if (pin.composer.snapshotAssetPath) {
    lines.push(`snapshot=${pin.composer.snapshotAssetPath}`);
  }
  if (pin.captureRect) {
    const r = pin.captureRect;
    lines.push(
      `rect=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    );
  }
  for (const stroke of pin.annotations.strokes) {
    if (stroke.kind !== "arrow") continue;
    lines.push(
      `arrow=#${stroke.index} color=${stroke.color} anchor=${stroke.anchor} head=${stroke.head.x.toFixed(2)},${stroke.head.y.toFixed(2)} tail=${stroke.tail.x.toFixed(2)},${stroke.tail.y.toFixed(2)}`,
    );
  }
  return lines.join(" · ");
}

export interface BuildSpatialPinUserContentOptions {
  placements?: readonly StencilPlacement[];
  outOfScope?: string;
  repoConstraintLines?: readonly string[];
  codegenHints?: readonly string[];
}

export function emptyPinComposerHub(): PinComposerHub {
  return {
    researchEnabled: false,
    folders: [],
    skillIds: [],
    references: [],
    subagents: [],
  };
}

export function formatPinComposerHubLines(hub: PinComposerHub): string[] {
  const lines: string[] = [];
  if (hub.repo) {
    lines.push(
      `hub.repo=${hub.repo.label}${hub.repo.branch ? ` @${hub.repo.branch}` : ""}`,
    );
  }
  if (hub.folders.length > 0) {
    lines.push(`hub.folders=${hub.folders.join(", ")}`);
  }
  if (hub.skillIds.length > 0) {
    lines.push(`hub.skills=${hub.skillIds.join(", ")}`);
  }
  if (hub.references.length > 0) {
    lines.push(
      `hub.references=${hub.references
        .map((item) =>
          item.kind === "image"
            ? `image:${item.assetPath}`
            : `file:${item.path}`,
        )
        .join(", ")}`,
    );
  }
  if (hub.researchEnabled) {
    lines.push("hub.research=enabled");
  }
  const enabledAgents = hub.subagents.filter((slot) => slot.enabled);
  if (enabledAgents.length > 0) {
    lines.push(
      `hub.subagents=${enabledAgents
        .map((slot) => `${slot.name}${slot.brief.trim() ? `(${slot.brief.trim().slice(0, 80)})` : ""}`)
        .join(" | ")}`,
    );
  }
  return lines;
}

/**
 * Format prompt + host/snapshot metadata for chat and agent submission.
 * With stencil placements or composer.stencilBrief, emits layered stencil-aware content.
 */
export function buildSpatialPinUserContent(
  pin: SpatialPin,
  options?: BuildSpatialPinUserContentOptions,
): string {
  const locationLine = formatSpatialPinLocationLine(pin);
  const hubLines = pin.composer.hub
    ? formatPinComposerHubLines(pin.composer.hub)
    : [];
  const base = buildSpatialPinUserContentWithStencils(pin.composer, {
    locationLine,
    ...(options?.placements ? { placements: options.placements } : {}),
    ...(options?.outOfScope ? { outOfScope: options.outOfScope } : {}),
    ...(options?.repoConstraintLines
      ? { repoConstraintLines: options.repoConstraintLines }
      : {}),
    ...(options?.codegenHints ? { codegenHints: options.codegenHints } : {}),
  });
  if (hubLines.length === 0) return base;
  return `${base}\n\n## Compose hub\n${hubLines.map((line) => `- ${line}`).join("\n")}`;
}

/** Build a persisted arrow stroke from region-relative head/tail. */
export function createArrowStroke(input: {
  id: string;
  index: number;
  color: string;
  anchor: AnnotationAnchor;
  head: AnnotationPointUnbounded;
  tail: AnnotationPointUnbounded;
  width?: number;
}): AnnotationStrokeArrow {
  return {
    id: input.id,
    kind: "arrow",
    color: input.color,
    width: input.width ?? 2,
    index: input.index,
    anchor: input.anchor,
    head: input.head,
    tail: input.tail,
    points: [input.head, input.tail],
  };
}

export function normalizeSpatialPinUrl(url: string): string {
  if (url.startsWith("spatial://")) {
    return url.trim();
  }
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname || "/";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function routePathFromUrl(url: string): string | undefined {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return undefined;
  }
}

export function headFromSpatialPin(pin: SpatialPin): SpatialPinHead {
  return {
    id: pin.id,
    projectId: pin.projectId,
    url: pin.location.url,
    status: pin.status,
    mode: pin.composer.mode,
    title: pin.title,
    updatedAt: pin.updatedAt,
    chatSessionId: pin.links?.chatSessionId,
    runId: pin.links?.runId,
  };
}

export function emptyAnnotationDoc(): AnnotationDoc {
  return { version: "0.1.0", strokes: [] };
}

export function createDraftSpatialPin(input: {
  id: string;
  projectId: string;
  location: LocationKey;
  now?: string;
  captureRect?: ScreenRect;
}): SpatialPin {
  const now = input.now ?? new Date().toISOString();
  const web = isWebSurface(input.location.surface);
  const routePath = web
    ? (input.location.routePath ?? routePathFromUrl(input.location.url))
    : input.location.routePath;
  const hasSelector = Boolean(input.location.selector);
  const hasHost = hasHostLocationFields(input.location);
  return {
    version: "0.1.0",
    id: input.id,
    projectId: input.projectId,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    location: {
      ...input.location,
      url: normalizeSpatialPinUrl(input.location.url),
      ...(routePath ? { routePath } : {}),
    },
    annotations: emptyAnnotationDoc(),
    composer: {
      mode: "change",
      prompt: "",
    },
    resolve: {
      confidence: hasSelector ? "exact" : hasHost ? "approx" : "snapshot_only",
      method: hasSelector ? "selector" : hasHost ? "host_window" : "snapshot",
      lastRect: input.captureRect,
      lastResolvedAt: now,
    },
    ...(input.captureRect ? { captureRect: input.captureRect } : {}),
  };
}
