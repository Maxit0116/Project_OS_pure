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

describe.runIf(forced)("sample team billing workspace", () => {
  it("renders only the active team's stored state and states the demo limits", async () => {
    const root = createRunnableSample();
    createForeignSubscription(root);
    const origin = await startRunnableSample(root);

    const response = await fetch(new URL("/billing", origin));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Northstar Studio");
    expect(html).toContain("Billing and subscription");
    expect(html).toContain("Pro");
    expect(html).toContain(">active<");
    expect(html).toContain("7/19/2026");
    expect(html).toContain("no payment");
    expect(html).toContain("static catalog copy only");
    expect(html).toContain("not enforced or");
    expect(html).not.toContain("FOREIGN_BILLING_TEAM");
    expect(html).not.toContain("FOREIGN_PLAN_MUST_NOT_RENDER");

    runDatabaseScript(root, `
      await prisma.subscription.update({
        where: { teamId: "team_1" },
        data: {
          planId: "unsupported_plan_marker",
          status: "paused_by_external_system",
          endDate: null,
        },
      });
    `);
    const unsupportedHtml = await (
      await fetch(new URL("/billing", origin))
    ).text();
    expect(unsupportedHtml).toContain(
      "Unsupported stored plan (unsupported_plan_marker)",
    );
    expect(unsupportedHtml).toContain(
      "Unsupported stored status (paused_by_external_system)",
    );

    runDatabaseScript(root, `
      await prisma.subscription.update({
        where: { teamId: "team_1" },
        data: {
          planId: "pro",
          status: "active",
          endDate: new Date("2026-07-24T00:00:00.000Z"),
        },
      });
    `);
    const activeWithEndHtml = await (
      await fetch(new URL("/billing", origin))
    ).text();
    expectUnsupportedStoredState(activeWithEndHtml, "active");

    runDatabaseScript(root, `
      await prisma.subscription.update({
        where: { teamId: "team_1" },
        data: {
          status: "cancelled",
          endDate: null,
        },
      });
    `);
    const cancelledWithoutEndHtml = await (
      await fetch(new URL("/billing", origin))
    ).text();
    expectUnsupportedStoredState(cancelledWithoutEndHtml, "cancelled");

    runDatabaseScript(root, `
      await prisma.subscription.delete({ where: { teamId: "team_1" } });
    `);
    const emptyHtml = await (
      await fetch(new URL("/billing", origin))
    ).text();
    expect(emptyHtml).toContain(
      "No subscription selection is stored for this workspace.",
    );
    expect(queryDatabase(root, `
      const result = await prisma.subscription.count({
        where: { teamId: "team_1" },
      });
    `)).toBe(0);

    runDatabaseScript(root, `
      await prisma.subscription.create({
        data: {
          id: "subscription_read_only",
          teamId: "team_1",
          planId: "starter",
          status: "active",
          startDate: new Date("2026-07-23T00:00:00.000Z"),
        },
      });
      await prisma.membership.update({
        where: { id: "membership_1" },
        data: { role: "member" },
      });
    `);
    const readOnlyHtml = await (
      await fetch(new URL("/billing", origin))
    ).text();
    expect(readOnlyHtml).toContain(
      "Billing is read-only unless you are a current workspace owner or admin.",
    );
    expect(readOnlyHtml).not.toContain('name="planId"');
    expect(readOnlyHtml).not.toContain("Cancel subscription selection");

    const signedOutResponse = await fetch(new URL("/billing", origin), {
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

  it("keeps the authenticated billing route out of the production prerender cache", () => {
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
    expect(manifest.routes).not.toHaveProperty("/billing");
    expect(manifest.dynamicRoutes).not.toHaveProperty("/billing");
  }, 60_000);

  it("owns lifecycle actions by the live session and keeps activity atomic", async () => {
    const root = createRunnableSample();
    createForeignSubscription(root);
    const origin = await startRunnableSample(root);
    const starterForm = await readActionForm(
      origin,
      "/billing",
      "Select plan",
      { planId: "starter" },
    );
    const proForm = await readActionForm(
      origin,
      "/billing",
      "Confirm current plan",
      { planId: "pro" },
    );
    const enterpriseForm = await readActionForm(
      origin,
      "/billing",
      "Select plan",
      { planId: "enterprise" },
    );
    const cancelForm = await readActionForm(
      origin,
      "/billing",
      "Cancel subscription selection",
    );

    const missingPlan = await submitActionForm(
      origin,
      "/billing",
      withoutField(starterForm, "planId"),
      [],
    );
    expect(await missingPlan.text()).toContain("Choose a supported plan.");
    const duplicatePlan = await submitActionForm(
      origin,
      "/billing",
      starterForm,
      [["planId", "enterprise"]],
    );
    expect(await duplicatePlan.text()).toContain("Choose a supported plan.");
    const unknownPlan = await submitActionForm(
      origin,
      "/billing",
      withoutField(starterForm, "planId"),
      [["planId", "unknown_plan"]],
    );
    expect(await unknownPlan.text()).toContain("Choose a supported plan.");
    expect(subscriptionSnapshot(root)).toMatchObject({
      current: { id: "subscription_1", planId: "pro", status: "active" },
      activities: [],
    });

    const selected = await submitActionForm(
      origin,
      "/billing",
      starterForm,
      [
        ["teamId", "team_foreign_billing"],
        ["userId", "user_6"],
        ["actorId", "user_6"],
        ["subscriptionId", "subscription_foreign_billing"],
        ["status", "cancelled"],
        ["price", "0"],
        ["paymentCaptured", "true"],
        ["startDate", "2040-01-01T00:00:00.000Z"],
        ["endDate", "2040-01-01T00:00:00.000Z"],
      ],
    );
    expect(selected.status).toBe(200);
    expect(await selected.text()).toContain(
      "The plan selection was saved. No payment was processed.",
    );
    const selectedSnapshot = subscriptionSnapshot(root);
    expect(selectedSnapshot.current).toMatchObject({
      id: "subscription_1",
      teamId: "team_1",
      planId: "starter",
      status: "active",
      endDate: null,
    });
    expect(selectedSnapshot.foreign).toMatchObject({
      id: "subscription_foreign_billing",
      teamId: "team_foreign_billing",
      planId: "FOREIGN_PLAN_MUST_NOT_RENDER",
      status: "active",
    });
    expect(selectedSnapshot.activities).toEqual([
      {
        teamId: "team_1",
        actorId: "user_1",
        action: "plan_selected",
        entityType: "subscription",
        entityId: "subscription_1",
      },
    ]);

    const beforeNoOp = selectedSnapshot.current;
    const selectedAgain = await submitActionForm(
      origin,
      "/billing",
      starterForm,
      [],
    );
    expect(await selectedAgain.text()).toContain(
      "This plan was already active. No payment was processed.",
    );
    const afterNoOp = subscriptionSnapshot(root);
    expect(afterNoOp.current?.updatedAt).toBe(beforeNoOp?.updatedAt);
    expect(afterNoOp.activities).toHaveLength(1);

    const cancelled = await submitActionForm(
      origin,
      "/billing",
      cancelForm,
      [["subscriptionId", "subscription_foreign_billing"]],
    );
    expect(await cancelled.text()).toContain(
      "The subscription selection was cancelled.",
    );
    const afterCancel = subscriptionSnapshot(root);
    expect(afterCancel.current).toMatchObject({
      planId: "starter",
      status: "cancelled",
    });
    expect(afterCancel.current?.endDate).not.toBeNull();
    expect(afterCancel.foreign).toMatchObject({
      planId: "FOREIGN_PLAN_MUST_NOT_RENDER",
      status: "active",
      endDate: null,
    });
    expect(afterCancel.activities).toHaveLength(2);
    expect(afterCancel.activities[1]).toEqual({
      teamId: "team_1",
      actorId: "user_1",
      action: "subscription_cancelled",
      entityType: "subscription",
      entityId: "subscription_1",
    });

    const cancelledAgain = await submitActionForm(
      origin,
      "/billing",
      cancelForm,
      [],
    );
    expect(await cancelledAgain.text()).toContain(
      "The subscription selection was already cancelled.",
    );
    const afterCancelNoOp = subscriptionSnapshot(root);
    expect(afterCancelNoOp.current?.endDate).toBe(afterCancel.current?.endDate);
    expect(afterCancelNoOp.current?.updatedAt).toBe(
      afterCancel.current?.updatedAt,
    );
    expect(afterCancelNoOp.activities).toHaveLength(2);

    runDatabaseScript(root, `
      await prisma.subscription.update({
        where: { teamId: "team_1" },
        data: { status: "paused", endDate: null },
      });
    `);
    const unsupportedCancel = await submitActionForm(
      origin,
      "/billing",
      cancelForm,
      [],
    );
    expect(await unsupportedCancel.text()).toContain(
      "The stored subscription state is unsupported.",
    );
    expect(subscriptionSnapshot(root).current).toMatchObject({
      planId: "starter",
      status: "paused",
      endDate: null,
    });

    const reactivated = await submitActionForm(
      origin,
      "/billing",
      enterpriseForm,
      [],
    );
    expect(await reactivated.text()).toContain(
      "The plan selection was saved. No payment was processed.",
    );
    const afterReactivation = subscriptionSnapshot(root);
    expect(afterReactivation.current).toMatchObject({
      planId: "enterprise",
      status: "active",
      endDate: null,
    });
    expect(afterReactivation.current?.startDate).not.toBe(
      selectedSnapshot.current?.startDate,
    );

    runDatabaseScript(root, `
      await prisma.membership.update({
        where: { id: "membership_1" },
        data: { role: "member" },
      });
    `);
    const demoted = await submitActionForm(origin, "/billing", proForm, []);
    expect(await demoted.text()).toContain(
      "Only a current workspace owner or admin can manage billing.",
    );
    expect(subscriptionSnapshot(root).current?.planId).toBe("enterprise");

    runDatabaseScript(root, `
      await prisma.membership.delete({ where: { id: "membership_1" } });
    `);
    const removed = await submitActionForm(origin, "/billing", proForm, []);
    expect(await removed.text()).toContain(
      "Your workspace access could not be verified.",
    );
    expect(subscriptionSnapshot(root).current?.planId).toBe("enterprise");

    runDatabaseScript(root, `
      await prisma.membership.create({
        data: {
          id: "membership_1",
          teamId: "team_1",
          userId: "user_1",
          role: "owner",
          joinedAt: new Date("2026-07-01T09:00:00.000Z"),
          updatedAt: new Date("2026-07-01T09:00:00.000Z"),
        },
      });
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER fail_billing_select_activity BEFORE INSERT ON ActivityLog WHEN NEW.action = 'plan_selected' BEGIN SELECT RAISE(ABORT, 'activity blocked'); END",
      );
    `);
    const rolledBackSelection = await submitActionForm(
      origin,
      "/billing",
      proForm,
      [],
    );
    expect(await rolledBackSelection.text()).toContain(
      "The billing selection could not be saved.",
    );
    expect(subscriptionSnapshot(root).current).toMatchObject({
      planId: "enterprise",
      status: "active",
      endDate: null,
    });

    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_billing_select_activity");
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER fail_billing_cancel_activity BEFORE INSERT ON ActivityLog WHEN NEW.action = 'subscription_cancelled' BEGIN SELECT RAISE(ABORT, 'activity blocked'); END",
      );
    `);
    const rolledBackCancel = await submitActionForm(
      origin,
      "/billing",
      cancelForm,
      [],
    );
    expect(await rolledBackCancel.text()).toContain(
      "The billing selection could not be saved.",
    );
    expect(subscriptionSnapshot(root).current).toMatchObject({
      planId: "enterprise",
      status: "active",
      endDate: null,
    });

    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_billing_cancel_activity");
      await prisma.subscription.delete({ where: { teamId: "team_1" } });
    `);
    const missingCancel = await submitActionForm(
      origin,
      "/billing",
      cancelForm,
      [],
    );
    expect(await missingCancel.text()).toContain(
      "No subscription selection exists for this workspace.",
    );

    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER fail_billing_create_activity BEFORE INSERT ON ActivityLog WHEN NEW.action = 'plan_selected' BEGIN SELECT RAISE(ABORT, 'activity blocked'); END",
      );
    `);
    const rolledBackCreate = await submitActionForm(
      origin,
      "/billing",
      starterForm,
      [],
    );
    expect(await rolledBackCreate.text()).toContain(
      "The billing selection could not be saved.",
    );
    expect(subscriptionSnapshot(root).current).toBeNull();

    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_billing_create_activity");
    `);
    const created = await submitActionForm(
      origin,
      "/billing",
      starterForm,
      [],
    );
    expect(await created.text()).toContain(
      "The plan selection was saved. No payment was processed.",
    );
    const finalSnapshot = subscriptionSnapshot(root);
    expect(finalSnapshot.current).toMatchObject({
      teamId: "team_1",
      planId: "starter",
      status: "active",
      endDate: null,
    });
    expect(finalSnapshot.current?.id).not.toBe(
      "subscription_foreign_billing",
    );
    expect(finalSnapshot.activities).toHaveLength(4);
  }, 120_000);

  it("serializes competing selections and cancellations into one audit each", async () => {
    const root = createRunnableSample();
    const origin = await startRunnableSample(root);
    const starterForm = await readActionForm(
      origin,
      "/billing",
      "Select plan",
      { planId: "starter" },
    );

    const selections = await Promise.all([
      submitActionForm(origin, "/billing", starterForm, []),
      submitActionForm(origin, "/billing", starterForm, []),
    ]);
    expect(selections.every((response) => response.status === 200)).toBe(true);
    const selectionBodies = await Promise.all(
      selections.map((response) => response.text()),
    );
    expect(
      selectionBodies.filter((body) =>
        body.includes("The plan selection was saved.")
      ),
    ).toHaveLength(1);
    expect(
      selectionBodies.filter((body) =>
        body.includes("This plan was already active.")
      ),
    ).toHaveLength(1);
    expect(subscriptionSnapshot(root)).toMatchObject({
      current: {
        teamId: "team_1",
        planId: "starter",
        status: "active",
        endDate: null,
      },
      activities: [
        {
          teamId: "team_1",
          actorId: "user_1",
          action: "plan_selected",
          entityType: "subscription",
        },
      ],
    });

    const cancelForm = await readActionForm(
      origin,
      "/billing",
      "Cancel subscription selection",
    );
    const cancellations = await Promise.all([
      submitActionForm(origin, "/billing", cancelForm, []),
      submitActionForm(origin, "/billing", cancelForm, []),
    ]);
    expect(cancellations.every((response) => response.status === 200)).toBe(
      true,
    );
    const cancellationBodies = await Promise.all(
      cancellations.map((response) => response.text()),
    );
    expect(
      cancellationBodies.filter((body) =>
        body.includes("The subscription selection was cancelled.")
      ),
    ).toHaveLength(1);
    expect(
      cancellationBodies.filter((body) =>
        body.includes("The subscription selection was already cancelled.")
      ),
    ).toHaveLength(1);

    const afterConcurrency = subscriptionSnapshot(root);
    expect(afterConcurrency.current).toMatchObject({
      planId: "starter",
      status: "cancelled",
    });
    expect(afterConcurrency.current?.endDate).not.toBeNull();
    expect(afterConcurrency.activities.map((activity) => activity.action)).toEqual(
      ["plan_selected", "subscription_cancelled"],
    );

    const endDate = afterConcurrency.current?.endDate;
    const updatedAt = afterConcurrency.current?.updatedAt;
    const thirdCancellation = await submitActionForm(
      origin,
      "/billing",
      cancelForm,
      [],
    );
    expect(await thirdCancellation.text()).toContain(
      "The subscription selection was already cancelled.",
    );
    const afterNoOp = subscriptionSnapshot(root);
    expect(afterNoOp.current?.endDate).toBe(endDate);
    expect(afterNoOp.current?.updatedAt).toBe(updatedAt);
    expect(afterNoOp.activities).toHaveLength(2);

    runDatabaseScript(root, `
      await prisma.activityLog.deleteMany({
        where: {
          action: { in: ["plan_selected", "subscription_cancelled"] },
        },
      });
      await prisma.subscription.update({
        where: { teamId: "team_1" },
        data: {
          planId: "pro",
          status: "active",
          startDate: new Date("2026-07-19T00:00:00.000Z"),
          endDate: null,
        },
      });
    `);
    const mixedResponses = await Promise.all([
      submitActionForm(origin, "/billing", starterForm, []),
      submitActionForm(origin, "/billing", cancelForm, []),
    ]);
    expect(mixedResponses.every((response) => response.status === 200)).toBe(
      true,
    );
    const mixedBodies = await Promise.all(
      mixedResponses.map((response) => response.text()),
    );
    expect(mixedBodies[0]).toContain("The plan selection was saved.");
    expect(mixedBodies[1]).toContain(
      "The subscription selection was cancelled.",
    );
    const mixedOutcome = queryDatabase<{
      subscription: {
        planId: string;
        status: string;
        endDate: string | null;
      };
      activities: Array<{ action: string }>;
    }>(root, `
      const result = {
        subscription: await prisma.subscription.findUniqueOrThrow({
          where: { teamId: "team_1" },
          select: { planId: true, status: true, endDate: true },
        }),
        activities: await prisma.$queryRawUnsafe(
          'SELECT "action" FROM "ActivityLog" WHERE "action" IN (?, ?) ORDER BY rowid ASC',
          "plan_selected",
          "subscription_cancelled",
        ),
      };
    `);
    expect(mixedOutcome.subscription.planId).toBe("starter");
    expect(mixedOutcome.activities).toHaveLength(2);
    if (mixedOutcome.subscription.status === "active") {
      expect(mixedOutcome.subscription.endDate).toBeNull();
      expect(mixedOutcome.activities.map(({ action }) => action)).toEqual([
        "subscription_cancelled",
        "plan_selected",
      ]);
    } else {
      expect(mixedOutcome.subscription).toMatchObject({
        status: "cancelled",
        endDate: expect.any(String),
      });
      expect(mixedOutcome.activities.map(({ action }) => action)).toEqual([
        "plan_selected",
        "subscription_cancelled",
      ]);
    }
  }, 90_000);

  it("keeps legacy checkout compatible while failing closed on malformed input", async () => {
    const root = createRunnableSample();
    createForeignSubscription(root);
    const origin = await startRunnableSample(root);

    const checkoutResponse = await fetch(
      new URL("/checkout?plan=starter", origin),
    );
    expect(checkoutResponse.status).toBe(200);
    const checkoutHtml = await checkoutResponse.text();
    expect(checkoutHtml).toContain("Choose a Workspace Plan");
    expect(checkoutHtml).toContain("Starter");
    expect(checkoutHtml).toContain("does not");
    expect(checkoutHtml).toContain("process a payment");

    const missingDemoSession = await fetch(new URL("/api/checkout", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "starter" }),
    });
    expect(missingDemoSession.status).toBe(401);
    await expect(missingDemoSession.json()).resolves.toEqual({
      error: "unauthenticated",
    });
    const wrongDemoSession = await fetch(new URL("/api/checkout", origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "auth-token=demo-user",
      },
      body: JSON.stringify({ planId: "starter" }),
    });
    expect(wrongDemoSession.status).toBe(401);
    await expect(wrongDemoSession.json()).resolves.toEqual({
      error: "unauthenticated",
    });
    const duplicateDemoSession = await fetch(new URL("/api/checkout", origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "auth-token=demo-admin; auth-token=demo-admin",
      },
      body: JSON.stringify({ planId: "starter" }),
    });
    expect(duplicateDemoSession.status).toBe(401);
    await expect(duplicateDemoSession.json()).resolves.toEqual({
      error: "unauthenticated",
    });
    const wrongMediaType = await fetch(new URL("/api/checkout", origin), {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        cookie: demoAdminCookie,
      },
      body: JSON.stringify({ planId: "starter" }),
    });
    expect(wrongMediaType.status).toBe(415);
    await expect(wrongMediaType.json()).resolves.toEqual({
      error: "unsupported_media_type",
    });
    const jsonpMediaType = await fetch(new URL("/api/checkout", origin), {
      method: "POST",
      headers: {
        "content-type": "application/jsonp",
        cookie: demoAdminCookie,
      },
      body: JSON.stringify({ planId: "starter" }),
    });
    expect(jsonpMediaType.status).toBe(415);
    await expect(jsonpMediaType.json()).resolves.toEqual({
      error: "unsupported_media_type",
    });
    const charsetJson = await fetch(new URL("/api/checkout", origin), {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        cookie: demoAdminCookie,
      },
      body: JSON.stringify({ planId: "pro" }),
    });
    expect(charsetJson.status).toBe(200);
    await expect(charsetJson.json()).resolves.toEqual({
      subscriptionId: "subscription_1",
      planId: "pro",
      status: "active",
      paymentCaptured: false,
    });
    const malformed = await checkoutApi(origin, "{");
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: "invalid_json" });
    for (const body of [[], {}, { planId: 29 }, { planId: "unknown" }]) {
      const response = await checkoutApi(origin, JSON.stringify(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid_plan",
      });
    }

    const selected = await checkoutApi(
      origin,
      JSON.stringify({
        planId: "starter",
        teamId: "team_foreign_billing",
        userId: "user_6",
        actorId: "user_6",
        subscriptionId: "subscription_foreign_billing",
        status: "cancelled",
        paymentMethod: "card",
        paymentCaptured: true,
      }),
    );
    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toEqual({
      subscriptionId: "subscription_1",
      planId: "starter",
      status: "active",
      paymentCaptured: false,
    });
    const repeated = await checkoutApi(
      origin,
      JSON.stringify({ planId: "starter" }),
    );
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toEqual({
      subscriptionId: "subscription_1",
      planId: "starter",
      status: "active",
      paymentCaptured: false,
    });
    expect(subscriptionSnapshot(root)).toMatchObject({
      current: {
        id: "subscription_1",
        teamId: "team_1",
        planId: "starter",
        status: "active",
      },
      foreign: {
        id: "subscription_foreign_billing",
        teamId: "team_foreign_billing",
        planId: "FOREIGN_PLAN_MUST_NOT_RENDER",
        status: "active",
      },
      activities: [
        {
          teamId: "team_1",
          actorId: "user_1",
          action: "plan_selected",
          entityId: "subscription_1",
        },
      ],
    });

    runDatabaseScript(root, `
      await prisma.membership.update({
        where: { id: "membership_1" },
        data: { role: "member" },
      });
    `);
    const forbidden = await checkoutApi(
      origin,
      JSON.stringify({ planId: "pro" }),
    );
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toEqual({
      error: "role_forbidden",
    });
    runDatabaseScript(root, `
      await prisma.membership.delete({ where: { id: "membership_1" } });
    `);
    const missingMembership = await checkoutApi(
      origin,
      JSON.stringify({ planId: "pro" }),
    );
    expect(missingMembership.status).toBe(403);
    await expect(missingMembership.json()).resolves.toEqual({
      error: "membership_missing",
    });
    expect(subscriptionSnapshot(root).current?.planId).toBe("starter");
    expect(subscriptionSnapshot(root).activities).toHaveLength(1);

    const checkoutSource = readFileSync(
      join(sampleRoot, "components/CheckoutForm.tsx"),
      "utf8",
    );
    expect(checkoutSource).not.toContain("paymentMethod");
    expect(checkoutSource.toLowerCase()).not.toContain("payment recorded");
    expect(checkoutSource).not.toMatch(/\bresult\.paymentCaptured\s*\?/u);
    expect(checkoutSource).toContain("result.paymentCaptured !== false");
  }, 90_000);
});

