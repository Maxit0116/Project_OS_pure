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

describe.runIf(forced)("sample honesty closeout", () => {
  it("exposes fixed demo access while refusing legacy writes and unsafe reads", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.post.createMany({
        data: Array.from({ length: 12 }, (_, index) => ({
          id: \`post_audit_\${index + 1}\`,
          title: \`Audit match \${index + 1}\`,
          slug: \`audit-match-\${index + 1}\`,
          excerpt: \`Bounded result \${index + 1}\`,
          content: \`PRIVATE_SEARCH_BODY_\${index + 1}\`,
          authorId: "user_1",
          createdAt: new Date(
            \`2026-07-\${String(index + 2).padStart(2, "0")}T10:00:00.000Z\`,
          ),
          updatedAt: new Date(
            \`2026-07-\${String(index + 2).padStart(2, "0")}T10:00:00.000Z\`,
          ),
        })),
      });
    `);
    const origin = await startRunnableSample(root);

    const loginResponse = await fetch(new URL("/login", origin), {
      headers: { cookie: "auth-token=demo-signed-out" },
    });
    expect(loginResponse.status).toBe(200);
    const loginHtml = await loginResponse.text();
    expect(loginHtml).toContain("Demo access");
    expect(loginHtml).toContain(
      "no production authentication or stored passwords",
    );
    expect(loginHtml).toContain("Enter demo workspace");

    const credentialAttempt = await fetch(new URL("/api/auth", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "demo@example.com",
        password: "not-a-real-password",
      }),
    });
    expect(credentialAttempt.status).toBe(400);
    expect(await credentialAttempt.json()).toEqual({
      error: "invalid_demo_request",
    });

    const demoEntry = await fetch(new URL("/api/auth", origin), {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ mode: "fixed-demo" }),
    });
    expect(demoEntry.status).toBe(200);
    expect(await demoEntry.json()).toMatchObject({
      mode: "fixed-demo",
      user: {
        id: "user_1",
        email: "demo@example.com",
        role: "admin",
      },
    });
    const demoCookie = demoEntry.headers.get("set-cookie");
    expect(demoCookie).toMatch(/auth-token=demo-admin/iu);
    expect(demoCookie).toMatch(/httponly/iu);
    expect(demoCookie).toMatch(/samesite=lax/iu);

    const logout = await fetch(new URL("/api/auth", origin), {
      method: "DELETE",
    });
    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ mode: "signed-out" });
    expect(logout.headers.get("set-cookie")).toMatch(
      /auth-token=demo-signed-out/iu,
    );

    const signedOutDashboard = await fetch(new URL("/dashboard", origin), {
      headers: { cookie: "auth-token=demo-signed-out" },
      redirect: "manual",
    });
    expect(signedOutDashboard.status).toBe(307);
    expect(
      new URL(signedOutDashboard.headers.get("location")!).pathname,
    ).toBe("/login");
    expect(signedOutDashboard.headers.get("x-projectos-auth-gate")).toBe(
      "unauthenticated",
    );

    const wrongBearer = await fetch(new URL("/api/users", origin), {
      headers: { authorization: "Bearer attacker-selected-token" },
    });
    expect(wrongBearer.status).toBe(401);
    const signedOutUsers = await fetch(new URL("/api/users", origin), {
      headers: {
        authorization: "Bearer mock-token",
        cookie: "auth-token=demo-signed-out",
      },
    });
    expect(signedOutUsers.status).toBe(401);
    const downgradedUsers = await fetch(new URL("/api/users", origin), {
      headers: {
        authorization: "Bearer mock-token",
        cookie: "auth-token=demo-user",
      },
    });
    expect(downgradedUsers.status).toBe(401);
    const unknownSessionUsers = await fetch(new URL("/api/users", origin), {
      headers: {
        authorization: "Bearer mock-token",
        cookie: "auth-token=attacker-selected-session",
      },
    });
    expect(unknownSessionUsers.status).toBe(401);
    const usersResponse = await fetch(new URL("/api/users", origin), {
      headers: { authorization: "Bearer mock-token" },
    });
    expect(usersResponse.status).toBe(200);
    const users = await usersResponse.json() as Array<Record<string, unknown>>;
    expect(users).toHaveLength(5);
    for (const user of users) {
      expect(Object.keys(user).sort()).toEqual(["id", "name"]);
    }
    expect(JSON.stringify(users)).not.toContain("@example.com");

    const countsBefore = databaseCounts(root);
    const createUser = await fetch(new URL("/api/users", origin), {
      method: "POST",
      headers: {
        authorization: "Bearer mock-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "attacker_user",
        email: "attacker@example.com",
        role: "admin",
      }),
    });
    const createPost = await fetch(new URL("/api/posts", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "attacker_post",
        title: "Injected",
        content: "Injected private body",
        authorId: "user_1",
      }),
    });
    expect(createUser.status).toBe(405);
    expect(createPost.status).toBe(405);
    expect(databaseCounts(root)).toEqual(countsBefore);

    const shortSearch = await (
      await fetch(new URL("/api/search?q=A", origin))
    ).json();
    expect(shortSearch).toEqual({ posts: [] });
    const searchResponse = await fetch(new URL("/api/search?q=Audit", origin));
    expect(searchResponse.status).toBe(200);
    const search = await searchResponse.json() as {
      posts: Array<Record<string, unknown>>;
    };
    expect(search.posts).toHaveLength(10);
    for (const post of search.posts) {
      expect(Object.keys(post).sort()).toEqual([
        "createdAt",
        "excerpt",
        "id",
        "slug",
        "title",
      ]);
    }
    const serializedSearch = JSON.stringify(search);
    expect(serializedSearch).not.toContain("PRIVATE_SEARCH_BODY");
    expect(serializedSearch).not.toContain("authorId");
    expect(serializedSearch).not.toContain("demo@example.com");
  }, 120_000);

  it("owns notification reads and updates by the server session", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.notification.createMany({
        data: [
          {
            id: "notification_own_audit",
            userId: "user_1",
            message: "Own audit notification",
            read: false,
            createdAt: new Date("2026-07-02T10:00:00.000Z"),
          },
          {
            id: "notification_foreign_audit",
            userId: "user_2",
            message: "FOREIGN_NOTIFICATION_MUST_NOT_RENDER",
            read: false,
            createdAt: new Date("2026-07-03T10:00:00.000Z"),
          },
        ],
      });
    `);
    const origin = await startRunnableSample(root);

    const response = await fetch(new URL("/api/notifications", origin));
    expect(response.status).toBe(200);
    const notifications = await response.json() as Array<
      Record<string, unknown>
    >;
    expect(notifications.map((notification) => notification["id"])).toEqual([
      "notification_own_audit",
      "notification_1",
    ]);
    for (const notification of notifications) {
      expect(Object.keys(notification).sort()).toEqual([
        "createdAt",
        "id",
        "message",
        "read",
      ]);
    }
    expect(JSON.stringify(notifications)).not.toContain(
      "FOREIGN_NOTIFICATION_MUST_NOT_RENDER",
    );

    const signedOutRead = await fetch(
      new URL("/api/notifications", origin),
      { headers: { cookie: "auth-token=demo-signed-out" } },
    );
    expect(signedOutRead.status).toBe(401);
    const signedOutUpdate = await fetch(
      new URL("/api/notifications", origin),
      {
        method: "PATCH",
        headers: { cookie: "auth-token=demo-signed-out" },
      },
    );
    expect(signedOutUpdate.status).toBe(401);
    for (const cookie of [
      "auth-token=demo-user",
      "auth-token=attacker-selected-session",
    ]) {
      const deniedRead = await fetch(
        new URL("/api/notifications", origin),
        { headers: { cookie } },
      );
      expect(deniedRead.status).toBe(401);
      const deniedUpdate = await fetch(
        new URL("/api/notifications", origin),
        { method: "PATCH", headers: { cookie } },
      );
      expect(deniedUpdate.status).toBe(401);
    }
    expect(notificationReadState(root)).toEqual({
      ownUnread: 2,
      foreignUnread: 1,
    });

    const update = await fetch(new URL("/api/notifications", origin), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user_2",
        notificationId: "notification_foreign_audit",
      }),
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ updatedCount: 2 });
    expect(notificationReadState(root)).toEqual({
      ownUnread: 0,
      foreignUnread: 1,
    });

    runDatabaseScript(root, `
      await prisma.membership.delete({ where: { id: "membership_1" } });
    `);
    const missingMembership = await fetch(
      new URL("/api/notifications", origin),
    );
    expect(missingMembership.status).toBe(403);
    expect(await missingMembership.json()).toEqual({
      error: "Workspace access could not be verified.",
    });
    expect(notificationReadState(root).foreignUnread).toBe(1);
  }, 120_000);

  it("renders measured admin data and labels compatibility surfaces honestly", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.team.create({
        data: {
          id: "team_admin_audit",
          name: "Admin audit team",
          subscription: {
            create: {
              id: "subscription_admin_audit",
              planId: "unsupported_audit_plan",
              status: "active",
              startDate: new Date("2026-07-20T00:00:00.000Z"),
            },
          },
        },
      });
      await prisma.post.create({
        data: {
          id: "post_admin_audit",
          title: "Admin audit post",
          slug: "admin-audit-post",
          excerpt: "Makes the measured post count observable.",
          content: "Stored post body.",
          authorId: "user_1",
          createdAt: new Date("2026-07-23T10:00:00.000Z"),
          updatedAt: new Date("2026-07-23T10:00:00.000Z"),
        },
      });
    `);
    const origin = await startRunnableSample(root);

    const overviewResponse = await fetch(new URL("/admin", origin));
    expect(overviewResponse.status).toBe(200);
    const overview = await overviewResponse.text();
    expect(overview).toMatch(/Users<\/h3><p>12<\/p>/u);
    expect(overview).toMatch(/Active plan selections<\/h3><p>2<\/p>/u);
    expect(overview).toMatch(/Posts<\/h3><p>2<\/p>/u);
    expect(overview).toContain(
      "not paid subscriptions or recognized revenue",
    );
    expect(overview).not.toContain("45200");

    const analytics = await (
      await fetch(new URL("/admin/analytics", origin))
    ).text();
    expect(analytics).toMatch(/<dt>Users<\/dt><dd>12<\/dd>/u);
    expect(analytics).toMatch(/<dt>Posts<\/dt><dd>2<\/dd>/u);
    expect(analytics).toMatch(
      /<dt>Active plan selections<\/dt><dd>2<\/dd>/u,
    );
    expect(analytics).toMatch(
      /<dt>Selected catalog monthly value<\/dt><dd>\$(?:<!-- -->)?29<\/dd>/u,
    );
    expect(analytics).toMatch(
      /<dt>Unsupported active plan IDs<\/dt><dd>1<\/dd>/u,
    );
    expect(analytics).toContain("It is not revenue");
    expect(analytics).not.toContain("45200");
    expect(analytics).not.toContain("<canvas");

    const subscriptionBefore = subscriptionSnapshot(root);
    const signedOutCheckout = await fetch(
      new URL("/api/checkout", origin),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "auth-token=demo-signed-out",
        },
        body: JSON.stringify({ planId: "starter" }),
      },
    );
    expect(signedOutCheckout.status).toBe(401);
    expect(subscriptionSnapshot(root)).toEqual(subscriptionBefore);
    const signedOutSettings = await fetch(
      new URL("/api/settings", origin),
      {
        headers: {
          authorization: "Bearer mock-token",
          cookie: "auth-token=demo-signed-out",
        },
      },
    );
    expect(signedOutSettings.status).toBe(401);

    const checkout = await (
      await fetch(new URL("/checkout?plan=unknown-audit-plan", origin))
    ).text();
    expect(checkout).toContain(
      "The requested plan is not in the static catalog",
    );
    expect(checkout).toContain(
      "without changing the stored workspace selection",
    );
    expect(checkout).toContain("Starter");
    expect(subscriptionSnapshot(root)).toEqual(subscriptionBefore);

    const dashboard = await (
      await fetch(new URL("/dashboard", origin))
    ).text();
    expect(dashboard).toContain("<h2>Workspace</h2>");
    expect(dashboard).toContain('href="/billing"');

    const profile = await (
      await fetch(new URL("/profile", origin))
    ).text();
    expect(profile).toContain("Database-backed identity details");
    expect(profile).toContain("compatibility page is read-only");
    expect(profile).toContain('href="/settings"');

    const contact = await (
      await fetch(new URL("/contact", origin))
    ).text();
    expect(contact).toContain("Contact delivery is not configured");
    expect(contact).toContain("No message");

    const shortSearch = await (
      await fetch(new URL("/search?q=x", origin))
    ).text();
    expect(shortSearch).toContain(
      "Enter at least two characters to search public posts",
    );

    runDatabaseScript(root, "  await prisma.post.deleteMany();");
    const emptyBlog = await (
      await fetch(new URL("/blog?state=empty", origin))
    ).text();
    expect(emptyBlog).toContain(
      "No posts have been published in the sample database.",
    );
  }, 120_000);

  it("keeps admin loading and error fallbacks explicit and non-sensitive", () => {
    const errorSource = readFileSync(
      join(sampleRoot, "app/admin/error.tsx"),
      "utf8",
    );
    const loadingSource = readFileSync(
      join(sampleRoot, "app/admin/loading.tsx"),
      "utf8",
    );
    const notificationSource = readFileSync(
      join(sampleRoot, "components/NotificationList.tsx"),
      "utf8",
    );
    const searchSource = readFileSync(
      join(sampleRoot, "components/SearchResults.tsx"),
      "utf8",
    );

    expect(errorSource).toContain("Something went wrong");
    expect(errorSource).toContain("Try again");
    expect(errorSource).not.toContain("error.message");
    expect(errorSource).not.toContain("error.stack");
    expect(loadingSource).toContain('aria-busy="true"');
    expect(loadingSource).toContain("Reading the sample database");
    expect(notificationSource).toContain("Loading notifications");
    expect(notificationSource).toContain("Notifications could not be loaded");
    expect(notificationSource).toContain("No notifications are stored");
    expect(searchSource).toContain(
      "setState({ status: 'loading', posts: [] })",
    );
  });
});

function createRunnableSample(): string {
  const container = mkdtempSync(join(tmpdir(), "projectos-honesty-app-"));
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
      const response = await fetch(new URL("/api/auth", origin));
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

function databaseCounts(root: string) {
  return queryDatabase<{ users: number; posts: number }>(root, `
    const result = {
      users: await prisma.user.count(),
      posts: await prisma.post.count(),
    };
  `);
}

function notificationReadState(root: string) {
  return queryDatabase<{ ownUnread: number; foreignUnread: number }>(root, `
    const result = {
      ownUnread: await prisma.notification.count({
        where: { userId: "user_1", read: false },
      }),
      foreignUnread: await prisma.notification.count({
        where: { userId: "user_2", read: false },
      }),
    };
  `);
}

function subscriptionSnapshot(root: string) {
  return queryDatabase(root, `
    const result = await prisma.subscription.findUnique({
      where: { teamId: "team_1" },
      select: {
        id: true,
        planId: true,
        status: true,
        startDate: true,
        endDate: true,
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
