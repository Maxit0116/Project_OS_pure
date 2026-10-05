import {
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync, spawn } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";
import {
  allocateLoopbackPort,
  terminateProcessGroup,
} from "../desktop/src/main/process/sampleWorkspaceProcess.js";

const sampleRoot = resolve("..", "sample-graph-saas");
const prismaCli = join(sampleRoot, "node_modules/prisma/build/index.js");
const seedScript = join(sampleRoot, "prisma/seed.cjs");
const foundationMigration = "20260724000000_team_data_foundation";
const legacyMigrations = [
  "20260719000000_init",
  "20260720000000_add_sample_models",
] as const;
const forced = process.env["PROJECTOS_REQUIRE_REAL_PREVIEW"] === "1";
const demoAdminCookie = "auth-token=demo-admin";
const temporaryRoots: string[] = [];
const processGroups: number[] = [];

afterEach(async () => {
  for (const processGroupId of processGroups.splice(0)) {
    await terminateProcessGroup(processGroupId, 2_000);
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("sample team data foundation", () => {
  it("fails before permanent DDL and preserves every ambiguous legacy subscription", () => {
    expect(existsSync(prismaCli)).toBe(true);
    const fixture = createDatabaseFixture(legacyMigrations);
    migrateDeploy(fixture);
    runDatabaseScript(fixture, `
      await prisma.$executeRawUnsafe(
        "INSERT INTO User (id, name, email, role, createdAt, updatedAt) VALUES ('user_1', 'Legacy Owner', 'legacy@example.com', 'admin', '2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z')",
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO Subscription (id, userId, planId, status, startDate, endDate, createdAt, updatedAt) VALUES ('subscription_1', 'user_1', 'starter', 'cancelled', '2025-02-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z')",
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO Subscription (id, userId, planId, status, startDate, endDate, createdAt, updatedAt) VALUES ('subscription_2', 'user_1', 'enterprise', 'active', '2026-01-01T00:00:00.000Z', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
      );
    `);
    installMigration(fixture, foundationMigration);

    expect(() => migrateDeploy(fixture)).toThrow();

    expect(queryDatabase(fixture, `
      const rows = await prisma.$queryRawUnsafe(
        'SELECT id, userId, planId, status, startDate, endDate, createdAt, updatedAt FROM Subscription ORDER BY id ASC',
      );
      const teamTables = await prisma.$queryRawUnsafe(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('Team', 'Membership', 'Project', 'Task', 'ActivityLog', 'FixtureState') ORDER BY name ASC",
      );
      const columns = (await prisma.$queryRawUnsafe(
        'PRAGMA table_info("Subscription")',
      )).map(({ name }) => name);
      const result = { rows, teamTables, columns };
    `)).toEqual({
      rows: [
        {
          id: "subscription_1",
          userId: "user_1",
          planId: "starter",
          status: "cancelled",
          startDate: "2025-02-01T00:00:00.000Z",
          endDate: "2025-03-01T00:00:00.000Z",
          createdAt: "2025-02-01T00:00:00.000Z",
          updatedAt: "2025-03-01T00:00:00.000Z",
        },
        {
          id: "subscription_2",
          userId: "user_1",
          planId: "enterprise",
          status: "active",
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      teamTables: [],
      columns: [
        "id",
        "userId",
        "planId",
        "status",
        "startDate",
        "endDate",
        "createdAt",
        "updatedAt",
      ],
    });
  });

  it("backfills one canonical legacy subscription and deploys repeatably", () => {
    const fixture = createDatabaseFixture(legacyMigrations);
    migrateDeploy(fixture);
    runDatabaseScript(fixture, `
      await prisma.$executeRawUnsafe(
        "INSERT INTO User (id, name, email, role, createdAt, updatedAt) VALUES ('user_1', 'Legacy Owner', 'legacy@example.com', 'admin', '2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z')",
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO Subscription (id, userId, planId, status, startDate, endDate, createdAt, updatedAt) VALUES ('subscription_1', 'user_1', 'starter', 'cancelled', '2025-02-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z')",
      );
    `);
    installMigration(fixture, foundationMigration);

    migrateDeploy(fixture);
    migrateDeploy(fixture);

    const result = queryDatabase<{
      subscription: {
        id: string;
        teamId: string;
        planId: string;
        status: string;
        startDate: string;
        endDate: string;
        createdAt: string;
        updatedAt: string;
      };
      membership: { id: string; role: string; teamId: string; userId: string };
      marker: null;
    }>(fixture, `
      const result = {
        subscription: await prisma.subscription.findUniqueOrThrow({
          where: { teamId: "team_1" },
        }),
        membership: await prisma.membership.findUniqueOrThrow({
          where: { id: "membership_1" },
          select: { id: true, role: true, teamId: true, userId: true },
        }),
        marker: await prisma.fixtureState.findUnique({
          where: { id: "sample_workspace" },
        }),
      };
    `);

    expect(result).toEqual({
      subscription: {
        id: "subscription_1",
        teamId: "team_1",
        planId: "starter",
        status: "cancelled",
        startDate: "2025-02-01T00:00:00.000Z",
        endDate: "2025-03-01T00:00:00.000Z",
        createdAt: "2025-02-01T00:00:00.000Z",
        updatedAt: "2025-03-01T00:00:00.000Z",
      },
      membership: {
        id: "membership_1",
        role: "owner",
        teamId: "team_1",
        userId: "user_1",
      },
      marker: null,
    });
  });

  it("seeds successfully after preserving a noncanonical fallback subscription", () => {
    const fixture = createDatabaseFixture(legacyMigrations);
    migrateDeploy(fixture);
    runDatabaseScript(fixture, `
      await prisma.$executeRawUnsafe(
        "INSERT INTO User (id, name, email, role, createdAt, updatedAt) VALUES ('user_1', 'Legacy Owner', 'legacy@example.com', 'admin', '2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z')",
      );
      await prisma.$executeRawUnsafe(
        "INSERT INTO Subscription (id, userId, planId, status, startDate, endDate, createdAt, updatedAt) VALUES ('subscription_2', 'user_1', 'enterprise', 'active', '2026-01-01T00:00:00.000Z', NULL, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')",
      );
    `);
    installMigration(fixture, foundationMigration);
    migrateDeploy(fixture);
    runSeed(fixture);

    expect(queryDatabase(fixture, `
      const result = {
        subscription: await prisma.subscription.findUnique({
          where: { teamId: "team_1" },
        }),
        marker: await prisma.fixtureState.findUnique({
          where: { id: "sample_workspace" },
          select: { version: true },
        }),
      };
    `)).toEqual({
      subscription: {
        id: "subscription_2",
        teamId: "team_1",
        planId: "enterprise",
        status: "active",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      marker: { version: "workspace-v2" },
    });
  });

  it("seeds a relational workspace idempotently without overwriting real edits", () => {
    const fixture = createDatabaseFixture([
      ...legacyMigrations,
      foundationMigration,
    ]);
    migrateDeploy(fixture);
    migrateDeploy(fixture);
    runSeed(fixture);
    const first = foundationSnapshot(fixture);
    runSeed(fixture);
    expect(foundationSnapshot(fixture)).toEqual(first);

    expect(first).toMatchObject({
      counts: {
        users: 12,
        teams: 1,
        memberships: 5,
        projects: 3,
        tasks: 8,
        activities: 5,
        subscriptions: 1,
      },
      membershipRoles: ["admin", "member", "member", "member", "owner"],
      marker: {
        id: "sample_workspace",
        version: "workspace-v2",
        appliedAt: "2026-07-01T09:30:00.000Z",
      },
      subscription: {
        id: "subscription_1",
        teamId: "team_1",
        planId: "pro",
        status: "active",
        startDate: "2026-07-19T00:00:00.000Z",
      },
    });

    runDatabaseScript(fixture, `
      await prisma.user.update({
        where: { id: "user_1" },
        data: { name: "Renamed Owner" },
      });
      await prisma.team.update({
        where: { id: "team_1" },
        data: { name: "Renamed Team" },
      });
      await prisma.task.update({
        where: { id: "task_1" },
        data: { title: "Changed task" },
      });
      await prisma.subscription.update({
        where: { teamId: "team_1" },
        data: { planId: "enterprise" },
      });
      await prisma.membership.update({
        where: { id: "membership_1" },
        data: { role: "member" },
      });
      await prisma.membership.update({
        where: { id: "membership_2" },
        data: { role: "owner" },
      });
      await prisma.settings.delete({ where: { id: "settings_1" } });
      await prisma.settings.create({
        data: {
          id: "settings_operator",
          userId: "user_1",
          emailNotifications: false,
          theme: "light",
        },
      });
      await prisma.post.delete({ where: { id: "post_1" } });
      await prisma.post.create({
        data: {
          id: "post_operator",
          title: "Edited welcome",
          slug: "welcome-to-projectos",
          authorId: "user_1",
        },
      });
      await prisma.user.delete({ where: { id: "user_12" } });
      await prisma.user.create({
        data: {
          id: "user_operator",
          name: "Imported teammate",
          email: "demo+12@example.com",
        },
      });
      await prisma.task.create({
        data: {
          id: "task_user_created",
          projectId: "project_1",
          title: "User-created task",
          createdById: "user_1",
        },
      });
    `);
    runSeed(fixture);

    expect(queryDatabase(fixture, `
      const result = {
        owner: await prisma.user.findUnique({
          where: { id: "user_1" },
          select: { name: true },
        }),
        team: await prisma.team.findUnique({
          where: { id: "team_1" },
          select: { name: true },
        }),
        task: await prisma.task.findUnique({
          where: { id: "task_1" },
          select: { title: true },
        }),
        plan: await prisma.subscription.findUnique({
          where: { teamId: "team_1" },
          select: { planId: true },
        }),
        taskCount: await prisma.task.count(),
        marker: await prisma.fixtureState.findUnique({
          where: { id: "sample_workspace" },
          select: { version: true },
        }),
        sessionMembership: await prisma.membership.findUnique({
          where: { id: "membership_1" },
          select: { teamId: true, userId: true, role: true },
        }),
        editedMembership: await prisma.membership.findUnique({
          where: { id: "membership_2" },
          select: { role: true },
        }),
        settings: await prisma.settings.findUnique({
          where: { userId: "user_1" },
          select: {
            id: true,
            emailNotifications: true,
            theme: true,
          },
        }),
        post: await prisma.post.findUnique({
          where: { slug: "welcome-to-projectos" },
          select: { id: true, title: true },
        }),
        importedUser: await prisma.user.findUnique({
          where: { email: "demo+12@example.com" },
          select: { id: true, name: true },
        }),
        replacedUser: await prisma.user.findUnique({
          where: { id: "user_12" },
          select: { id: true },
        }),
      };
    `)).toEqual({
      owner: { name: "Renamed Owner" },
      team: { name: "Renamed Team" },
      task: { title: "Changed task" },
      plan: { planId: "enterprise" },
      taskCount: 9,
      marker: { version: "workspace-v2" },
      sessionMembership: {
        teamId: "team_1",
        userId: "user_1",
        role: "member",
      },
      editedMembership: { role: "owner" },
      settings: {
        id: "settings_operator",
        emailNotifications: false,
        theme: "light",
      },
      post: {
        id: "post_operator",
        title: "Edited welcome",
      },
      importedUser: {
        id: "user_operator",
        name: "Imported teammate",
      },
      replacedUser: null,
    });

    runDatabaseScript(fixture, `
      await prisma.membership.delete({ where: { id: "membership_1" } });
    `);
    runSeed(fixture);
    expect(queryDatabase(fixture, `
      const result = await prisma.membership.findUnique({
        where: { id: "membership_1" },
        select: { teamId: true, userId: true, role: true },
      });
    `)).toEqual({
      teamId: "team_1",
      userId: "user_1",
      role: "owner",
    });
  });

  it("fails atomically instead of repointing an occupied membership id", () => {
    const fixture = createDatabaseFixture([
      ...legacyMigrations,
      foundationMigration,
    ]);
    migrateDeploy(fixture);
    runSeed(fixture);
    runDatabaseScript(fixture, `
      await prisma.user.delete({ where: { id: "user_12" } });
      await prisma.membership.update({
        where: { id: "membership_1" },
        data: { userId: "user_6" },
      });
      await prisma.fixtureState.update({
        where: { id: "sample_workspace" },
        data: { version: "operator-version" },
      });
    `);

    expect(() => runSeed(fixture)).toThrow(/refused to repoint membership_1/u);
    expect(queryDatabase(fixture, `
      const result = {
        occupied: await prisma.membership.findUnique({
          where: { id: "membership_1" },
          select: { teamId: true, userId: true, role: true },
        }),
        canonical: await prisma.membership.findUnique({
          where: {
            teamId_userId: {
              teamId: "team_1",
              userId: "user_1",
            },
          },
          select: { id: true },
        }),
        marker: await prisma.fixtureState.findUnique({
          where: { id: "sample_workspace" },
          select: { version: true },
        }),
        rolledBackUser: await prisma.user.findUnique({
          where: { id: "user_12" },
          select: { id: true },
        }),
      };
    `)).toEqual({
      occupied: {
        teamId: "team_1",
        userId: "user_6",
        role: "owner",
      },
      canonical: null,
      marker: { version: "operator-version" },
      rolledBackUser: null,
    });
  });

  it.runIf(forced)(
    "renders only the active team's real dashboard metrics and activity",
    async () => {
      const root = createRunnableSample();
      const fixture = {
        root,
        schemaPath: join(root, "prisma/schema.prisma"),
        databaseUrl: databaseUrl(join(root, "prisma/dev.db")),
      };
      runDatabaseScript(fixture, `
        await prisma.user.create({
          data: {
            id: "user_foreign",
            name: "Foreign Owner",
            email: "foreign@example.com",
          },
        });
        await prisma.team.create({
          data: {
            id: "team_foreign",
            name: "Foreign Workspace",
          },
        });
        await prisma.membership.create({
          data: {
            id: "membership_foreign",
            teamId: "team_foreign",
            userId: "user_foreign",
            role: "owner",
          },
        });
        await prisma.project.create({
          data: {
            id: "project_foreign",
            teamId: "team_foreign",
            name: "Foreign Project",
            createdById: "user_foreign",
          },
        });
        await prisma.task.create({
          data: {
            id: "task_foreign",
            projectId: "project_foreign",
            title: "Foreign Task",
            createdById: "user_foreign",
          },
        });
        await prisma.activityLog.create({
          data: {
            id: "activity_foreign",
            teamId: "team_foreign",
            actorId: "user_foreign",
            projectId: "project_foreign",
            taskId: "task_foreign",
            action: "created",
            entityType: "task",
            entityId: "task_foreign",
            summary: "FOREIGN_ACTIVITY_MUST_NOT_RENDER",
            createdAt: new Date("2099-01-01T00:00:00.000Z"),
          },
        });
        await prisma.activityLog.createMany({
          data: [
            {
              id: "activity_tie_a",
              teamId: "team_1",
              actorId: "user_1",
              action: "ordered",
              entityType: "team",
              entityId: "team_1",
              summary: "Tie activity A.",
              createdAt: new Date("2098-01-01T00:00:00.000Z"),
            },
            {
              id: "activity_tie_c",
              teamId: "team_1",
              actorId: "user_1",
              action: "ordered",
              entityType: "team",
              entityId: "team_1",
              summary: "Tie activity C.",
              createdAt: new Date("2098-01-01T00:00:00.000Z"),
            },
            {
              id: "activity_tie_b",
              teamId: "team_1",
              actorId: "user_1",
              action: "ordered",
              entityType: "team",
              entityId: "team_1",
              summary: "Tie activity B.",
              createdAt: new Date("2098-01-01T00:00:00.000Z"),
            },
          ],
        });
      `);
      const expected = queryDatabase<{
        members: number;
        activeProjects: number;
        tasks: number;
        allTasks: number;
      }>(fixture, `
        const result = {
          members: await prisma.membership.count({
            where: { teamId: "team_1" },
          }),
          activeProjects: await prisma.project.count({
            where: { teamId: "team_1", archivedAt: null },
          }),
          tasks: await prisma.task.count({
            where: { project: { teamId: "team_1" } },
          }),
          allTasks: await prisma.task.count(),
        };
      `);
      const origin = await startRunnableSample(root);
      const response = await fetch(new URL("/dashboard", origin));
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(expected).toEqual({
        members: 5,
        activeProjects: 2,
        tasks: 8,
        allTasks: 9,
      });
      expect(dashboardMetric(html, "Members")).toBe(expected.members);
      expect(dashboardMetric(html, "Active projects")).toBe(
        expected.activeProjects,
      );
      expect(dashboardMetric(html, "Tasks")).toBe(expected.tasks);
      expect(html).toContain(
        "Live team health, active-project momentum, and the latest operational updates for your workspace.",
      );
      expect(html).not.toContain("Live totals");
      const tieC = html.indexOf("Tie activity C.");
      const tieB = html.indexOf("Tie activity B.");
      const tieA = html.indexOf("Tie activity A.");
      expect(tieC).toBeGreaterThan(-1);
      expect(tieB).toBeGreaterThan(tieC);
      expect(tieA).toBeGreaterThan(tieB);
      expect(html).not.toContain("FOREIGN_ACTIVITY_MUST_NOT_RENDER");
      expect(html).not.toContain("Foreign Task");
    },
    60_000,
  );

  it.runIf(forced)(
    "serves a real server-owned plan selection without trusting submitted identities",
    async () => {
      const root = createRunnableSample();
      const origin = await startRunnableSample(root);
      const response = await fetch(new URL("/api/checkout", origin), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: demoAdminCookie,
        },
        body: JSON.stringify({
          planId: "starter",
          teamId: "forged_team",
          userId: "user_5",
          paymentMethod: "card",
        }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        subscriptionId: "subscription_1",
        planId: "starter",
        status: "active",
        paymentCaptured: false,
      });
      const invalidPlanResponse = await fetch(
        new URL("/api/checkout", origin),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: demoAdminCookie,
          },
          body: JSON.stringify({ planId: "unknown" }),
        },
      );
      expect(invalidPlanResponse.status).toBe(400);
      await expect(invalidPlanResponse.json()).resolves.toEqual({
        error: "invalid_plan",
      });
      const fixture = {
        root,
        schemaPath: join(root, "prisma/schema.prisma"),
        databaseUrl: databaseUrl(join(root, "prisma/dev.db")),
      };
      runDatabaseScript(fixture, `
        await prisma.membership.update({
          where: { id: "membership_1" },
          data: { role: "member" },
        });
      `);
      const forbiddenResponse = await fetch(new URL("/api/checkout", origin), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: demoAdminCookie,
        },
        body: JSON.stringify({ planId: "pro" }),
      });
      expect(forbiddenResponse.status).toBe(403);
      await expect(forbiddenResponse.json()).resolves.toEqual({
        error: "role_forbidden",
      });
      runDatabaseScript(fixture, `
        await prisma.membership.delete({ where: { id: "membership_1" } });
      `);
      const missingMembershipResponse = await fetch(
        new URL("/api/checkout", origin),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: demoAdminCookie,
          },
          body: JSON.stringify({ planId: "pro" }),
        },
      );
      expect(missingMembershipResponse.status).toBe(403);
      await expect(missingMembershipResponse.json()).resolves.toEqual({
        error: "membership_missing",
      });
      expect(queryDatabase(fixture, `
        const result = {
          subscription: await prisma.subscription.findUnique({
            where: { id: "subscription_1" },
            select: { teamId: true, planId: true, status: true },
          }),
          activity: await prisma.activityLog.findFirst({
            where: { action: "plan_selected" },
            orderBy: { createdAt: "desc" },
            select: {
              teamId: true,
              actorId: true,
              action: true,
              entityId: true,
            },
          }),
          activityCount: await prisma.activityLog.count({
            where: { action: "plan_selected" },
          }),
        };
      `)).toEqual({
        subscription: {
          teamId: "team_1",
          planId: "starter",
          status: "active",
        },
        activity: {
          teamId: "team_1",
          actorId: "user_1",
          action: "plan_selected",
          entityId: "subscription_1",
        },
        activityCount: 1,
      });
    },
    60_000,
  );
});