interface ActionForm {
  fields: Array<[string, string]>;
}

interface SubscriptionSnapshot {
  current: SubscriptionRecord | null;
  foreign: SubscriptionRecord | null;
  activities: Array<{
    teamId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
  }>;
}

interface SubscriptionRecord {
  id: string;
  teamId: string;
  planId: string;
  status: string;
  startDate: string;
  endDate: string | null;
  updatedAt: string;
}

async function readActionForm(
  origin: string,
  path: string,
  submitLabel: string,
  expectedFields: Readonly<Record<string, string>> = {},
): Promise<ActionForm> {
  const response = await fetch(new URL(path, origin));
  expect(response.status).toBe(200);
  const html = await response.text();
  const escapedLabel = submitLabel.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const forms = Array.from(html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gu))
    .map((match) => ({
      candidate: match[0],
      fields: hiddenFields(match[0]),
    }))
    .filter(({ candidate }) => new RegExp(
      `<button\\b[^>]*>${escapedLabel}</button>`,
      "u",
    ).test(candidate))
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

function withoutField(form: ActionForm, fieldName: string): ActionForm {
  return {
    fields: form.fields.filter(([name]) => name !== fieldName),
  };
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

function expectUnsupportedStoredState(
  html: string,
  rawStatus: string,
): void {
  const section = /<section\b[^>]*aria-labelledby="current-subscription"[^>]*>[\s\S]*?<\/section>/u
    .exec(html)?.[0];
  if (!section) throw new Error("Could not find stored subscription section");
  expect(section).toMatch(
    /Unsupported stored (?:subscription )?(?:state|status)/u,
  );
  expect(section).toContain(`(${rawStatus})`);
  expect(section).not.toContain(`>${rawStatus}<`);
}

function checkoutApi(origin: string, body: string): Promise<Response> {
  return fetch(new URL("/api/checkout", origin), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: demoAdminCookie,
    },
    body,
  });
}

