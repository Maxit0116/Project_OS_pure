import {
  constants,
  cpSync,
  mkdtempSync,
  readFileSync,
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
const forced = process.env["PROJECTOS_REQUIRE_REAL_PREVIEW"] === "1";
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

describe.runIf(forced)("sample team workspace", () => {
  it("renders only active-team members and defines open workload honestly", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.team.create({
        data: {
          id: "team_foreign_roster",
          name: "Foreign Roster",
          memberships: {
            create: {
              id: "membership_foreign_roster",
              userId: "user_6",
              role: "owner",
            },
          },
          projects: {
            create: {
              id: "project_foreign_roster",
              name: "Foreign workload",
              createdById: "user_6",
              tasks: {
                create: {
                  id: "task_foreign_roster",
                  title: "Foreign open task",
                  status: "todo",
                  createdById: "user_6",
                  assigneeId: "user_6",
                },
              },
            },
          },
        },
      });
      await prisma.task.createMany({
        data: [
          {
            id: "task_former_member",
            projectId: "project_1",
            title: "Former member handoff",
            status: "todo",
            createdById: "user_1",
            assigneeId: "user_6",
          },
          {
            id: "task_unknown_status",
            projectId: "project_1",
            title: "Unknown status sentinel",
            status: "waiting_for_magic",
            createdById: "user_1",
            assigneeId: "user_3",
          },
        ],
      });
    `);
    const origin = await startRunnableSample(root);

    const response = await fetch(new URL("/team", origin));
    expect(response.status).toBe(200);
    const html = await response.text();
    for (const email of [
      "demo@example.com",
      "demo+2@example.com",
      "demo+3@example.com",
      "demo+4@example.com",
      "demo+5@example.com",
    ]) {
      expect(html).toContain(email);
    }
    expect(html).not.toContain("demo+6@example.com");
    expect(html).not.toContain("Foreign Roster");
    expect(html).not.toContain("Foreign open task");
    expect(memberOpenTaskCount(html, "demo@example.com")).toBe(0);
    expect(memberOpenTaskCount(html, "demo+2@example.com")).toBe(0);
    expect(memberOpenTaskCount(html, "demo+3@example.com")).toBe(1);
    expect(memberOpenTaskCount(html, "demo+4@example.com")).toBe(1);
    expect(memberOpenTaskCount(html, "demo+5@example.com")).toBe(1);
    expect(unassignedOrFormerOpenTaskCount(html)).toBe(2);
    expect(html).toContain("Done, archived, unknown-status, and other-team");
    expect(html).toContain("Promote another owner before changing this role.");

    const signedOutResponse = await fetch(new URL("/team", origin), {
      headers: { cookie: "auth-token=demo-signed-out" },
      redirect: "manual",
    });
    expect(signedOutResponse.status).toBe(307);
    const signedOutLocation = signedOutResponse.headers.get("location");
    expect(signedOutLocation).not.toBeNull();
    expect(new URL(signedOutLocation!).pathname).toBe("/login");
    expect(new URL(signedOutLocation!).port).toBe(new URL(origin).port);
    expect(signedOutResponse.headers.get("x-projectos-auth-gate")).toBe(
      "unauthenticated",
    );
  }, 60_000);

  it("keeps the authenticated team route out of the production prerender cache", () => {
    const root = createRunnableSample();
    execFileSync(
      process.execPath,
      [join(root, "node_modules/next/dist/bin/next"), "build"],
      {
        cwd: root,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: "pipe",
      },
    );
    const manifest = JSON.parse(
      readFileSync(join(root, ".next/prerender-manifest.json"), "utf8"),
    ) as {
      routes?: Record<string, unknown>;
      dynamicRoutes?: Record<string, unknown>;
    };
    expect(manifest.routes).not.toHaveProperty("/team");
    expect(manifest.dynamicRoutes).not.toHaveProperty("/team");
  }, 60_000);

  it("changes roles only through live owner authority and atomic activity", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.team.create({
        data: {
          id: "team_foreign_roles",
          name: "Foreign Roles",
          memberships: {
            create: {
              id: "membership_foreign_roles",
              userId: "user_6",
              role: "owner",
            },
          },
        },
      });
    `);
    const origin = await startRunnableSample(root);
    const memberThreeForm = await readActionForm(
      origin,
      "/team",
      "Save role",
      { membershipId: "membership_3" },
    );

    const invalidRoleResponse = await submitActionForm(
      origin,
      "/team",
      memberThreeForm,
      {
        membershipId: "membership_3",
        role: "super_owner",
      },
    );
    expect(invalidRoleResponse.status).toBe(200);
    expect(await invalidRoleResponse.text()).toContain(
      "Choose owner, admin, or member.",
    );

    const foreignTargetResponse = await submitActionForm(
      origin,
      "/team",
      memberThreeForm,
      {
        membershipId: "membership_foreign_roles",
        role: "admin",
      },
    );
    const missingTargetResponse = await submitActionForm(
      origin,
      "/team",
      memberThreeForm,
      {
        membershipId: "membership_missing_roles",
        role: "admin",
      },
    );
    expect(foreignTargetResponse.status).toBe(200);
    expect(missingTargetResponse.status).toBe(200);
    const targetError = "The membership could not be found in your active team.";
    expect(await foreignTargetResponse.text()).toContain(targetError);
    expect(await missingTargetResponse.text()).toContain(targetError);

    const promotedResponse = await submitActionForm(
      origin,
      "/team",
      memberThreeForm,
      {
        membershipId: "membership_3",
        role: "admin",
        teamId: "team_foreign_roles",
        userId: "user_6",
        actorId: "user_6",
        currentRole: "owner",
      },
    );
    expect(promotedResponse.status).toBe(200);
    expect(await promotedResponse.text()).toContain("Demo User 3 is now admin.");
    expect(queryDatabase(root, `
      const result = {
        membership: await prisma.membership.findUniqueOrThrow({
          where: { id: "membership_3" },
          select: { teamId: true, userId: true, role: true },
        }),
        activity: await prisma.activityLog.findFirstOrThrow({
          where: {
            action: "membership_role_changed",
            entityId: "membership_3",
          },
          select: {
            teamId: true,
            actorId: true,
            action: true,
            entityType: true,
            entityId: true,
            summary: true,
          },
        }),
      };
    `)).toEqual({
      membership: {
        teamId: "team_1",
        userId: "user_3",
        role: "admin",
      },
      activity: {
        teamId: "team_1",
        actorId: "user_1",
        action: "membership_role_changed",
        entityType: "membership",
        entityId: "membership_3",
        summary: "Changed Demo User 3 from member to admin.",
      },
    });

    const noOpResponse = await submitActionForm(
      origin,
      "/team",
      memberThreeForm,
      {
        membershipId: "membership_3",
        role: "admin",
      },
    );
    expect(noOpResponse.status).toBe(200);
    expect(await noOpResponse.text()).toContain(
      "Demo User 3 already has that role.",
    );
    expect(roleActivityCount(root, "membership_3")).toBe(1);

    const soleOwnerResponse = await submitActionForm(
      origin,
      "/team",
      memberThreeForm,
      {
        membershipId: "membership_1",
        role: "member",
      },
    );
    expect(soleOwnerResponse.status).toBe(200);
    expect(await soleOwnerResponse.text()).toContain(
      "Promote another owner before changing the last owner.",
    );
    expect(roleActivityCount(root, "membership_1")).toBe(0);

    const memberFourForm = await readActionForm(
      origin,
      "/team",
      "Save role",
      { membershipId: "membership_4" },
    );
    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER fail_membership_activity BEFORE INSERT ON ActivityLog WHEN NEW.action = 'membership_role_changed' BEGIN SELECT RAISE(ABORT, 'activity blocked'); END",
      );
    `);
    const rolledBackResponse = await submitActionForm(
      origin,
      "/team",
      memberFourForm,
      {
        membershipId: "membership_4",
        role: "admin",
      },
    );
    expect(rolledBackResponse.status).toBe(200);
    expect(await rolledBackResponse.text()).toContain(
      "The team role could not be saved. Please try again.",
    );
    expect(queryDatabase(root, `
      const result = await prisma.membership.findUniqueOrThrow({
        where: { id: "membership_4" },
        select: { role: true },
      });
    `)).toEqual({ role: "member" });
    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_membership_activity");
    `);

    runDatabaseScript(root, `
      await prisma.membership.update({
        where: { id: "membership_1" },
        data: { role: "admin" },
      });
    `);
    const capturedOwnerFormResponse = await submitActionForm(
      origin,
      "/team",
      memberFourForm,
      {
        membershipId: "membership_4",
        role: "owner",
      },
    );
    expect(capturedOwnerFormResponse.status).toBe(200);
    expect(await capturedOwnerFormResponse.text()).toContain(
      "Only a current workspace owner can change team roles.",
    );
    runDatabaseScript(root, `
      await prisma.membership.update({
        where: { id: "membership_1" },
        data: { role: "owner" },
      });
    `);

    const memberTwoForm = await readActionForm(
      origin,
      "/team",
      "Save role",
      { membershipId: "membership_2" },
    );
    const secondOwnerResponse = await submitActionForm(
      origin,
      "/team",
      memberTwoForm,
      {
        membershipId: "membership_2",
        role: "owner",
      },
    );
    expect(secondOwnerResponse.status).toBe(200);
    expect(await secondOwnerResponse.text()).toContain(
      "Demo User 2 is now owner.",
    );
    const selfDemotionResponse = await submitActionForm(
      origin,
      "/team",
      memberTwoForm,
      {
        membershipId: "membership_1",
        role: "member",
      },
    );
    expect(selfDemotionResponse.status).toBe(200);
    expect(await selfDemotionResponse.text()).toContain(
      "Demo User is now member.",
    );
    expect(queryDatabase(root, `
      const result = {
        owners: await prisma.membership.count({
          where: { teamId: "team_1", role: "owner" },
        }),
        actorRole: (
          await prisma.membership.findUniqueOrThrow({
            where: { id: "membership_1" },
            select: { role: true },
          })
        ).role,
        activities: await prisma.activityLog.count({
          where: { action: "membership_role_changed" },
        }),
      };
    `)).toEqual({
      owners: 1,
      actorRole: "member",
      activities: 3,
    });

    const postDemotionResponse = await submitActionForm(
      origin,
      "/team",
      memberTwoForm,
      {
        membershipId: "membership_5",
        role: "admin",
      },
    );
    expect(postDemotionResponse.status).toBe(200);
    expect(await postDemotionResponse.text()).toContain(
      "Only a current workspace owner can change team roles.",
    );
  }, 90_000);

  it("serializes competing owner demotions so one owner always remains", async () => {
    const root = createRunnableSample();
    const origin = await startRunnableSample(root);
    const memberTwoForm = await readActionForm(
      origin,
      "/team",
      "Save role",
      { membershipId: "membership_2" },
    );
    const promotion = await submitActionForm(
      origin,
      "/team",
      memberTwoForm,
      {
        membershipId: "membership_2",
        role: "owner",
      },
    );
    expect(promotion.status).toBe(200);
    expect(await promotion.text()).toContain("Demo User 2 is now owner.");
    const firstOwnerForm = await readActionForm(
      origin,
      "/team",
      "Save role",
      { membershipId: "membership_1" },
    );
    const secondOwnerForm = await readActionForm(
      origin,
      "/team",
      "Save role",
      { membershipId: "membership_2" },
    );

    const responses = await Promise.all([
      submitActionForm(origin, "/team", firstOwnerForm, {
        membershipId: "membership_1",
        role: "member",
      }),
      submitActionForm(origin, "/team", secondOwnerForm, {
        membershipId: "membership_2",
        role: "member",
      }),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(bodies.filter((body) => body.includes("is now member."))).toHaveLength(1);
    expect(bodies.some((body) =>
      body.includes("Promote another owner before changing the last owner.") ||
      body.includes("Only a current workspace owner can change team roles.")
    )).toBe(true);
    expect(queryDatabase(root, `
      const result = {
        owners: await prisma.membership.count({
          where: { teamId: "team_1", role: "owner" },
        }),
        activities: await prisma.activityLog.count({
          where: { action: "membership_role_changed" },
        }),
      };
    `)).toEqual({
      owners: 1,
      activities: 2,
    });
  }, 90_000);
});

