import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative } from "node:path";
import {
  BuildImplementAgainstPackInputSchema,
  FreezeWireframePackInputSchema,
  ImplementAgainstPackBriefSchema,
  ScanWireframeStructGapsInputSchema,
  UpdateWireframePackDraftInputSchema,
  UpsertWireframeGapInputSchema,
  WireframeGapSchema,
  WireframePackIndexSchema,
  WireframePackSchema,
  acceptanceScreenIds,
  emptyWireframePackIndex,
  metaFromPack,
  packAcceptanceRef,
  type BuildImplementAgainstPackInput,
  type FreezeWireframePackInput,
  type GenerateWireframePackInput,
  type ImplementAgainstPackBrief,
  type ScanWireframeStructGapsInput,
  type UpdateWireframePackDraftInput,
  type UpsertWireframeGapInput,
  type WireframeGap,
  type WireframePack,
  type WireframePackIndex,
  type WireframePackMeta,
} from "../../contracts/ui-wireframe-pack.js";
import {
  detectStructGaps,
  filterNewStructGaps,
} from "./detect-struct-gaps.js";
import { buildDraftPackFromInput, checksumPack } from "./generate-pack.js";
import {
  packDir,
  packDraftPath,
  packFrozenPath,
  packGapsPath,
  packScreenHtmlPath,
  packVersionDir,
  wireframesIndexPath,
  wireframesRoot,
} from "./paths.js";

function readIndex(workspaceRoot: string): WireframePackIndex {
  const path = wireframesIndexPath(workspaceRoot);
  if (!existsSync(path)) return emptyWireframePackIndex();
  try {
    return WireframePackIndexSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return emptyWireframePackIndex();
  }
}