interface DatabaseFixture {
  root: string;
  schemaPath: string;
  databaseUrl: string;
}

function createRunnableSample(): string {
  const container = mkdtempSync(join(tmpdir(), "projectos-team-app-"));
  temporaryRoots.push(container);
  const root = join(container, "sample-graph-saas");
  cpSync(sampleRoot, root, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
    mode: constants.COPYFILE_FICLONE,
    filter: (source: string) => {
      const path = relative(sampleRoot, source).split(sep).join("/");
      return path !== "prisma/dev.db" &&
        path !== ".next" &&
        !path.startsWith(".next/") &&
        path !== ".projectos/preview-build" &&
        !path.startsWith(".projectos/preview-build/") &&
        path !== ".projectos/apply-backups" &&
        !path.startsWith(".projectos/apply-backups/");
    },
  } as Parameters<typeof cpSync>[2]);
  execFileSync(
    process.execPath,
    [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { cwd: root, env: process.env, stdio: "pipe" },
  );
  execFileSync(process.execPath, [join(root, "prisma/seed.cjs")], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  return root;
}

async function startRunnableSample(root: string): Promise<string> {
  const port = await allocateLoopbackPort();
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules/next/dist/bin/next"),
      "dev",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: root,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  if (child.pid === undefined) {
    child.kill("SIGKILL");
    throw new Error("Real sample Next process did not expose a process id");
  }
  processGroups.push(child.pid);
  let logs = "";
  const appendLog = (chunk: Buffer | string): void => {
    logs = `${logs}${chunk.toString()}`.slice(-16_384);
  };
  child.stdout?.on("data", appendLog);
  child.stderr?.on("data", appendLog);
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Real sample Next process exited during startup: ${logs}`);
    }
    try {
      const response = await fetch(new URL("/dashboard", origin));
      if (response.status === 200) return origin;
    } catch {
      // The bounded loop owns readiness; connection refusal is expected at startup.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out starting the real sample Next process: ${logs}`);
}