interface ActionForm {
  fields: Array<[string, string]>;
}

async function readActionForm(
  origin: string,
  path: string,
  submitLabel: string,
  expectedFields: Readonly<Record<string, string>>,
): Promise<ActionForm> {
  const response = await fetch(new URL(path, origin));
  expect(response.status).toBe(200);
  const html = await response.text();
  const escapedLabel = submitLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const forms = Array.from(html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gu))
    .map((match) => match[0])
    .filter((candidate) => new RegExp(
      `<button\\b[^>]*>${escapedLabel}</button>`,
      "u",
    ).test(candidate))
    .map((candidate) => ({
      fields: hiddenFields(candidate),
    }))
    .filter(({ fields }) => Object.entries(expectedFields).every(
      ([expectedName, expectedValue]) => fields.some(
        ([name, value]) => name === expectedName && value === expectedValue,
      ),
    ));
  if (forms.length !== 1) {
    throw new Error(
      `Action form '${submitLabel}' matched ${forms.length} forms`,
    );
  }
  const fields = forms[0]!.fields;
  const actionReferences = fields.filter(([name]) =>
    /^\$ACTION_(?:ID|REF)_/u.test(name)
  );
  if (actionReferences.length !== 1) {
    throw new Error(
      `Action form '${submitLabel}' exposed ${actionReferences.length} server references`,
    );
  }
  return { fields };
}

