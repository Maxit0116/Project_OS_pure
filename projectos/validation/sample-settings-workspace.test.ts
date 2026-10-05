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

describe.runIf(forced)("sample personal settings", () => {
  it("renders only the signed-in user's stored preferences and honest defaults", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.settings.update({
        where: { userId: "user_1" },
        data: { emailNotifications: false, theme: "light" },
      });
      await prisma.settings.create({
        data: {
          id: "settings_foreign",
          userId: "user_2",
          emailNotifications: true,
          theme: "foreign_theme_marker",
        },
      });
    `);
    const origin = await startRunnableSample(root);

    const response = await fetch(new URL("/settings", origin));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("demo@example.com");
    expect(html).not.toContain("demo+2@example.com");
    expect(html).not.toContain("foreign_theme_marker");
    expect(settingsCheckbox(html)).not.toContain("checked");
    expect(selectedTheme(html)).toBe("light");
    expect(html).not.toContain("No settings row exists yet.");

    runDatabaseScript(root, `
      await prisma.settings.update({
        where: { userId: "user_1" },
        data: { theme: "solarized" },
      });
    `);
    const unsupportedHtml = await (
      await fetch(new URL("/settings", origin))
    ).text();
    expect(unsupportedHtml).toContain("The stored theme is unsupported.");
    expect(selectedTheme(unsupportedHtml)).toBe("");

    runDatabaseScript(root, `
      await prisma.settings.delete({ where: { userId: "user_1" } });
    `);
    const defaultHtml = await (
      await fetch(new URL("/settings", origin))
    ).text();
    expect(defaultHtml).toContain("No settings row exists yet.");
    expect(settingsCheckbox(defaultHtml)).toContain("checked");
    expect(selectedTheme(defaultHtml)).toBe("dark");
    expect(queryDatabase(root, `
      const result = await prisma.settings.count({
        where: { userId: "user_1" },
      });
    `)).toBe(0);

    const signedOutResponse = await fetch(new URL("/settings", origin), {
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

  it("keeps the authenticated settings route out of the production prerender cache", () => {
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
    expect(manifest.routes).not.toHaveProperty("/settings");
    expect(manifest.dynamicRoutes).not.toHaveProperty("/settings");
  }, 60_000);

  it("owns Server Action writes by the live session and rolls back failed activity", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.settings.create({
        data: {
          id: "settings_foreign",
          userId: "user_2",
          emailNotifications: true,
          theme: "dark",
        },
      });
    `);
    const origin = await startRunnableSample(root);
    const form = await readActionForm(origin, "/settings", "Save preferences");

    const invalidTheme = await submitActionForm(origin, "/settings", form, [
      ["emailNotifications", "enabled"],
      ["theme", "solarized"],
    ]);
    expect(invalidTheme.status).toBe(200);
    expect(await invalidTheme.text()).toContain(
      "Choose the Light or Dark theme preference.",
    );

    const duplicateCheckbox = await submitActionForm(
      origin,
      "/settings",
      form,
      [
        ["emailNotifications", "enabled"],
        ["emailNotifications", "enabled"],
        ["theme", "light"],
      ],
    );
    expect(duplicateCheckbox.status).toBe(200);
    expect(await duplicateCheckbox.text()).toContain(
      "The email-notification preference is invalid.",
    );
    const duplicateTheme = await submitActionForm(
      origin,
      "/settings",
      form,
      [
        ["theme", "light"],
        ["theme", "dark"],
      ],
    );
    expect(duplicateTheme.status).toBe(200);
    expect(await duplicateTheme.text()).toContain(
      "Choose the Light or Dark theme preference.",
    );
    expect(settingsSnapshot(root)).toEqual({
      user: {
        id: "settings_1",
        emailNotifications: true,
        theme: "dark",
      },
      foreign: {
        id: "settings_foreign",
        emailNotifications: true,
        theme: "dark",
      },
      activities: [],
    });

    const forgedOwnership = await submitActionForm(
      origin,
      "/settings",
      form,
      [
        ["theme", "light"],
        ["userId", "user_2"],
        ["teamId", "team_foreign"],
        ["settingsId", "settings_foreign"],
        ["actorId", "user_2"],
        ["updatedAt", "2040-01-01T00:00:00.000Z"],
      ],
    );
    expect(forgedOwnership.status).toBe(200);
    expect(await forgedOwnership.text()).toContain(
      "Personal preferences saved.",
    );
    expect(settingsSnapshot(root)).toEqual({
      user: {
        id: "settings_1",
        emailNotifications: false,
        theme: "light",
      },
      foreign: {
        id: "settings_foreign",
        emailNotifications: true,
        theme: "dark",
      },
      activities: [
        {
          teamId: "team_1",
          actorId: "user_1",
          action: "settings_updated",
          entityType: "settings",
          entityId: "settings_1",
          summary: "Updated personal notification and theme preferences.",
        },
      ],
    });

    const noOp = await submitActionForm(origin, "/settings", form, [
      ["theme", "light"],
    ]);
    expect(noOp.status).toBe(200);
    expect(await noOp.text()).toContain(
      "Personal preferences were already up to date.",
    );
    expect(settingsActivityCount(root)).toBe(1);

    runDatabaseScript(root, `
      await prisma.membership.delete({ where: { id: "membership_1" } });
    `);
    const removedMember = await submitActionForm(origin, "/settings", form, [
      ["emailNotifications", "enabled"],
      ["theme", "dark"],
    ]);
    expect(removedMember.status).toBe(200);
    expect(await removedMember.text()).toContain(
      "Your workspace access could not be verified.",
    );
    expect(settingsSnapshot(root).user).toEqual({
      id: "settings_1",
      emailNotifications: false,
      theme: "light",
    });
    runDatabaseScript(root, `
      await prisma.membership.create({
        data: {
          id: "membership_1",
          teamId: "team_1",
          userId: "user_1",
          role: "member",
          joinedAt: new Date("2026-07-01T09:00:00.000Z"),
          updatedAt: new Date("2026-07-01T09:00:00.000Z"),
        },
      });
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER fail_settings_activity BEFORE INSERT ON ActivityLog WHEN NEW.action = 'settings_updated' BEGIN SELECT RAISE(ABORT, 'activity blocked'); END",
      );
    `);
    const rolledBackUpdate = await submitActionForm(
      origin,
      "/settings",
      form,
      [
        ["emailNotifications", "enabled"],
        ["theme", "dark"],
      ],
    );
    expect(rolledBackUpdate.status).toBe(200);
    expect(await rolledBackUpdate.text()).toContain(
      "Personal preferences could not be saved. Please try again.",
    );
    expect(settingsSnapshot(root).user).toEqual({
      id: "settings_1",
      emailNotifications: false,
      theme: "light",
    });

    runDatabaseScript(root, `
      await prisma.settings.delete({ where: { userId: "user_1" } });
    `);
    const rolledBackCreate = await submitActionForm(
      origin,
      "/settings",
      form,
      [
        ["emailNotifications", "enabled"],
        ["theme", "dark"],
      ],
    );
    expect(rolledBackCreate.status).toBe(200);
    expect(await rolledBackCreate.text()).toContain(
      "Personal preferences could not be saved. Please try again.",
    );
    expect(queryDatabase(root, `
      const result = await prisma.settings.count({
        where: { userId: "user_1" },
      });
    `)).toBe(0);

    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_settings_activity");
    `);
    const created = await submitActionForm(origin, "/settings", form, [
      ["emailNotifications", "enabled"],
      ["theme", "dark"],
    ]);
    expect(created.status).toBe(200);
    expect(await created.text()).toContain("Personal preferences saved.");
    const createdSnapshot = settingsSnapshot(root);
    expect(createdSnapshot.user).toMatchObject({
      emailNotifications: true,
      theme: "dark",
    });
    expect(createdSnapshot.user?.id).not.toBe("settings_foreign");
    expect(createdSnapshot.activities).toHaveLength(2);
    expect(createdSnapshot.activities[1]).toMatchObject({
      teamId: "team_1",
      actorId: "user_1",
      action: "settings_updated",
      entityType: "settings",
      entityId: createdSnapshot.user?.id,
    });
  }, 90_000);

  it("serializes competing complete preference pairs without mixed state", async () => {
    const root = createRunnableSample();
    const origin = await startRunnableSample(root);
    const form = await readActionForm(origin, "/settings", "Save preferences");

    const responses = await Promise.all([
      submitActionForm(origin, "/settings", form, [
        ["emailNotifications", "enabled"],
        ["theme", "light"],
      ]),
      submitActionForm(origin, "/settings", form, [
        ["theme", "dark"],
      ]),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    expect(bodies.every((body) =>
      body.includes("Personal preferences saved.")
    )).toBe(true);

    const snapshot = settingsSnapshot(root);
    expect([
      { emailNotifications: true, theme: "light" },
      { emailNotifications: false, theme: "dark" },
    ]).toContainEqual({
      emailNotifications: snapshot.user?.emailNotifications,
      theme: snapshot.user?.theme,
    });
    expect(snapshot.activities).toHaveLength(2);
  }, 90_000);

  it("keeps the compatibility API sanitized and on the shared write authority", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.settings.create({
        data: {
          id: "settings_foreign",
          userId: "user_2",
          emailNotifications: true,
          theme: "dark",
        },
      });
    `);
    const origin = await startRunnableSample(root);

    expect((await fetch(new URL("/api/settings", origin))).status).toBe(401);
    expect((await fetch(new URL("/api/settings", origin), {
      headers: { authorization: "Bearer wrong-token" },
    })).status).toBe(401);

    const getResponse = await fetch(new URL("/api/settings", origin), {
      headers: settingsApiHeaders(),
    });
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toEqual({
      emailNotifications: true,
      theme: "dark",
      themeSupported: true,
      persisted: true,
      updatedAt: "2026-07-01T10:00:00.000Z",
    });

    const missingDemoSession = await fetch(new URL("/api/settings", origin), {
      method: "PUT",
      headers: settingsApiHeaders("application/json"),
      body: JSON.stringify({
        emailNotifications: false,
        theme: "light",
      }),
    });
    expect(missingDemoSession.status).toBe(401);
    const wrongDemoSession = await fetch(new URL("/api/settings", origin), {
      method: "PUT",
      headers: {
        ...settingsApiHeaders("application/json"),
        cookie: "auth-token=demo-user",
      },
      body: JSON.stringify({
        emailNotifications: false,
        theme: "light",
      }),
    });
    expect(wrongDemoSession.status).toBe(401);
    const duplicateDemoSession = await fetch(new URL("/api/settings", origin), {
      method: "PUT",
      headers: {
        ...settingsApiHeaders("application/json"),
        cookie: "auth-token=demo-admin; auth-token=demo-admin",
      },
      body: JSON.stringify({
        emailNotifications: false,
        theme: "light",
      }),
    });
    expect(duplicateDemoSession.status).toBe(401);
    const wrongBearerSession = await fetch(new URL("/api/settings", origin), {
      method: "PUT",
      headers: {
        authorization: "Bearer wrong-token",
        "content-type": "application/json",
        cookie: demoAdminCookie,
      },
      body: JSON.stringify({
        emailNotifications: false,
        theme: "light",
      }),
    });
    expect(wrongBearerSession.status).toBe(401);

    for (const contentType of [undefined, "text/plain", "application/jsonp"]) {
      const unsupportedMediaType = await fetch(
        new URL("/api/settings", origin),
        {
          method: "PUT",
          headers: {
            ...settingsApiHeaders(contentType),
            cookie: demoAdminCookie,
          },
          body: JSON.stringify({
            emailNotifications: true,
            theme: "dark",
          }),
        },
      );
      expect(unsupportedMediaType.status).toBe(415);
      expect(await unsupportedMediaType.json()).toEqual({
        error: "unsupported_media_type",
      });
    }
    const parameterizedJson = await fetch(new URL("/api/settings", origin), {
      method: "PUT",
      headers: {
        ...settingsApiHeaders("application/json; charset=utf-8"),
        cookie: demoAdminCookie,
      },
      body: JSON.stringify({
        emailNotifications: true,
        theme: "dark",
      }),
    });
    expect(parameterizedJson.status).toBe(200);
    expect((await parameterizedJson.json()).changed).toBe(false);

    const malformed = await fetch(new URL("/api/settings", origin), {
      method: "PUT",
      headers: settingsMutationHeaders(),
      body: "{",
    });
    expect(malformed.status).toBe(400);
    const massAssignment = await putSettings(origin, {
      emailNotifications: false,
      theme: "light",
      userId: "user_2",
      id: "settings_foreign",
      actorId: "user_2",
    });
    expect(massAssignment.status).toBe(400);
    const invalidTheme = await putSettings(origin, {
      emailNotifications: false,
      theme: "solarized",
    });
    expect(invalidTheme.status).toBe(400);
    expect(settingsActivityCount(root)).toBe(0);

    const updated = await putSettings(origin, {
      emailNotifications: false,
      theme: "light",
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({
      emailNotifications: false,
      theme: "light",
      changed: true,
    });
    expect(settingsSnapshot(root)).toEqual({
      user: {
        id: "settings_1",
        emailNotifications: false,
        theme: "light",
      },
      foreign: {
        id: "settings_foreign",
        emailNotifications: true,
        theme: "dark",
      },
      activities: [
        {
          teamId: "team_1",
          actorId: "user_1",
          action: "settings_updated",
          entityType: "settings",
          entityId: "settings_1",
          summary: "Updated personal notification and theme preferences.",
        },
      ],
    });

    const noOp = await putSettings(origin, {
      emailNotifications: false,
      theme: "light",
    });
    expect(noOp.status).toBe(200);
    expect((await noOp.json()).changed).toBe(false);
    expect(settingsActivityCount(root)).toBe(1);

    runDatabaseScript(root, `
      await prisma.membership.delete({ where: { id: "membership_1" } });
    `);
    const removedMember = await putSettings(origin, {
      emailNotifications: true,
      theme: "dark",
    });
    expect(removedMember.status).toBe(403);
    expect(settingsSnapshot(root).user).toEqual({
      id: "settings_1",
      emailNotifications: false,
      theme: "light",
    });
  }, 90_000);
});

