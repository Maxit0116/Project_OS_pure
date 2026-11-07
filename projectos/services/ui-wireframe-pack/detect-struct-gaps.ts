import type {
  UpsertWireframeGapInput,
  WireframePack,
} from "../../contracts/ui-wireframe-pack.js";
import { acceptanceScreenIds } from "../../contracts/ui-wireframe-pack.js";

/**
 * L-struct heuristics (WP-M2-b): deterministic gaps from pack structure
 * and optional preview HTML text presence. Never pixel-diff.
 */
export function detectStructGaps(
  pack: WireframePack,
  previewHtmlByScreen?: Record<string, string>,
): UpsertWireframeGapInput[] {
  const scope = new Set(acceptanceScreenIds(pack));
  const gaps: UpsertWireframeGapInput[] = [];

  for (const screen of pack.screens) {
    if (!scope.has(screen.id)) continue;

    if (screen.regions.length === 0) {
      gaps.push({
        screenId: screen.id,
        layer: "struct",
        severity: "block",
        summary: `Screen "${screen.title}" has no regions`,
      });
      continue;
    }

    const hasCta = screen.regions.some((region) => Boolean(region.cta?.trim()));
    if (screen.role === "main" && !hasCta) {
      gaps.push({
        screenId: screen.id,
        layer: "struct",
        severity: "major",
        summary: `Main screen "${screen.title}" has no primary CTA region`,
      });
    }

    const unlabeled = screen.regions.filter((region) => !region.label.trim());
    if (unlabeled.length > 0) {
      gaps.push({
        screenId: screen.id,
        layer: "struct",
        severity: "minor",
        summary: `Screen "${screen.title}" has ${unlabeled.length} unlabeled region(s)`,
      });
    }

    const preview = previewHtmlByScreen?.[screen.id]?.trim();
    if (!preview) continue;

    const previewLower = preview.toLowerCase();
    for (const region of screen.regions) {
      const needle = region.cta?.trim() || region.label.trim();
      if (!needle) continue;
      if (!previewLower.includes(needle.toLowerCase())) {
        gaps.push({
          screenId: screen.id,
          regionId: region.id,
          layer: "struct",
          severity: region.cta ? "major" : "minor",
          summary: `Preview for "${screen.title}" missing expected "${needle}"`,
          evidence: "previewHtml heuristic",
        });
      }
    }
  }

  if (pack.flow.length === 0 && pack.screens.length > 1) {
    const first = pack.screens.find((screen) => scope.has(screen.id));
    if (first) {
      gaps.push({
        screenId: first.id,
        layer: "struct",
        severity: "minor",
        summary: "Pack has multiple screens but no screen-flow edges",
      });
    }
  }

  return gaps;
}

/** Deduplicate against existing open gaps with the same screen+summary. */
export function filterNewStructGaps(
  proposed: UpsertWireframeGapInput[],
  existingSummaries: Set<string>,
): UpsertWireframeGapInput[] {
  return proposed.filter((gap) => {
    const key = `${gap.screenId}::${gap.summary}`;
    return !existingSummaries.has(key);
  });
}