function hiddenFields(form: string): Array<[string, string]> {
  const fields: Array<[string, string]> = [];
  for (const input of form.matchAll(/<input\b[^>]*type="hidden"[^>]*>/gu)) {
    const name = /\bname="([^"]+)"/u.exec(input[0])?.[1];
    if (!name) continue;
    const value = /\bvalue="([^"]*)"/u.exec(input[0])?.[1] ?? "";
    fields.push([decodeHtml(name), decodeHtml(value)]);
  }
  return fields;
}

async function submitActionForm(
  origin: string,
  path: string,
  form: ActionForm,
  fields: Readonly<Record<string, string>>,
): Promise<Response> {
  const body = new FormData();
  for (const [name, value] of form.fields) body.append(name, value);
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return fetch(new URL(path, origin), {
    method: "POST",
    body,
  });
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function memberOpenTaskCount(html: string, email: string): number {
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const row = Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gu))
    .map((match) => match[0])
    .find((candidate) => new RegExp(escapedEmail, "u").test(candidate));
  if (!row) throw new Error(`Could not find team member row '${email}'`);
  const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu));
  const count = Number(cells[2]?.[1]?.replace(/<[^>]+>/gu, "").trim());
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Team member row '${email}' had invalid open task count`);
  }
  return count;
}

function unassignedOrFormerOpenTaskCount(html: string): number {
  const match = /Unassigned or former-member open tasks:[\s\S]*?<strong>(\d+)<\/strong>/u
    .exec(html);
  if (!match) throw new Error("Could not find unassigned/former workload");
  return Number(match[1]);
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
      const response = await fetch(new URL("/team", origin));
      if (response.status === 200) return origin;
    } catch {
      // The bounded loop owns readiness; connection refusal is expected at startup.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out starting the real sample Next process: ${logs}`);
}

function runDatabaseScript(root: string, body: string): void {
  execFileSync(process.execPath, ["-e", databaseScript(body, false)], {
    cwd: root,
    env: {
      ...process.env,
      PROJECTOS_TEST_DATABASE_URL: databaseUrl(root),
    },
    stdio: "pipe",
  });
}

function queryDatabase<T = unknown>(root: string, body: string): T {
  const output = execFileSync(
    process.execPath,
    ["-e", databaseScript(body, true)],
    {
      cwd: root,
      env: {
        ...process.env,
        PROJECTOS_TEST_DATABASE_URL: databaseUrl(root),
      },
      encoding: "utf8",
    },
  );
  return JSON.parse(output) as T;
}

function roleActivityCount(root: string, membershipId: string): number {
  return queryDatabase<number>(root, `
    const result = await prisma.activityLog.count({
      where: {
        action: "membership_role_changed",
        entityId: ${JSON.stringify(membershipId)},
      },
    });
  `);
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

function databaseUrl(root: string): string {
  return `file:${join(root, "prisma/dev.db").replaceAll("\\", "/")}`;
}
