import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, win32 } from "node:path";

export type WorkspaceReadinessState =
  | "dependencies_missing"
  | "client_missing"
  | "client_stale"
  | "migration_pending"
  | "seed_missing"
  | "seed_stale"
  | "route_unavailable"
  | "ready";

export type WorkspaceReadinessAction =
  | "npm_ci"
  | "prisma_generate"
  | "prisma_migrate_deploy"
  | "run_seed"
  | "start_preview";

export interface ReadinessFileFingerprint {
  path: string;
  sha256: string;
}

/** Server-derived probe evidence; this is intentionally not an IPC contract. */
export interface WorkspaceReadinessSnapshot {
  workspaceId: string;
  projectId: string;
  canonicalWorkspaceRoot: string;
  routePath: string;
  lockfile: ReadinessFileFingerprint;
  dependencies: {
    installed: boolean;
    installedLockfileSha256?: string;
  };
  prismaSchema: ReadinessFileFingerprint;
  prismaClient: {
    present: boolean;
    generatedFromSchemaSha256?: string;
  };
  migrations: {
    files: ReadinessFileFingerprint[];
    pending: boolean;
  };
  seed: {
    script: ReadinessFileFingerprint;
    version: string;
    status: "missing" | "stale" | "current";
    databaseFixtureIdentity?: string;
  };
  route: {
    available: boolean;
  };
}

export interface WorkspaceReadinessRemediation {
  action: WorkspaceReadinessAction;
}

export type WorkspaceReadinessResult =
  | {
      state: Exclude<WorkspaceReadinessState, "ready">;
      ready: false;
      remediation: WorkspaceReadinessRemediation;
    }
  | {
      state: "ready";
      ready: true;
    };

export interface ReadyWorkspaceBinding {
  workspaceId: string;
  projectId: string;
  canonicalWorkspaceRoot: string;
  routePath: string;
  lockfile: ReadinessFileFingerprint;
  prismaSchema: ReadinessFileFingerprint;
  migrations: ReadinessFileFingerprint[];
  seedScript: ReadinessFileFingerprint;
  seedVersion: string;
  databaseFixtureIdentity: string;
}

export interface ReadyWorkspaceToken {
  version: 1;
  tokenId: string;
  binding: ReadyWorkspaceBinding;
  bindingHash: string;
}

export type ReadyWorkspaceTokenValidation =
  | { valid: true; binding: ReadyWorkspaceBinding }
  | { valid: false; reason: string };

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const HTTP_CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

const REMEDIATIONS: Record<Exclude<WorkspaceReadinessState, "ready">, WorkspaceReadinessAction> = {
  dependencies_missing: "npm_ci",
  client_missing: "prisma_generate",
  client_stale: "prisma_generate",
  migration_pending: "prisma_migrate_deploy",
  seed_missing: "run_seed",
  seed_stale: "run_seed",
  route_unavailable: "start_preview",
};

interface IssuedTokenRecord {
  tokenId: string;
  bindingHash: string;
}

export interface WorkspaceReadinessServiceOptions {
  createTokenId?: () => string;
}

/**
 * Pure readiness state machine plus a server-owned token registry.
 *
 * The service never executes a remediation. A caller must explicitly run the
 * closed action returned by inspect(), then provide fresh evidence.
 */
export class WorkspaceReadinessService {
  private readonly createTokenId: () => string;
  private readonly issuedTokensByWorkspace = new Map<string, IssuedTokenRecord>();

  constructor(options: WorkspaceReadinessServiceOptions = {}) {
    this.createTokenId = options.createTokenId ?? randomUUID;
  }

  inspect(snapshot: WorkspaceReadinessSnapshot): WorkspaceReadinessResult {
    validateSnapshot(snapshot);
    const state = readinessState(snapshot);
    if (state === "ready") {
      return { state, ready: true };
    }
    return {
      state,
      ready: false,
      remediation: { action: REMEDIATIONS[state] },
    };
  }

