import {
  type ChatMessage,
  type ChatSessionHead,
  type ChatSessionRecord,
  type SessionContextDigest,
} from "./chat-session.js";
import {
  resolveChatSessionClassification,
  resolveSessionGraphId,
  withSessionGraphHeadProjection,
} from "./chat-session-context.js";
import { scoreSessionPair } from "./session-affinity.js";
import { applyReparentToHead } from "./session-sweep.js";

export const SESSION_TIDY_REASONS = [
  "same_responsibility",
  "shared_refs",
  "similar_intent",
  "time_adjacent",
  "title_overlap",
] as const;

export type SessionTidyReason = (typeof SESSION_TIDY_REASONS)[number];

export type SessionTidyActionKind = "attach" | "rehome" | "absorb";

export interface SessionTidyMember {
  sessionId: string;
  title: string;
  role: "anchor" | "satellite";
  suggestedAction: SessionTidyActionKind;
  reasons: SessionTidyReason[];
}

export interface SessionTidyCluster {
  id: string;
  label: string;
  anchorSessionId: string;
  members: SessionTidyMember[];
  /** Default action applied to satellites when the cluster is accepted. */
  defaultAction: SessionTidyActionKind;
  score: number;
}

export interface SessionTidyPlan {
  generatedAt: string;
  clusters: SessionTidyCluster[];
}

export interface SessionTidySnoozeMap {
  [clusterOrSessionId: string]: string;
}

const ABSORB_MAX_USER_TURNS = 2;
const MIN_PAIR_SCORE = 0.42;

function userTurnCount(messages: readonly ChatMessage[]): number {
  return messages.filter((m) => m.role === "user" && m.content.trim()).length;
}

function hasDecisionSignal(
  head: ChatSessionHead,
  digest: SessionContextDigest | undefined,
): boolean {
  if ((digest?.decisions?.length ?? 0) > 0) return true;
  return (head.previewStrip ?? []).some((item) => item.kind === "decision");
}

function isHardExcluded(
  record: ChatSessionRecord,
  pinnedIds: ReadonlyArray<string>,
  options: { activeSessionId?: string | null | undefined; snoozedUntil?: SessionTidySnoozeMap | undefined; nowMs?: number },
): boolean {
  const nowMs = options.nowMs ?? Date.now();
  const { head } = record;
  if (head.isArchived) return true;
  if (head.status === "running" || head.status === "awaiting_review") return true;
  if (pinnedIds.includes(head.id)) return true;
  if (options.activeSessionId && head.id === options.activeSessionId) return true;
  const snooze = options.snoozedUntil?.[head.id];
  if (snooze && Date.parse(snooze) > nowMs) return true;
  return false;
}

function alreadyRelated(
  a: string,
  b: string,
  parentOf: Map<string, string | undefined>,
): boolean {
  let cursor: string | undefined = a;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (cursor === b) return true;
    cursor = parentOf.get(cursor);
  }
  cursor = b;
  seen.clear();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (cursor === a) return true;
    cursor = parentOf.get(cursor);
  }
  return false;
}

type PairScore = {
  score: number;
  reasons: SessionTidyReason[];
};

function scorePair(a: ChatSessionRecord, b: ChatSessionRecord): PairScore {
  const scored = scoreSessionPair(a, b);
  return {
    score: scored.score,
    reasons: scored.reasons as SessionTidyReason[],
  };
}

function pickAnchor(records: ChatSessionRecord[]): ChatSessionRecord {
  return [...records].sort((a, b) => {
    const decA = hasDecisionSignal(a.head, a.contextDigest) ? 1 : 0;
    const decB = hasDecisionSignal(b.head, b.contextDigest) ? 1 : 0;
    if (decA !== decB) return decB - decA;
    const updated = b.head.lastUpdatedAt.localeCompare(a.head.lastUpdatedAt);
    if (updated !== 0) return updated;
    return (b.messages.length ?? 0) - (a.messages.length ?? 0);
  })[0]!;
}

function suggestSatelliteActionWithChildren(
  satellite: ChatSessionRecord,
  pairScore: number,
  hasChildren: boolean,
): SessionTidyActionKind {
  const short = userTurnCount(satellite.messages) <= ABSORB_MAX_USER_TURNS;
  if (short && !hasChildren && pairScore >= 0.55) return "absorb";
  if (pairScore >= 0.48) return "attach";
  return "rehome";
}

