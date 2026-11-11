/**
 * TM-8: material change → re-review impact (not mechanical full-graph re-run).
 * When materials mutate after a plan/approval, flag affected plan evidence
 * and require human re-review of impacted nodes only — then write back into
 * taskPack so reopen/preflight see the same evidence stale state.
 */
import type { LoopTaskMaterial } from "../contracts/loop-task-materials.js";

export type MaterialChangeImpact = {
  /** True when any material add/remove/replace/selection change occurred. */
  materialsChanged: boolean;
  /** Node ids that bound materials touched — empty means whole-run materials. */
  affectedNodeIds: string[];
  /** Plan / approval evidence should be marked stale for re-review. */
  requiresRereview: boolean;
  /** Do NOT trigger full graph re-authoring / full re-run automatically. */
  mechanicalFullRerun: false;
  reason: string;
  changedMaterialIds: string[];
};

/** Persisted into document.taskPack — survives reopen; not Intent draft. */
export type MaterialRereviewWriteback = {
  requiresRereview: boolean;
  affectedNodeIds: string[];
  changedMaterialIds: string[];
  reason: string;
  evidenceStaleAt: string;
  /** Human acknowledged re-review — clears start blocker until next change. */
  acknowledgedAt?: string;
  /** Spec / plan evidence ids marked stale (node-scoped when possible). */
  staleEvidenceIds: string[];
};

function materialFingerprint(material: LoopTaskMaterial): string {
  return [
    material.id,
    material.version ?? 0,
    material.parseLevel ?? "",
    material.parseStatus,
    material.textPreview?.slice(0, 200) ?? "",
    material.contentRef ?? "",
    JSON.stringify(material.tablePreview ?? null),
    JSON.stringify(material.pdfPreview ?? null),
    (material.bindingNodeIds ?? []).join(","),
  ].join("|");
}

/**
 * Diff previous vs next materials; compute re-review impact without
 * implying a full workflow re-run.
 */
export function assessMaterialChangeImpact(input: {
  previous: LoopTaskMaterial[] | undefined;
  next: LoopTaskMaterial[] | undefined;
}): MaterialChangeImpact {
  const prev = input.previous ?? [];
  const next = input.next ?? [];
  const prevMap = new Map(prev.map((m) => [m.id, materialFingerprint(m)]));
  const nextMap = new Map(next.map((m) => [m.id, materialFingerprint(m)]));
  const changedMaterialIds: string[] = [];
  const affected = new Set<string>();

  for (const material of next) {
    const prior = prevMap.get(material.id);
    if (prior !== materialFingerprint(material)) {
      changedMaterialIds.push(material.id);
      for (const nodeId of material.bindingNodeIds ?? []) affected.add(nodeId);
    }
  }
  for (const material of prev) {
    if (!nextMap.has(material.id)) {
      changedMaterialIds.push(material.id);
      for (const nodeId of material.bindingNodeIds ?? []) affected.add(nodeId);
    }
  }

  const materialsChanged = changedMaterialIds.length > 0;
  if (!materialsChanged) {
    return {
      materialsChanged: false,
      affectedNodeIds: [],
      requiresRereview: false,
      mechanicalFullRerun: false,
      reason: "Materials unchanged — no re-review required",
      changedMaterialIds: [],
    };
  }

  const scoped = affected.size > 0;
  return {
    materialsChanged: true,
    affectedNodeIds: [...affected],
    requiresRereview: true,
    mechanicalFullRerun: false,
    reason: scoped
      ? `Materials changed (${changedMaterialIds.length}) — re-review affected nodes only; do not mechanical full re-run`
      : `Materials changed (${changedMaterialIds.length}) — run-level re-review of plan evidence; do not mechanical full-graph re-run`,
    changedMaterialIds: [...new Set(changedMaterialIds)],
  };
}

/**
 * Write plan/approval evidence stale markers from a material impact.
 * Does not mutate Intent draft or auto-rerun; caller persists into taskPack.
 */
export function writeMaterialRereviewEvidence(input: {
  impact: MaterialChangeImpact;
  /** Existing writeback (e.g. after reopen) — preserved until new change. */
  previous?: MaterialRereviewWriteback | null;
  now?: string;
}): MaterialRereviewWriteback | null {
  const now = input.now ?? new Date().toISOString();
  if (!input.impact.materialsChanged || !input.impact.requiresRereview) {
    return input.previous ?? null;
  }
  const staleEvidenceIds =
    input.impact.affectedNodeIds.length > 0
      ? input.impact.affectedNodeIds.map((id) => `plan_evidence:${id}`)
      : ["plan_evidence:run"];
  return {
    requiresRereview: true,
    affectedNodeIds: input.impact.affectedNodeIds,
    changedMaterialIds: input.impact.changedMaterialIds,
    reason: input.impact.reason,
    evidenceStaleAt: now,
    // New material change invalidates prior acknowledgment.
    staleEvidenceIds,
  };
}

export function acknowledgeMaterialRereview(
  writeback: MaterialRereviewWriteback,
  now = new Date().toISOString(),
): MaterialRereviewWriteback {
  return {
    ...writeback,
    requiresRereview: false,
    acknowledgedAt: now,
    reason: `${writeback.reason} — acknowledged ${now}`,
  };
}

/** True when start/preflight must block until human re-reviews. */
export function materialRereviewBlocksStart(
  writeback: MaterialRereviewWriteback | null | undefined,
): boolean {
  return Boolean(writeback?.requiresRereview && !writeback.acknowledgedAt);
}