  /**
   * Issues the capability required to start the managed preview once every
   * durable layer is current. The route itself may still be unavailable: the
   * manager's HTTP-ready event is the explicit remediation for that last layer.
   */
  issueReadyWorkspaceToken(snapshot: WorkspaceReadinessSnapshot): ReadyWorkspaceToken {
    validateSnapshot(snapshot);
    const state = readinessState(snapshot);
    if (state !== "route_unavailable" && state !== "ready") {
      throw new Error(`Workspace durable readiness is incomplete: ${state}`);
    }

    const binding = bindingFromSnapshot(snapshot);
    const bindingHash = hashBinding(binding);
    const tokenId = this.createTokenId();
    const workspaceKey = workspaceProjectKey(binding);
    this.issuedTokensByWorkspace.set(workspaceKey, { tokenId, bindingHash });
    return {
      version: 1,
      tokenId,
      binding,
      bindingHash,
    };
  }

  validateReadyWorkspaceToken(
    token: ReadyWorkspaceToken,
    snapshot: WorkspaceReadinessSnapshot,
  ): ReadyWorkspaceTokenValidation {
    try {
      validateSnapshot(snapshot);
      if (token.version !== 1 || token.tokenId.length === 0) {
        return { valid: false, reason: "Ready workspace token is malformed" };
      }

      const state = readinessState(snapshot);
      if (state !== "route_unavailable" && state !== "ready") {
        return {
          valid: false,
          reason: `Workspace durable readiness is incomplete: ${state}`,
        };
      }

      validateBinding(token.binding);
      const currentBinding = bindingFromSnapshot(snapshot);
      const currentHash = hashBinding(currentBinding);
      const tokenHash = hashBinding(token.binding);
      if (token.bindingHash !== tokenHash || token.bindingHash !== currentHash) {
        return { valid: false, reason: "Ready workspace token binding is stale" };
      }

      const issued = this.issuedTokensByWorkspace.get(workspaceProjectKey(currentBinding));
      if (
        !issued ||
        issued.tokenId !== token.tokenId ||
        issued.bindingHash !== token.bindingHash
      ) {
        return { valid: false, reason: "Ready workspace token is not server-issued" };
      }

      return { valid: true, binding: currentBinding };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : "Ready workspace token is invalid",
      };
    }
  }

  revokeReadyWorkspaceToken(token: ReadyWorkspaceToken): void {
    const workspaceKey = workspaceProjectKey(token.binding);
    const issued = this.issuedTokensByWorkspace.get(workspaceKey);
    if (issued?.tokenId === token.tokenId) {
      this.issuedTokensByWorkspace.delete(workspaceKey);
    }
  }
}

function readinessState(snapshot: WorkspaceReadinessSnapshot): WorkspaceReadinessState {
  if (
    !snapshot.dependencies.installed ||
    snapshot.dependencies.installedLockfileSha256 !== snapshot.lockfile.sha256
  ) {
    return "dependencies_missing";
  }
  if (!snapshot.prismaClient.present) return "client_missing";
  if (snapshot.prismaClient.generatedFromSchemaSha256 !== snapshot.prismaSchema.sha256) {
    return "client_stale";
  }
  if (snapshot.migrations.pending) return "migration_pending";
  if (snapshot.seed.status === "missing") return "seed_missing";
  if (snapshot.seed.status === "stale") return "seed_stale";
  if (!snapshot.route.available) return "route_unavailable";
  return "ready";
}

function bindingFromSnapshot(snapshot: WorkspaceReadinessSnapshot): ReadyWorkspaceBinding {
  if (!snapshot.seed.databaseFixtureIdentity) {
    throw new Error("Current seed evidence requires a database fixture identity");
  }
  return {
    workspaceId: snapshot.workspaceId,
    projectId: snapshot.projectId,
    canonicalWorkspaceRoot: snapshot.canonicalWorkspaceRoot,
    routePath: snapshot.routePath,
    lockfile: { ...snapshot.lockfile },
    prismaSchema: { ...snapshot.prismaSchema },
    migrations: [...snapshot.migrations.files]
      .sort((left, right) => compareCodeUnits(left.path, right.path))
      .map((file) => ({ ...file })),
    seedScript: { ...snapshot.seed.script },
    seedVersion: snapshot.seed.version,
    databaseFixtureIdentity: snapshot.seed.databaseFixtureIdentity,
  };
}