function writeIndex(
  workspaceRoot: string,
  index: WireframePackIndex,
): WireframePackIndex {
  mkdirSync(wireframesRoot(workspaceRoot), { recursive: true });
  const parsed = WireframePackIndexSchema.parse(index);
  writeFileSync(
    wireframesIndexPath(workspaceRoot),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  return parsed;
}

function upsertIndexMeta(workspaceRoot: string, pack: WireframePack): void {
  const index = readIndex(workspaceRoot);
  const meta = metaFromPack(pack);
  const next = index.packs.filter((item) => item.id !== pack.id);
  next.unshift(meta);
  writeIndex(workspaceRoot, { version: 1, packs: next.slice(0, 200) });
}

function writeScreenHtmlFiles(
  workspaceRoot: string,
  pack: WireframePack,
  versionOrDraft: "draft" | number,
): WireframePack {
  const screens = pack.screens.map((screen) => {
    const abs = packScreenHtmlPath(
      workspaceRoot,
      pack.id,
      versionOrDraft,
      screen.id,
    );
    mkdirSync(dirname(abs), { recursive: true });
    const html =
      screen.html ??
      `<!DOCTYPE html><html><body><p>${screen.title}</p></body></html>`;
    writeFileSync(abs, html, "utf8");
    const rel = relative(workspaceRoot, abs).split("\\").join("/");
    return { ...screen, htmlRelPath: rel, html };
  });
  return { ...pack, screens };
}

function persistDraft(workspaceRoot: string, pack: WireframePack): WireframePack {
  const withHtml = writeScreenHtmlFiles(workspaceRoot, pack, "draft");
  const parsed = WireframePackSchema.parse({
    ...withHtml,
    updatedAt: new Date().toISOString(),
  });
  mkdirSync(packDir(workspaceRoot, parsed.id), { recursive: true });
  writeFileSync(
    packDraftPath(workspaceRoot, parsed.id),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  upsertIndexMeta(workspaceRoot, parsed);
  return parsed;
}

function readDraft(
  workspaceRoot: string,
  packId: string,
): WireframePack | null {
  const path = packDraftPath(workspaceRoot, packId);
  if (!existsSync(path)) return null;
  try {
    return WireframePackSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

function readFrozen(
  workspaceRoot: string,
  packId: string,
  version: number,
): WireframePack | null {
  const path = packFrozenPath(workspaceRoot, packId, version);
  if (!existsSync(path)) return null;
  try {
    return WireframePackSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function listWireframePacks(workspaceRoot: string): WireframePackMeta[] {
  return readIndex(workspaceRoot).packs;
}

export function getWireframePackIndex(workspaceRoot: string): WireframePackIndex {
  return readIndex(workspaceRoot);
}

export function getWireframePack(
  workspaceRoot: string,
  packId: string,
  version?: number,
): WireframePack | null {
  if (version && version > 0) {
    return readFrozen(workspaceRoot, packId, version);
  }
  const draft = readDraft(workspaceRoot, packId);
  if (draft) return draft;
  const meta = readIndex(workspaceRoot).packs.find((item) => item.id === packId);
  if (meta && meta.version > 0) {
    return readFrozen(workspaceRoot, packId, meta.version);
  }
  return null;
}

export function generateWireframePack(
  workspaceRoot: string,
  input: GenerateWireframePackInput,
): WireframePack {
  const draft = buildDraftPackFromInput(input);
  return persistDraft(workspaceRoot, draft);
}

export function updateWireframePackDraft(
  workspaceRoot: string,
  packId: string,
  input: UpdateWireframePackDraftInput,
): WireframePack {
  const parsedInput = UpdateWireframePackDraftInputSchema.parse(input);
  const current = readDraft(workspaceRoot, packId);
  if (!current) throw new Error(`Wireframe pack draft not found: ${packId}`);
  if (current.status !== "draft") {
    throw new Error(`Pack ${packId} is ${current.status}; only draft can be edited`);
  }
  const next: WireframePack = {
    ...current,
    title: parsedInput.title ?? current.title,
    nonGoals: parsedInput.nonGoals ?? current.nonGoals,
    scope: parsedInput.scope ?? current.scope,
    fidelity: parsedInput.fidelity ?? current.fidelity,
    featureId:
      parsedInput.featureId !== undefined
        ? parsedInput.featureId
        : current.featureId,
    screens: parsedInput.screens ?? current.screens,
    flow: parsedInput.flow ?? current.flow,
  };
  return persistDraft(workspaceRoot, next);
}

export function deleteWireframeScreen(
  workspaceRoot: string,
  packId: string,
  screenId: string,
): WireframePack {
  const current = readDraft(workspaceRoot, packId);
  if (!current) throw new Error(`Wireframe pack draft not found: ${packId}`);
  if (current.status !== "draft") {
    throw new Error(`Pack ${packId} is frozen; cannot delete screens`);
  }
  if (current.screens.length <= 1) {
    throw new Error("Pack must keep at least one screen");
  }
  const screens = current.screens.filter((screen) => screen.id !== screenId);
  const flow = current.flow.filter(
    (edge) => edge.fromScreenId !== screenId && edge.toScreenId !== screenId,
  );
  return persistDraft(workspaceRoot, { ...current, screens, flow });
}

export function freezeWireframePack(
  workspaceRoot: string,
  packId: string,
  input: FreezeWireframePackInput = {},
): WireframePack {
  const parsedInput = FreezeWireframePackInputSchema.parse(input);
  const draft = readDraft(workspaceRoot, packId);
  if (!draft) throw new Error(`Wireframe pack draft not found: ${packId}`);
  if (draft.status === "realized" || draft.status === "archived") {
    throw new Error(`Cannot freeze pack in status ${draft.status}`);
  }

  const mode = parsedInput.mode ?? "full";
  const frozenScreenIds =
    mode === "main_path"
      ? draft.screens.filter((screen) => screen.role === "main").map((s) => s.id)
      : draft.screens.map((screen) => screen.id);
  if (frozenScreenIds.length === 0) {
    throw new Error("No screens in freeze scope (main_path needs role=main screens)");
  }

  const meta = readIndex(workspaceRoot).packs.find((item) => item.id === packId);
  const nextVersion = Math.max(draft.version, meta?.version ?? 0) + 1;
  const now = new Date().toISOString();
  let frozen: WireframePack = {
    ...draft,
    status: "frozen",
    version: nextVersion,
    updatedAt: now,
    freezeMeta: {
      frozenAt: now,
      frozenBy: parsedInput.frozenBy ?? "user",
      checksum: "",
      version: nextVersion,
      mode,
      frozenScreenIds,
    },
  };
  frozen = writeScreenHtmlFiles(workspaceRoot, frozen, nextVersion);
  const checksum = checksumPack(frozen);
  frozen = WireframePackSchema.parse({
    ...frozen,
    freezeMeta: { ...frozen.freezeMeta!, checksum },
  });

  mkdirSync(packVersionDir(workspaceRoot, packId, nextVersion), {
    recursive: true,
  });
  writeFileSync(
    packFrozenPath(workspaceRoot, packId, nextVersion),
    `${JSON.stringify(frozen, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    packDraftPath(workspaceRoot, packId),
    `${JSON.stringify(frozen, null, 2)}\n`,
    "utf8",
  );
  upsertIndexMeta(workspaceRoot, frozen);

  // Auto-scan L-struct gaps for acceptance-scoped screens after freeze.
  scanWireframeStructGaps(workspaceRoot, packId, {});
  return getWireframePack(workspaceRoot, packId) ?? frozen;
}

export function buildImplementAgainstPackBrief(
  workspaceRoot: string,
  packId: string,
  input: BuildImplementAgainstPackInput = {},
): ImplementAgainstPackBrief {
  const parsedInput = BuildImplementAgainstPackInputSchema.parse(input);
  const pack = getWireframePack(workspaceRoot, packId, parsedInput.version);
  if (!pack) throw new Error(`Wireframe pack not found: ${packId}`);
  if (pack.status !== "frozen" && pack.status !== "realized") {
    throw new Error(
      `Pack ${packId} is not frozen (status=${pack.status}). Freeze before Implement against Pack.`,
    );
  }
  if (pack.version < 1) {
    throw new Error(`Pack ${packId} has no frozen version`);
  }
  const acceptanceRef = packAcceptanceRef(pack.id, pack.version);
  const scopeIds = new Set(acceptanceScreenIds(pack));
  const freezeMode = pack.freezeMeta?.mode ?? "full";
  const scopedScreens = pack.screens.filter((screen) => scopeIds.has(screen.id));
  const stopPolicy =
    "Stop when acceptance-scoped screens pass structural check, no open block gaps remain, or human Accepts Pack Implementation. Never change acceptanceRef.";

  const screenSlices = scopedScreens.map((screen) => ({
    screenId: screen.id,
    title: screen.title,
    goal: `Implement screen "${screen.title}" to match L1 wireframe at ${screen.htmlRelPath}; regions: ${screen.regions.map((r) => r.label).join(", ") || "(none)"}.`,
  }));

  const loopAcceptance = [
    {
      id: "acc_ref",
      description: `Honor immutable acceptance ${acceptanceRef}`,
      kind: "human_gate" as const,
    },
    ...scopedScreens.map((screen) => ({
      id: `acc_${screen.id}`,
      description: `Screen "${screen.title}" matches wireframe regions/CTA structurally`,
      kind: "human_gate" as const,
    })),
  ];

  const promptForAgent = [
    `# Implement against Wireframe Pack`,
    ``,
    `Acceptance (immutable — do not rewrite): \`${acceptanceRef}\``,
    `Title: ${pack.title}`,
    `Feature binding: ${pack.featureId ?? "(none)"}`,
    `Freeze mode: ${freezeMode}`,
    `Scope: ${pack.scope}`,
    `Stop policy: ${stopPolicy}`,
    ``,
    `## Non-goals`,
    ...pack.nonGoals.map((item) => `- ${item}`),
    ``,
    `## Serial screen slices (Loop / Chat turns)`,
    ...screenSlices.map(
      (slice, index) => `${index + 1}. ${slice.title} (\`${slice.screenId}\`)\n   - ${slice.goal}`,
    ),
    ``,
    `## Screens`,
    ...pack.screens.map((screen) => {
      const inScope = scopeIds.has(screen.id);
      return (
        `- **${screen.title}** (\`${screen.id}\`, role=${screen.role}` +
        `${inScope ? ", acceptance" : ", deferred"})\n` +
        `  - HTML: \`${screen.htmlRelPath}\`\n` +
        `  - Regions: ${screen.regions.map((r) => r.label).join(", ") || "(none)"}`
      );
    }),
    ``,
    `## Flow`,
    ...pack.flow.map(
      (edge) =>
        `- ${edge.fromScreenId} → ${edge.toScreenId}${edge.label ? ` (${edge.label})` : ""}`,
    ),
    ``,
    `## Loop acceptance checklist`,
    ...loopAcceptance.map((item) => `- [${item.id}] ${item.description}`),
    ``,
    `## Original prompt`,
    pack.prompt,
    ``,
    `After each screen: Split View vs wireframe, close struct gaps.`,
    `UI polish after Accept → Capture + Stencil. Do not regenerate the pack.`,
  ].join("\n");

  return ImplementAgainstPackBriefSchema.parse({
    packId: pack.id,
    version: pack.version,
    title: pack.title,
    scope: pack.scope,
    nonGoals: pack.nonGoals,
    acceptanceRef,
    stopPolicy,
    freezeMode,
    featureId: pack.featureId ?? null,
    screens: pack.screens.map((screen) => ({
      id: screen.id,
      title: screen.title,
      role: screen.role,
      htmlRelPath: screen.htmlRelPath,
      regions: screen.regions,
      notes: screen.notes,
      inAcceptanceScope: scopeIds.has(screen.id),
    })),
    screenSlices,
    loopAcceptance,
    flow: pack.flow,
    promptForAgent,
  });
}

export function bindWireframePackFeature(
  workspaceRoot: string,
  packId: string,
  featureId: string | null,
): WireframePack {
  const current = getWireframePack(workspaceRoot, packId);
  if (!current) throw new Error(`Wireframe pack not found: ${packId}`);
  const next = WireframePackSchema.parse({
    ...current,
    featureId,
    screens: current.screens.map((screen) => ({
      ...screen,
      featureNodeIds: featureId ? [featureId] : undefined,
    })),
    updatedAt: new Date().toISOString(),
  });
  if (next.status === "draft") {
    return persistDraft(workspaceRoot, next);
  }
  writeFileSync(
    packDraftPath(workspaceRoot, packId),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  if (next.version > 0) {
    writeFileSync(
      packFrozenPath(workspaceRoot, packId, next.version),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
  }
  upsertIndexMeta(workspaceRoot, next);
  return next;
}

export function scanWireframeStructGaps(
  workspaceRoot: string,
  packId: string,
  input: ScanWireframeStructGapsInput = {},
): WireframeGap[] {
  const parsedInput = ScanWireframeStructGapsInputSchema.parse(input);
  const pack = getWireframePack(workspaceRoot, packId);
  if (!pack) throw new Error(`Wireframe pack not found: ${packId}`);
  const existing = readGaps(workspaceRoot, packId);
  const existingKeys = new Set(
    existing
      .filter((gap) => gap.status === "open" || gap.status === "fixing")
      .map((gap) => `${gap.screenId}::${gap.summary}`),
  );
  const proposed = detectStructGaps(pack, parsedInput.previewHtmlByScreen);
  const fresh = filterNewStructGaps(proposed, existingKeys);
  for (const gap of fresh) {
    upsertWireframeGap(workspaceRoot, packId, gap);
  }
  return readGaps(workspaceRoot, packId);
}

function readGaps(workspaceRoot: string, packId: string): WireframeGap[] {
  const path = packGapsPath(workspaceRoot, packId);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => WireframeGapSchema.parse(item));
  } catch {
    return [];
  }
}

function writeGaps(
  workspaceRoot: string,
  packId: string,
  gaps: WireframeGap[],
): WireframeGap[] {
  mkdirSync(packDir(workspaceRoot, packId), { recursive: true });
  const parsed = gaps.map((gap) => WireframeGapSchema.parse(gap));
  writeFileSync(
    packGapsPath(workspaceRoot, packId),
    `${JSON.stringify(parsed, null, 2)}\n`,
    "utf8",
  );
  return parsed;
}

export function listWireframeGaps(
  workspaceRoot: string,
  packId: string,
): WireframeGap[] {
  return readGaps(workspaceRoot, packId);
}

export function upsertWireframeGap(
  workspaceRoot: string,
  packId: string,
  input: UpsertWireframeGapInput,
): WireframeGap {
  const parsedInput = UpsertWireframeGapInputSchema.parse(input);
  const pack = getWireframePack(workspaceRoot, packId);
  if (!pack) throw new Error(`Wireframe pack not found: ${packId}`);
  if (!pack.screens.some((screen) => screen.id === parsedInput.screenId)) {
    throw new Error(`Screen not found: ${parsedInput.screenId}`);
  }
  if (
    parsedInput.status === "accepted_intentional" &&
    !parsedInput.resolutionNote?.trim()
  ) {
    throw new Error("resolutionNote is required for accepted_intentional");
  }

  const now = new Date().toISOString();
  const gaps = readGaps(workspaceRoot, packId);
  const existing = parsedInput.id
    ? gaps.find((gap) => gap.id === parsedInput.id)
    : undefined;

  const next: WireframeGap = WireframeGapSchema.parse({
    id: existing?.id ?? parsedInput.id ?? `gap_${Date.now().toString(36)}`,
    packVersion: pack.version,
    screenId: parsedInput.screenId,
    regionId: parsedInput.regionId,
    layer: parsedInput.layer,
    severity: parsedInput.severity ?? existing?.severity ?? "major",
    summary: parsedInput.summary,
    evidence: parsedInput.evidence ?? existing?.evidence,
    status: parsedInput.status ?? existing?.status ?? "open",
    resolutionNote: parsedInput.resolutionNote ?? existing?.resolutionNote,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  const merged = existing
    ? gaps.map((gap) => (gap.id === existing.id ? next : gap))
    : [next, ...gaps];
  writeGaps(workspaceRoot, packId, merged);
  return next;
}

export function markWireframePackRealized(
  workspaceRoot: string,
  packId: string,
): WireframePack {
  const pack = getWireframePack(workspaceRoot, packId);
  if (!pack) throw new Error(`Wireframe pack not found: ${packId}`);
  if (pack.status !== "frozen" && pack.status !== "realized") {
    throw new Error(`Pack must be frozen before Accept (status=${pack.status})`);
  }
  const scope = new Set(acceptanceScreenIds(pack));
  const openBlocks = readGaps(workspaceRoot, packId).filter(
    (gap) =>
      gap.status === "open" &&
      gap.severity === "block" &&
      scope.has(gap.screenId),
  );
  if (openBlocks.length > 0) {
    throw new Error(
      `Cannot accept pack while ${openBlocks.length} open block gap(s) remain on acceptance-scoped screens`,
    );
  }
  const realized = WireframePackSchema.parse({
    ...pack,
    status: "realized",
    updatedAt: new Date().toISOString(),
  });
  if (realized.version > 0) {
    writeFileSync(
      packFrozenPath(workspaceRoot, packId, realized.version),
      `${JSON.stringify(realized, null, 2)}\n`,
      "utf8",
    );
  }
  writeFileSync(
    packDraftPath(workspaceRoot, packId),
    `${JSON.stringify(realized, null, 2)}\n`,
    "utf8",
  );
  upsertIndexMeta(workspaceRoot, realized);
  return realized;
}

export function deleteWireframePack(
  workspaceRoot: string,
  packId: string,
): boolean {
  const index = readIndex(workspaceRoot);
  if (!index.packs.some((item) => item.id === packId)) return false;
  const dir = packDir(workspaceRoot, packId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  writeIndex(workspaceRoot, {
    version: 1,
    packs: index.packs.filter((item) => item.id !== packId),
  });
  return true;
}
