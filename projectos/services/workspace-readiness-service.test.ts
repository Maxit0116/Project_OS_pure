import { describe, expect, it } from "vitest";

import type { WorkspaceReadinessSnapshot } from "./workspace-readiness-service.js";
import { WorkspaceReadinessService } from "./workspace-readiness-service.js";

const sha = (character: string): string => `sha256:${character.repeat(64)}`;

function readySnapshot(): WorkspaceReadinessSnapshot {
  return {
    workspaceId: "workspace_sample",
    projectId: "project_sample",
    canonicalWorkspaceRoot: "/workspace/sample",
    routePath: "/dashboard",
    lockfile: { path: "package-lock.json", sha256: sha("a") },
    dependencies: {
      installed: true,
      installedLockfileSha256: sha("a"),
    },
    prismaSchema: { path: "prisma/schema.prisma", sha256: sha("b") },
    prismaClient: {
      present: true,
      generatedFromSchemaSha256: sha("b"),
    },
    migrations: {
      files: [
        { path: "prisma/migrations/002/migration.sql", sha256: sha("d") },
        { path: "prisma/migrations/001/migration.sql", sha256: sha("c") },
      ],
      pending: false,
    },
    seed: {
      script: { path: "prisma/seed.cjs", sha256: sha("e") },
      version: "workspace-v2",
      status: "current",
      databaseFixtureIdentity: "workspace-v2:sha256:fixture",
    },
    route: { available: true },
  };
}

function cloneSnapshot(snapshot: WorkspaceReadinessSnapshot): WorkspaceReadinessSnapshot {
  return structuredClone(snapshot);
}