function createDatabaseFixture(migrations: readonly string[]): DatabaseFixture {
  const root = mkdtempSync(join(tmpdir(), "projectos-team-foundation-"));
  temporaryRoots.push(root);
  const prismaRoot = join(root, "prisma");
  const migrationRoot = join(prismaRoot, "migrations");
  mkdirSync(migrationRoot, { recursive: true });
  cpSync(
    join(sampleRoot, "prisma/schema.prisma"),
    join(prismaRoot, "schema.prisma"),
  );
  cpSync(
    join(sampleRoot, "prisma/migrations/migration_lock.toml"),
    join(migrationRoot, "migration_lock.toml"),
  );
  for (const migration of migrations) installMigration({
    root,
    schemaPath: join(prismaRoot, "schema.prisma"),
    databaseUrl: databaseUrl(join(prismaRoot, "dev.db")),
  }, migration);
  return {
    root,
    schemaPath: join(prismaRoot, "schema.prisma"),
    databaseUrl: databaseUrl(join(prismaRoot, "dev.db")),
  };
}

function installMigration(fixture: DatabaseFixture, migration: string): void {
  cpSync(
    join(sampleRoot, "prisma/migrations", migration),
    join(fixture.root, "prisma/migrations", migration),
    { recursive: true },
  );
}