function validateSnapshot(snapshot: WorkspaceReadinessSnapshot): void {
  for (const [label, value] of [
    ["workspaceId", snapshot.workspaceId],
    ["projectId", snapshot.projectId],
    ["canonicalWorkspaceRoot", snapshot.canonicalWorkspaceRoot],
    ["routePath", snapshot.routePath],
    ["seed version", snapshot.seed.version],
  ] as const) {
    if (value.trim().length === 0 || value.includes("\0")) {
      throw new Error(`${label} must not be empty or contain NUL`);
    }
  }
  if (!isAbsolute(snapshot.canonicalWorkspaceRoot)) {
    throw new Error("canonicalWorkspaceRoot must be absolute");
  }
  validateReadyWorkspaceRoutePath(snapshot.routePath);
  validateFingerprint(snapshot.lockfile, "lockfile");
  validateFingerprint(snapshot.prismaSchema, "Prisma schema");
  validateFingerprint(snapshot.seed.script, "seed script");

  const migrationPaths = new Set<string>();
  for (const migration of snapshot.migrations.files) {
    validateFingerprint(migration, "migration");
    if (migrationPaths.has(migration.path)) {
      throw new Error(`Duplicate migration path: ${migration.path}`);
    }
    migrationPaths.add(migration.path);
  }

  const optionalHashes = [
    snapshot.dependencies.installedLockfileSha256,
    snapshot.prismaClient.generatedFromSchemaSha256,
  ];
  for (const hash of optionalHashes) {
    if (hash !== undefined && !SHA256_PATTERN.test(hash)) {
      throw new Error("Readiness evidence contains an invalid SHA-256 hash");
    }
  }
  if (snapshot.seed.status === "current" && !snapshot.seed.databaseFixtureIdentity) {
    throw new Error("Current seed evidence requires a database fixture identity");
  }
}

function validateBinding(binding: ReadyWorkspaceBinding): void {
  validateReadyWorkspaceRoutePath(binding.routePath);
  validateFingerprint(binding.lockfile, "token lockfile");
  validateFingerprint(binding.prismaSchema, "token Prisma schema");
  validateFingerprint(binding.seedScript, "token seed script");
  for (const migration of binding.migrations) {
    validateFingerprint(migration, "token migration");
  }
  if (
    binding.workspaceId.length === 0 ||
    binding.projectId.length === 0 ||
    binding.canonicalWorkspaceRoot.length === 0 ||
    binding.seedVersion.length === 0 ||
    binding.databaseFixtureIdentity.length === 0
  ) {
    throw new Error("Ready workspace token binding is incomplete");
  }
}

export function validateReadyWorkspaceRoutePath(routePath: string): void {
  const pathOnly = routePath.split(/[?#]/u, 1)[0] ?? "";
  if (
    !routePath.startsWith("/") ||
    routePath.startsWith("//") ||
    pathOnly.includes("//") ||
    routePath.includes("\\") ||
    HTTP_CONTROL_CHARACTER_PATTERN.test(routePath)
  ) {
    throw new Error("routePath must be a canonical root-relative HTTP path");
  }
  for (const segment of pathOnly.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error("routePath must be a canonical root-relative HTTP path");
    }
    if (
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      HTTP_CONTROL_CHARACTER_PATTERN.test(decoded)
    ) {
      throw new Error("routePath must be a canonical root-relative HTTP path");
    }
  }
}

function validateFingerprint(fingerprint: ReadinessFileFingerprint, label: string): void {
  if (
    fingerprint.path.length === 0 ||
    fingerprint.path.includes("\0") ||
    isAbsolute(fingerprint.path) ||
    win32.isAbsolute(fingerprint.path) ||
    fingerprint.path.split(/[\\/]/u).includes("..") ||
    !SHA256_PATTERN.test(fingerprint.sha256)
  ) {
    throw new Error(`${label} fingerprint is invalid`);
  }
}

function workspaceProjectKey(binding: Pick<
  ReadyWorkspaceBinding,
  "canonicalWorkspaceRoot" | "projectId"
>): string {
  return `${binding.canonicalWorkspaceRoot}\0${binding.projectId}`;
}

function hashBinding(binding: ReadyWorkspaceBinding): string {
  const canonical = canonicalJson(binding);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
