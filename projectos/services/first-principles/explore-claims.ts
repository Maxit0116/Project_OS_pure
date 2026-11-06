import type {
  AtomicClaim,
  FirstPrinciplesConflict,
  FirstPrinciplesSession,
} from "../../contracts/first-principles.js";
import type { LoadedProjectOSWorkspace } from "../../persistence/workspace-store.js";
import { exploreForAskQuestion } from "../ask-exploration-service.js";

function nowConflictId(): string {
  return `fpc_${globalThis.crypto.randomUUID()}`;
}

/** Heuristic: user claims novelty / absence while exploration hits similar symbols. */
export function applyExplorationToSession(
  session: FirstPrinciplesSession,
  workspace: LoadedProjectOSWorkspace,
): {
  session: FirstPrinciplesSession;
  conflict: FirstPrinciplesConflict | null;
  explorationMarkdown: string;
} {
  const query = [
    session.rawVision,
    session.problemStatement ?? "",
    session.mvpObligation ?? "",
    ...session.atomicClaims.map((claim) => claim.text),
  ]
    .filter(Boolean)
    .join("\n");

  let explorationMarkdown = "";
  let hits: Array<{ path: string; line: number; preview: string }> = [];
  try {
    const result = exploreForAskQuestion(workspace, query || session.rawVision, {
      maxRounds: 2,
      maxHits: 10,
      maxReads: 2,
    });
    explorationMarkdown = result.supplementalMarkdown;
    hits = result.trace.hits;
  } catch {
    return { session, conflict: null, explorationMarkdown: "" };
  }

  if (hits.length === 0) {
    return {
      session: {
        ...session,
        explorationSummary: explorationMarkdown.slice(0, 4_000) || session.explorationSummary,
        updatedAt: new Date().toISOString(),
      },
      conflict: null,
      explorationMarkdown,
    };
  }

  const evidenceRefs = hits
    .slice(0, 5)
    .map((hit) => `${hit.path}#L${hit.line}`);

  const noveltyClaim = session.atomicClaims.find((claim) =>
    /没有|不存在|from scratch|no existing|全新|没有竞品|仓库里没有/iu.test(claim.text),
  );
  const visionNovelty = /没有|不存在|from scratch|全新|仓库里没有/iu.test(session.rawVision);

  let atomicClaims: AtomicClaim[] = session.atomicClaims.map((claim) => {
    if (noveltyClaim && claim.id === noveltyClaim.id) {
      return {
        ...claim,
        status: "contested" as const,
        evidenceRefs: [...new Set([...(claim.evidenceRefs ?? []), ...evidenceRefs])].slice(
          0,
          8,
        ),
      };
    }
    if (claim.status === "assumed" && evidenceRefs.length > 0) {
      // Soft evidence: mark first assumed claim as evidenced with refs (not contested).
      return claim;
    }
    return claim;
  });

  if (!noveltyClaim && evidenceRefs.length > 0 && atomicClaims.length > 0) {
    atomicClaims = atomicClaims.map((claim, index) =>
      index === 0 && claim.status === "assumed"
        ? {
            ...claim,
            status: "evidenced" as const,
            evidenceRefs: [...new Set([...(claim.evidenceRefs ?? []), ...evidenceRefs])].slice(
              0,
              8,
            ),
          }
        : claim,
    );
  }

  let conflict: FirstPrinciplesConflict | null = null;
  if ((noveltyClaim || visionNovelty) && hits.length > 0) {
    conflict = {
      id: nowConflictId(),
      layerId: session.currentLayerId,
      summary:
        "只读探索在仓库里找到了可能相关的实现，这与「从零开始 / 仓库没有」的主张冲突。",
      leftLabel: noveltyClaim?.text ?? "仓库里还没有这类能力",
      rightLabel: `已有相关代码痕迹（如 ${hits[0]?.path}:${hits[0]?.line}）`,
      ...(noveltyClaim ? { leftClaimId: noveltyClaim.id } : {}),
      evidenceRefs,
    };
  }

  return {
    session: {
      ...session,
      atomicClaims,
      explorationSummary: explorationMarkdown.slice(0, 4_000),
      updatedAt: new Date().toISOString(),
    },
    conflict,
    explorationMarkdown,
  };
}

export function mergeClaimUpdates(
  session: FirstPrinciplesSession,
  updates: Array<{
    id?: string;
    text: string;
    status: AtomicClaim["status"];
    evidenceRefs?: string[];
  }>,
): FirstPrinciplesSession {
  if (updates.length === 0) return session;
  let atomicClaims = [...session.atomicClaims];
  for (const update of updates) {
    const id = update.id ?? `claim_llm_${globalThis.crypto.randomUUID().slice(0, 8)}`;
    const existingIndex = atomicClaims.findIndex(
      (claim) => claim.id === id || claim.text === update.text,
    );
    const nextClaim: AtomicClaim = {
      id: existingIndex >= 0 ? atomicClaims[existingIndex]!.id : id,
      text: update.text,
      status: update.status,
      ...(update.evidenceRefs?.length
        ? { evidenceRefs: update.evidenceRefs.slice(0, 8) }
        : existingIndex >= 0 && atomicClaims[existingIndex]?.evidenceRefs
          ? { evidenceRefs: atomicClaims[existingIndex]!.evidenceRefs }
          : {}),
    };
    if (existingIndex >= 0) {
      atomicClaims[existingIndex] = nextClaim;
    } else {
      atomicClaims = [...atomicClaims, nextClaim].slice(-24);
    }
  }
  return { ...session, atomicClaims, updatedAt: new Date().toISOString() };
}