function migrateDeploy(fixture: DatabaseFixture): void {
  execFileSync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", fixture.schemaPath],
    {
      cwd: fixture.root,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: "pipe",
    },
  );
}

function runSeed(fixture: DatabaseFixture): void {
  execFileSync(process.execPath, [seedScript], {
    cwd: sampleRoot,
    env: {
      ...process.env,
      PROJECTOS_TEST_DATABASE_URL: fixture.databaseUrl,
    },
    stdio: "pipe",
  });
}

function runDatabaseScript(fixture: DatabaseFixture, body: string): void {
  execFileSync(process.execPath, ["-e", databaseScript(body, false)], {
    cwd: sampleRoot,
    env: {
      ...process.env,
      PROJECTOS_TEST_DATABASE_URL: fixture.databaseUrl,
    },
    stdio: "pipe",
  });
}

function queryDatabase<T = unknown>(fixture: DatabaseFixture, body: string): T {
  const output = execFileSync(
    process.execPath,
    ["-e", databaseScript(body, true)],
    {
      cwd: sampleRoot,
      env: {
        ...process.env,
        PROJECTOS_TEST_DATABASE_URL: fixture.databaseUrl,
      },
      encoding: "utf8",
    },
  );
  return JSON.parse(output) as T;
}

function databaseScript(body: string, printResult: boolean): string {
  return `
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.PROJECTOS_TEST_DATABASE_URL } },
});
async function main() {
${body}
${printResult ? "  process.stdout.write(JSON.stringify(result));" : ""}
}
main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
`;
}