interface ActionForm {
  fields: Array<[string, string]>;
}

interface SettingsSnapshot {
  user: {
    id: string;
    emailNotifications: boolean;
    theme: string;
  } | null;
  foreign: {
    id: string;
    emailNotifications: boolean;
    theme: string;
  } | null;
  activities: Array<{
    teamId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
  }>;
}

async function readActionForm(
  origin: string,
  path: string,
  submitLabel: string,
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
    }));
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
  fields: ReadonlyArray<readonly [string, string]>,
): Promise<Response> {
  const body = new FormData();
  for (const [name, value] of form.fields) body.append(name, value);
  for (const [name, value] of fields) body.append(name, value);
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

function settingsCheckbox(html: string): string {
  const input = Array.from(html.matchAll(/<input\b[^>]*>/gu))
    .map((match) => match[0])
    .find((candidate) => /\bname="emailNotifications"/u.test(candidate));
  if (!input) throw new Error("Could not find settings notification checkbox");
  return input;
}

function selectedTheme(html: string): string {
  const option = Array.from(html.matchAll(/<option\b[^>]*>/gu))
    .map((match) => match[0])
    .find((candidate) => /\bselected(?:=""|(?=[ >]))/u.test(candidate));
  if (!option) throw new Error("Could not find selected theme option");
  return /\bvalue="([^"]*)"/u.exec(option)?.[1] ?? "";
}

