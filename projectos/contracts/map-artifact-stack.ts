import type { MapArtifact, MapArtifactPosition } from "./map-content.js";

export interface MapArtifactStackGroup {
  nodeId: string;
  stackId: string | null;
  members: MapArtifact[];
  active: MapArtifact;
}

export function getStackMembers(
  artifacts: MapArtifact[],
  stackId: string,
): MapArtifact[] {
  return artifacts
    .filter((artifact) => artifact.stackId === stackId)
    .sort((a, b) => (a.stackOrder ?? 0) - (b.stackOrder ?? 0));
}

export function getActiveStackMember(members: MapArtifact[]): MapArtifact {
  if (members.length === 0) {
    throw new Error("getActiveStackMember requires at least one member");
  }
  const flagged = members.find((member) => member.stackActive === true);
  if (flagged) return flagged;
  return members.reduce((top, candidate) =>
    (candidate.stackOrder ?? 0) >= (top.stackOrder ?? 0) ? candidate : top,
  );
}

export function getStackNodeId(artifact: MapArtifact): string {
  return artifact.stackId ?? artifact.id;
}

export function canMergeArtifactTypes(a: MapArtifact, b: MapArtifact): boolean {
  return a.type === b.type;
}

export function groupArtifactsForCanvas(artifacts: MapArtifact[]): MapArtifactStackGroup[] {
  const stackIds = new Set<string>();
  const groups: MapArtifactStackGroup[] = [];

  for (const artifact of artifacts) {
    if (artifact.stackId) {
      if (stackIds.has(artifact.stackId)) continue;
      stackIds.add(artifact.stackId);
      const members = getStackMembers(artifacts, artifact.stackId);
      if (members.length === 0) continue;
      groups.push({
        nodeId: artifact.stackId,
        stackId: artifact.stackId,
        members,
        active: getActiveStackMember(members),
      });
      continue;
    }

    groups.push({
      nodeId: artifact.id,
      stackId: null,
      members: [artifact],
      active: artifact,
    });
  }

  return groups;
}

export function nextStackOrder(members: MapArtifact[]): number {
  if (members.length === 0) return 0;
  return Math.max(...members.map((member) => member.stackOrder ?? 0)) + 1;
}

export function withoutStackFields<T extends MapArtifact>(artifact: T): T {
  const {
    stackId: _stackId,
    stackOrder: _stackOrder,
    stackActive: _stackActive,
    ...rest
  } = artifact as T & {
    stackId?: string;
    stackOrder?: number;
    stackActive?: boolean;
  };
  return rest as T;
}

export function applyStackActiveMember(
  artifacts: MapArtifact[],
  stackId: string,
  activeArtifactId: string,
): MapArtifact[] {
  const now = new Date().toISOString();
  return artifacts.map((artifact) => {
    if (artifact.stackId !== stackId) return artifact;
    const shouldBeActive = artifact.id === activeArtifactId;
    if (artifact.stackActive === shouldBeActive) return artifact;
    return {
      ...artifact,
      stackActive: shouldBeActive,
      updatedAt: now,
    };
  });
}

export function reorderStackTabOrder(
  artifacts: MapArtifact[],
  stackId: string,
  orderedArtifactIds: string[],
): MapArtifact[] {
  const members = getStackMembers(artifacts, stackId);
  if (orderedArtifactIds.length !== members.length) {
    throw new Error("reorderStackTabOrder requires a full permutation of stack members");
  }
  const memberIds = new Set(members.map((member) => member.id));
  for (const id of orderedArtifactIds) {
    if (!memberIds.has(id)) {
      throw new Error(`reorderStackTabOrder received unknown member '${id}'`);
    }
  }
  const orderById = new Map(orderedArtifactIds.map((id, index) => [id, index]));
  const now = new Date().toISOString();
  return artifacts.map((artifact) => {
    if (artifact.stackId !== stackId) return artifact;
    const nextOrder = orderById.get(artifact.id);
    if (nextOrder === undefined || artifact.stackOrder === nextOrder) return artifact;
    return {
      ...artifact,
      stackOrder: nextOrder,
      updatedAt: now,
    };
  });
}

export function promoteStackActiveAfterMemberLeaves(
  artifacts: MapArtifact[],
  stackId: string,
): MapArtifact[] {
  const remaining = getStackMembers(artifacts, stackId);
  if (remaining.length === 0) return artifacts;
  if (remaining.some((member) => member.stackActive === true)) return artifacts;
  const promoted = getActiveStackMember(remaining);
  return applyStackActiveMember(artifacts, stackId, promoted.id);
}

export function applyStackGeometry(
  artifact: MapArtifact,
  source: Pick<MapArtifact, "position" | "size" | "scope" | "nodeId" | "workGroupId">,
): MapArtifact {
  return {
    ...artifact,
    position: source.position,
    size: source.size,
    scope: source.scope,
    nodeId: source.nodeId,
    workGroupId: source.workGroupId,
  };
}

export function deleteStackMember(
  artifacts: MapArtifact[],
  stackId: string,
  removedId: string,
): MapArtifact[] {
  const filtered = artifacts.filter((artifact) => artifact.id !== removedId);
  const remaining = getStackMembers(filtered, stackId);
  if (remaining.length === 1) {
    const survivor = withoutStackFields(remaining[0]!);
    return filtered.map((artifact) =>
      artifact.id === survivor.id ? survivor : artifact,
    );
  }
  return promoteStackActiveAfterMemberLeaves(filtered, stackId);
}

export function maintainStackAfterMemberLeaves(
  artifacts: MapArtifact[],
  stackId: string,
  memberId: string,
): MapArtifact[] {
  const remaining = getStackMembers(artifacts, stackId).filter(
    (member) => member.id !== memberId,
  );
  if (remaining.length === 1) {
    const survivor = withoutStackFields(remaining[0]!);
    return artifacts.map((artifact) =>
      artifact.id === survivor.id ? survivor : artifact,
    );
  }
  return promoteStackActiveAfterMemberLeaves(artifacts, stackId);
}

export function syncStackGeometry(
  artifacts: MapArtifact[],
  stackId: string,
  patch: {
    position?: MapArtifactPosition;
    size?: MapArtifact["size"];
    workGroupId?: string | null;
  },
): MapArtifact[] {
  const anchor = getStackMembers(artifacts, stackId)[0];
  if (!anchor) return artifacts;

  const position = patch.position ?? anchor.position;
  const size = patch.size ?? anchor.size;
  const workGroupId = Object.prototype.hasOwnProperty.call(patch, "workGroupId")
    ? patch.workGroupId ?? undefined
    : anchor.workGroupId;

  return artifacts.map((artifact) =>
    artifact.stackId === stackId
      ? {
          ...artifact,
          position,
          size,
          workGroupId,
          updatedAt: new Date().toISOString(),
        }
      : artifact,
  );
}