function clusterLabel(anchor: ChatSessionRecord, members: ChatSessionRecord[]): string {
  const resp =
    anchor.head.responsibility?.trim() ||
    anchor.contextDigest?.responsibility?.trim() ||
    "";
  if (resp) return resp.slice(0, 80);
  const title = anchor.head.title.trim();
  if (title) return title.slice(0, 80);
  return `Cluster (${members.length})`;
}

/**
 * Build continuity tidy clusters for same-feature scattered sessions.
 * Already parent/child related pairs are skipped; clusters need ≥2 members.
 */
export function buildSessionTidyPlan(
  records: readonly ChatSessionRecord[],
  pinnedIds: ReadonlyArray<string>,
  options: {
    activeSessionId?: string | null;
    snoozedUntil?: SessionTidySnoozeMap;
    nowMs?: number;
    generatedAt?: string;
    minPairScore?: number;
  } = {},
): SessionTidyPlan {
  const nowMs = options.nowMs ?? Date.now();
  const generatedAt = options.generatedAt ?? new Date(nowMs).toISOString();
  const minScore = options.minPairScore ?? MIN_PAIR_SCORE;

  const eligible = records.filter(
    (record) =>
      !isHardExcluded(record, pinnedIds, {
        activeSessionId: options.activeSessionId,
        snoozedUntil: options.snoozedUntil,
        nowMs,
      }),
  );

  const parentOf = new Map(
    records.map((record) => [record.head.id, record.head.parentSessionId] as const),
  );
  const childrenOf = new Map<string, string[]>();
  for (const record of records) {
    const parentId = record.head.parentSessionId;
    if (!parentId) continue;
    const list = childrenOf.get(parentId) ?? [];
    list.push(record.head.id);
    childrenOf.set(parentId, list);
  }

  const byId = new Map(eligible.map((record) => [record.head.id, record]));
  const ids = eligible.map((record) => record.head.id);

  // Union-find
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const id of ids) parent.set(id, id);

  const pairMeta = new Map<string, PairScore>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`);

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const idA = ids[i]!;
      const idB = ids[j]!;
      if (alreadyRelated(idA, idB, parentOf)) continue;
      const recA = byId.get(idA)!;
      const recB = byId.get(idB)!;
      const scored = scorePair(recA, recB);
      if (scored.score < minScore || scored.reasons.length === 0) continue;
      pairMeta.set(pairKey(idA, idB), scored);
      union(idA, idB);
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }

  const clusters: SessionTidyCluster[] = [];
  for (const memberIds of groups.values()) {
    if (memberIds.length < 2) continue;
    // Cluster must have at least one scored edge.
    let bestEdge = 0;
    const reasonPool: SessionTidyReason[] = [];
    for (let i = 0; i < memberIds.length; i += 1) {
      for (let j = i + 1; j < memberIds.length; j += 1) {
        const meta = pairMeta.get(pairKey(memberIds[i]!, memberIds[j]!));
        if (!meta) continue;
        bestEdge = Math.max(bestEdge, meta.score);
        reasonPool.push(...meta.reasons);
      }
    }
    if (bestEdge < minScore) continue;

    // Skip if cluster snoozed.
    const clusterId = `tidy_${[...memberIds].sort().join("_")}`;
    const clusterSnooze = options.snoozedUntil?.[clusterId];
    if (clusterSnooze && Date.parse(clusterSnooze) > nowMs) continue;

    const memberRecords = memberIds.map((id) => byId.get(id)!);
    const anchor = pickAnchor(memberRecords);
    const members: SessionTidyMember[] = memberRecords.map((record) => {
      const isAnchor = record.head.id === anchor.head.id;
      const edge = isAnchor
        ? { score: bestEdge, reasons: [...new Set(reasonPool)] }
        : pairMeta.get(pairKey(anchor.head.id, record.head.id)) ?? {
            score: bestEdge,
            reasons: [...new Set(reasonPool)],
          };
      const hasChildren = (childrenOf.get(record.head.id) ?? []).length > 0;
      const suggestedAction = isAnchor
        ? "attach"
        : suggestSatelliteActionWithChildren(record, edge.score, hasChildren);
      return {
        sessionId: record.head.id,
        title: record.head.title.trim() || record.head.id,
        role: isAnchor ? "anchor" : "satellite",
        suggestedAction,
        reasons: edge.reasons,
      };
    });

    const satelliteActions = members
      .filter((m) => m.role === "satellite")
      .map((m) => m.suggestedAction);
    const defaultAction: SessionTidyActionKind = satelliteActions.includes("absorb")
      ? "absorb"
      : satelliteActions.includes("attach")
        ? "attach"
        : "rehome";

    clusters.push({
      id: clusterId,
      label: clusterLabel(anchor, memberRecords),
      anchorSessionId: anchor.head.id,
      members,
      defaultAction,
      score: bestEdge,
    });
  }

  clusters.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return { generatedAt, clusters };
}

/** Session ids that should be protected from sweep while tidy is pending. */
export function sessionIdsInTidyPlan(plan: SessionTidyPlan | null | undefined): string[] {
  if (!plan) return [];
  const ids = new Set<string>();
  for (const cluster of plan.clusters) {
    for (const member of cluster.members) ids.add(member.sessionId);
  }
  return [...ids];
}

export function applyAttachToAnchor(
  satellite: ChatSessionRecord,
  anchor: ChatSessionRecord,
  now = new Date().toISOString(),
): ChatSessionRecord {
  const graphId = resolveSessionGraphId(anchor.head);
  let head = applyReparentToHead(satellite.head, anchor.head.id, now);
  head = {
    ...head,
    classification: "topic",
    classificationSource: satellite.head.classificationSource === "manual" ? "manual" : "auto",
    ...(graphId ? { graphId } : {}),
  };
  if (resolveChatSessionClassification(head) === "misc") {
    head.classification = "topic";
  }
  const inherited = anchor.contextDigest ?? anchor.inheritedDigest;
  return withSessionGraphHeadProjection({
    ...satellite,
    head,
    ...(inherited ? { inheritedDigest: inherited } : {}),
  });
}

export function applyRehomeToAnchorGraph(
  satellite: ChatSessionRecord,
  anchor: ChatSessionRecord,
  now = new Date().toISOString(),
): ChatSessionRecord {
  const graphId = resolveSessionGraphId(anchor.head);
  const head: ChatSessionHead = {
    ...satellite.head,
    classification: "topic",
    classificationSource: satellite.head.classificationSource === "manual" ? "manual" : "auto",
    lastUpdatedAt: now,
    ...(graphId ? { graphId } : {}),
  };
  // Keep existing parent if any; only ensure same graph canvas.
  return withSessionGraphHeadProjection({ ...satellite, head });
}

/**
 * Merge satellite transcript into anchor (skip duplicate user prompts), remap colliding ids.
 */
export function absorbSessionIntoAnchor(
  anchor: ChatSessionRecord,
  satellite: ChatSessionRecord,
  now = new Date().toISOString(),
): ChatSessionRecord {
  const existingIds = new Set(anchor.messages.map((message) => message.id));
  const seenUser = new Set(
    anchor.messages
      .filter((message) => message.role === "user")
      .map((message) => message.content.replace(/\s+/gu, " ").trim())
      .filter(Boolean),
  );

  const appended: ChatMessage[] = [];
  for (const message of satellite.messages) {
    if (message.role === "user") {
      const key = message.content.replace(/\s+/gu, " ").trim();
      if (key && seenUser.has(key)) continue;
      if (key) seenUser.add(key);
    }
    let id = message.id;
    if (existingIds.has(id)) {
      id = `${message.id}__absorbed_${satellite.head.id}`;
    }
    existingIds.add(id);
    appended.push({ ...message, id });
  }

  const messages = [...anchor.messages, ...appended].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  const head: ChatSessionHead = {
    ...anchor.head,
    lastUpdatedAt: now,
    messageCount: messages.length,
  };

  return withSessionGraphHeadProjection({
    ...anchor,
    head,
    messages,
  });
}

export function clusterFingerprint(memberIds: readonly string[]): string {
  return `tidy_${[...memberIds].sort().join("_")}`;
}