describe("WorkspaceReadinessService", () => {
  it("reports the first incomplete layer and only its explicit remediation", () => {
    const service = new WorkspaceReadinessService();
    const snapshots: Array<{
      expectedState: string;
      expectedAction: string;
      mutate(snapshot: WorkspaceReadinessSnapshot): void;
    }> = [
      {
        expectedState: "dependencies_missing",
        expectedAction: "npm_ci",
        mutate: (snapshot) => {
          snapshot.dependencies.installed = false;
          snapshot.prismaClient.present = false;
        },
      },
      {
        expectedState: "client_missing",
        expectedAction: "prisma_generate",
        mutate: (snapshot) => {
          snapshot.prismaClient.present = false;
        },
      },
      {
        expectedState: "client_stale",
        expectedAction: "prisma_generate",
        mutate: (snapshot) => {
          snapshot.prismaClient.generatedFromSchemaSha256 = sha("f");
        },
      },
      {
        expectedState: "migration_pending",
        expectedAction: "prisma_migrate_deploy",
        mutate: (snapshot) => {
          snapshot.migrations.pending = true;
        },
      },
      {
        expectedState: "seed_missing",
        expectedAction: "run_seed",
        mutate: (snapshot) => {
          snapshot.seed.status = "missing";
          delete snapshot.seed.databaseFixtureIdentity;
        },
      },
      {
        expectedState: "seed_stale",
        expectedAction: "run_seed",
        mutate: (snapshot) => {
          snapshot.seed.status = "stale";
        },
      },
      {
        expectedState: "route_unavailable",
        expectedAction: "start_preview",
        mutate: (snapshot) => {
          snapshot.route.available = false;
        },
      },
    ];

    for (const item of snapshots) {
      const snapshot = readySnapshot();
      item.mutate(snapshot);
      expect(service.inspect(snapshot)).toEqual({
        state: item.expectedState,
        ready: false,
        remediation: { action: item.expectedAction },
      });
    }
    expect(service.inspect(readySnapshot())).toEqual({ state: "ready", ready: true });
  });

  it("issues a server-owned token after durable readiness and sorts migration bindings", () => {
    const service = new WorkspaceReadinessService({
      createTokenId: () => "ready_token_1",
    });
    const snapshot = readySnapshot();
    snapshot.route.available = false;

    const token = service.issueReadyWorkspaceToken(snapshot);

    expect(token).toMatchObject({
      version: 1,
      tokenId: "ready_token_1",
      binding: {
        workspaceId: "workspace_sample",
        projectId: "project_sample",
        routePath: "/dashboard",
        databaseFixtureIdentity: "workspace-v2:sha256:fixture",
      },
    });
    expect(token.binding.migrations.map((migration) => migration.path)).toEqual([
      "prisma/migrations/001/migration.sql",
      "prisma/migrations/002/migration.sql",
    ]);
    expect(token.bindingHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(service.validateReadyWorkspaceToken(token, snapshot)).toEqual({
      valid: true,
      binding: token.binding,
    });
  });

  it("rejects stale, forged, superseded, and prematurely issued tokens", () => {
    let tokenNumber = 0;
    const service = new WorkspaceReadinessService({
      createTokenId: () => `ready_token_${++tokenNumber}`,
    });
    const snapshot = readySnapshot();
    const token = service.issueReadyWorkspaceToken(snapshot);

    const mutations: Array<(value: WorkspaceReadinessSnapshot) => void> = [
      (value) => { value.lockfile.sha256 = sha("f"); },
      (value) => { value.prismaSchema.sha256 = sha("f"); },
      (value) => { value.migrations.files[0]!.sha256 = sha("f"); },
      (value) => { value.seed.script.sha256 = sha("f"); },
      (value) => { value.seed.version = "workspace-v3"; },
      (value) => { value.workspaceId = "workspace_other"; },
      (value) => { value.projectId = "project_other"; },
      (value) => { value.seed.databaseFixtureIdentity = "workspace-v2:poisoned"; },
    ];
    for (const mutate of mutations) {
      const changed = cloneSnapshot(snapshot);
      mutate(changed);
      expect(service.validateReadyWorkspaceToken(token, changed).valid).toBe(false);
    }

    const forged = structuredClone(token);
    forged.tokenId = "forged";
    expect(service.validateReadyWorkspaceToken(forged, snapshot)).toMatchObject({
      valid: false,
      reason: "Ready workspace token is not server-issued",
    });

    const replacement = service.issueReadyWorkspaceToken(snapshot);
    expect(service.validateReadyWorkspaceToken(token, snapshot).valid).toBe(false);
    expect(service.validateReadyWorkspaceToken(replacement, snapshot).valid).toBe(true);

    const incomplete = readySnapshot();
    incomplete.migrations.pending = true;
    expect(() => service.issueReadyWorkspaceToken(incomplete)).toThrow(
      "Workspace durable readiness is incomplete: migration_pending",
    );
  });

  it("fails closed on malformed hashes, duplicate migrations, and missing fixture identity", () => {
    const service = new WorkspaceReadinessService();
    const malformed = readySnapshot();
    malformed.lockfile.sha256 = "not-a-hash";
    expect(() => service.inspect(malformed)).toThrow("lockfile fingerprint is invalid");

    const duplicate = readySnapshot();
    duplicate.migrations.files[1]!.path = duplicate.migrations.files[0]!.path;
    expect(() => service.inspect(duplicate)).toThrow("Duplicate migration path");

    const missingIdentity = readySnapshot();
    delete missingIdentity.seed.databaseFixtureIdentity;
    expect(() => service.inspect(missingIdentity)).toThrow(
      "Current seed evidence requires a database fixture identity",
    );

    const escapedPath = readySnapshot();
    escapedPath.seed.script.path = "../seed.cjs";
    expect(() => service.inspect(escapedPath)).toThrow("seed script fingerprint is invalid");

    const relativeRoot = readySnapshot();
    relativeRoot.canonicalWorkspaceRoot = "relative/workspace";
    expect(() => service.inspect(relativeRoot)).toThrow(
      "canonicalWorkspaceRoot must be absolute",
    );

    for (const routePath of [
      "dashboard",
      "//attacker.example/dashboard",
      "/dashboard//nested",
      "/../dashboard",
      "/%2e%2e/dashboard",
      "/\\attacker.example/dashboard",
      "/dashboard\nnext",
      "/dashboard/%0a",
      "/dashboard/%2f%2fadmin",
    ]) {
      const invalidRoute = readySnapshot();
      invalidRoute.routePath = routePath;
      expect(() => service.inspect(invalidRoute)).toThrow(
        "routePath must be a canonical root-relative HTTP path",
      );
    }

    const issued = service.issueReadyWorkspaceToken(readySnapshot());
    issued.binding.routePath = "/dashboard/../admin";
    expect(service.validateReadyWorkspaceToken(issued, readySnapshot())).toMatchObject({
      valid: false,
      reason: "routePath must be a canonical root-relative HTTP path",
    });
  });
});