function settingsApiHeaders(contentType?: string): Record<string, string> {
  return {
    authorization: "Bearer mock-token",
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

function settingsMutationHeaders(): Record<string, string> {
  return {
    ...settingsApiHeaders("application/json"),
    cookie: demoAdminCookie,
  };
}

function putSettings(
  origin: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(new URL("/api/settings", origin), {
    method: "PUT",
    headers: settingsMutationHeaders(),
    body: JSON.stringify(body),
  });
}

function settingsSnapshot(root: string): SettingsSnapshot {
  return queryDatabase(root, `
    const result = {
      user: await prisma.settings.findUnique({
        where: { userId: "user_1" },
        select: { id: true, emailNotifications: true, theme: true },
      }),
      foreign: await prisma.settings.findUnique({
        where: { userId: "user_2" },
        select: { id: true, emailNotifications: true, theme: true },
      }),
      activities: await prisma.activityLog.findMany({
        where: { action: "settings_updated" },
        orderBy: { createdAt: "asc" },
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
  `);
}

function settingsActivityCount(root: string): number {
  return queryDatabase(root, `
    const result = await prisma.activityLog.count({
      where: { action: "settings_updated" },
    });
  `);
}

function createRunnableSample(): string {
  const container = mkdtempSync(join(tmpdir(), "projectos-settings-app-"));
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
      const response = await fetch(new URL("/settings", origin));
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