function foundationSnapshot(fixture: DatabaseFixture): unknown {
  return queryDatabase(fixture, `
    const result = {
      counts: {
        users: await prisma.user.count(),
        teams: await prisma.team.count(),
        memberships: await prisma.membership.count(),
        projects: await prisma.project.count(),
        tasks: await prisma.task.count(),
        activities: await prisma.activityLog.count(),
        subscriptions: await prisma.subscription.count(),
      },
      membershipRoles: (await prisma.membership.findMany({
        orderBy: { id: "asc" },
        select: { role: true },
      })).map(({ role }) => role).sort(),
      marker: await prisma.fixtureState.findUnique({
        where: { id: "sample_workspace" },
      }),
      subscription: await prisma.subscription.findUnique({
        where: { teamId: "team_1" },
      }),
      projects: await prisma.project.findMany({
        orderBy: { id: "asc" },
        select: { id: true, archivedAt: true },
      }),
      tasks: await prisma.task.findMany({
        orderBy: { id: "asc" },
        select: { id: true, status: true, assigneeId: true, archivedAt: true },
      }),
    };
  `);
}

function databaseUrl(path: string): string {
  return `file:${path.replaceAll("\\", "/")}`;
}

function dashboardMetric(html: string, title: string): number {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const value = new RegExp(
    `<h3\\b[^>]*>${escapedTitle}</h3>\\s*<p\\b[^>]*>([\\d,]+)</p>`,
    "u",
  ).exec(html)?.[1];
  if (!value) throw new Error(`Rendered dashboard metric '${title}' was not found`);
  return Number(value.replaceAll(",", ""));
}