function createForeignSubscription(root: string): void {
  runDatabaseScript(root, `
    await prisma.team.create({
      data: {
        id: "team_foreign_billing",
        name: "FOREIGN_BILLING_TEAM",
        memberships: {
          create: {
            id: "membership_foreign_billing",
            userId: "user_6",
            role: "owner",
          },
        },
        subscription: {
          create: {
            id: "subscription_foreign_billing",
            planId: "FOREIGN_PLAN_MUST_NOT_RENDER",
            status: "active",
            startDate: new Date("2026-07-20T00:00:00.000Z"),
          },
        },
      },
    });
  `);
}

function subscriptionSnapshot(root: string): SubscriptionSnapshot {
  return queryDatabase(root, `
    const result = {
      current: await prisma.subscription.findUnique({
        where: { teamId: "team_1" },
        select: {
          id: true,
          teamId: true,
          planId: true,
          status: true,
          startDate: true,
          endDate: true,
          updatedAt: true,
        },
      }),
      foreign: await prisma.subscription.findUnique({
        where: { teamId: "team_foreign_billing" },
        select: {
          id: true,
          teamId: true,
          planId: true,
          status: true,
          startDate: true,
          endDate: true,
          updatedAt: true,
        },
      }),
      activities: await prisma.activityLog.findMany({
        where: {
          action: { in: ["plan_selected", "subscription_cancelled"] },
        },
        orderBy: { createdAt: "asc" },
        select: {
          teamId: true,
          actorId: true,
          action: true,
          entityType: true,
          entityId: true,
        },
      }),
    };
  `);
}

function createRunnableSample(): string {
  const container = mkdtempSync(join(tmpdir(), "projectos-billing-app-"));
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
      const response = await fetch(new URL("/billing", origin));
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
