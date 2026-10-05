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

describe.runIf(forced)("sample projects workspace", () => {
  it("renders only active-team projects and hides foreign project existence", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.team.create({
        data: {
          id: "team_foreign_projects",
          name: "Foreign Projects",
          memberships: {
            create: {
              id: "membership_foreign_projects",
              userId: "user_6",
              role: "owner",
            },
          },
          projects: {
            create: {
              id: "project_foreign_secret",
              name: "Foreign secret project",
              description: "Must never cross the active-team boundary.",
              createdById: "user_6",
            },
          },
        },
      });
      await prisma.task.create({
        data: {
          id: "task_cross_team_assignee",
          projectId: "project_1",
          title: "Foreign assignee sentinel",
          status: "todo",
          assigneeId: "user_6",
          createdById: "user_6",
        },
      });
    `);
    const origin = await startRunnableSample(root);

    const listResponse = await fetch(new URL("/projects", origin));
    expect(listResponse.status).toBe(200);
    const listHtml = await listResponse.text();
    expect(listHtml).toContain("Website launch");
    expect(listHtml).toContain("Customer onboarding");
    expect(listHtml).not.toContain("Mobile research");
    expect(listHtml).not.toContain("Foreign secret project");
    expect(projectCurrentTaskCount(listHtml, "Website launch")).toBe(4);
    expect(listHtml).toContain("Create a project");

    const detailResponse = await fetch(new URL("/projects/project_1", origin));
    expect(detailResponse.status).toBe(200);
    const detailHtml = await detailResponse.text();
    expect(detailHtml).toContain("Approve homepage copy");
    expect(detailHtml).toContain("Build customer story cards");
    expect(detailHtml).toContain("Run launch accessibility pass");
    expect(detailHtml).toContain("Foreign assignee sentinel");
    expect(detailHtml).toContain("Former member");
    expect(detailHtml).not.toContain("Demo User 6");
    expect(detailHtml).toContain("7/12/2026");
    expect(detailHtml).not.toContain("7/13/2026");
    expect(detailHtml).toContain("Save changes");
    expect(detailHtml).toContain("Archive project");

    const archivedResponse = await fetch(new URL("/projects/project_3", origin));
    expect(archivedResponse.status).toBe(200);
    const archivedHtml = await archivedResponse.text();
    expect(archivedHtml).toContain("Archived project");
    expect(archivedHtml).toContain("read-only");
    expect(archivedHtml).not.toContain("Save changes");

    const foreignResponse = await fetch(
      new URL("/projects/project_foreign_secret", origin),
    );
    expect(foreignResponse.status).toBe(404);
    expect(await foreignResponse.text()).toContain("Project not found");
    const invalidIdResponse = await fetch(
      new URL(`/projects/${"x".repeat(101)}`, origin),
    );
    expect(invalidIdResponse.status).toBe(404);
    expect(await invalidIdResponse.text()).toContain("Project not found");

    const signedOutResponse = await fetch(new URL("/projects", origin), {
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

  it("keeps authenticated project routes out of the production prerender cache", () => {
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
      routes: Record<string, unknown>;
    };
    expect(manifest.routes["/projects"]).toBeUndefined();
    expect(manifest.routes["/projects/project_1"]).toBeUndefined();
  }, 90_000);

  it("executes validated project Server Actions with scoped authority and atomic activity", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.team.create({
        data: {
          id: "team_foreign_mutations",
          name: "Foreign Mutations",
          memberships: {
            create: {
              id: "membership_foreign_mutations",
              userId: "user_6",
              role: "owner",
            },
          },
          projects: {
            create: {
              id: "project_foreign_mutation",
              name: "Foreign mutation target",
              description: "Must remain unchanged.",
              createdById: "user_6",
            },
          },
        },
      });
    `);
    const origin = await startRunnableSample(root);

    const createForm = await readActionForm(
      origin,
      "/projects",
      "Create project",
    );
    const invalidResponse = await submitActionForm(
      origin,
      "/projects",
      createForm,
      {
        name: "x",
        description: "Invalid",
        teamId: "team_foreign_mutations",
        userId: "user_6",
        createdById: "user_6",
        actorId: "user_6",
      },
    );
    expect(invalidResponse.status).toBe(200);
    expect(await invalidResponse.text()).toContain("Check the project name.");
    expect(queryDatabase(root, `
      const result = {
        projects: await prisma.project.count({
          where: { name: "x" },
        }),
        activities: await prisma.activityLog.count({
          where: { action: "project_created", entityId: "x" },
        }),
      };
    `)).toEqual({ projects: 0, activities: 0 });

    const createResponse = await submitActionForm(
      origin,
      "/projects",
      createForm,
      {
        name: "Roadmap refresh",
        description: "Agree on the next two quarters.",
        teamId: "team_foreign_mutations",
        userId: "user_6",
        createdById: "user_6",
        actorId: "user_6",
      },
    );
    expect(createResponse.status).toBe(200);
    expect(await createResponse.text()).toContain("Roadmap refresh was created.");
    const created = queryDatabase<{
      project: {
        id: string;
        teamId: string;
        createdById: string;
        name: string;
        description: string;
        archivedAt: string | null;
      };
      activity: {
        teamId: string;
        actorId: string;
        projectId: string;
        action: string;
        entityType: string;
        entityId: string;
      };
      activityCount: number;
    }>(root, `
      const project = await prisma.project.findFirstOrThrow({
        where: { name: "Roadmap refresh" },
        select: {
          id: true,
          teamId: true,
          createdById: true,
          name: true,
          description: true,
          archivedAt: true,
        },
      });
      const result = {
        project,
        activity: await prisma.activityLog.findFirstOrThrow({
          where: { action: "project_created", entityId: project.id },
          select: {
            teamId: true,
            actorId: true,
            projectId: true,
            action: true,
            entityType: true,
            entityId: true,
          },
        }),
        activityCount: await prisma.activityLog.count({
          where: { action: "project_created", entityId: project.id },
        }),
      };
    `);
    expect(created.project).toMatchObject({
      teamId: "team_1",
      createdById: "user_1",
      name: "Roadmap refresh",
      description: "Agree on the next two quarters.",
      archivedAt: null,
    });
    expect(created.activity).toEqual({
      teamId: "team_1",
      actorId: "user_1",
      projectId: created.project.id,
      action: "project_created",
      entityType: "project",
      entityId: created.project.id,
    });
    expect(created.activityCount).toBe(1);

    const detailPath = `/projects/${created.project.id}`;
    const updateForm = await readActionForm(
      origin,
      detailPath,
      "Save changes",
    );
    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER fail_project_activity BEFORE INSERT ON ActivityLog WHEN NEW.action = 'project_updated' BEGIN SELECT RAISE(ABORT, 'activity blocked'); END",
      );
    `);
    const rolledBackResponse = await submitActionForm(
      origin,
      detailPath,
      updateForm,
      {
        projectId: created.project.id,
        name: "Should roll back",
        description: "The activity insert will fail.",
      },
    );
    expect(rolledBackResponse.status).toBe(200);
    expect(await rolledBackResponse.text()).toContain(
      "The project could not be saved. Please try again.",
    );
    expect(queryDatabase(root, `
      const result = {
        project: await prisma.project.findUniqueOrThrow({
          where: { id: ${JSON.stringify(created.project.id)} },
          select: { name: true, description: true },
        }),
        activities: await prisma.activityLog.count({
          where: {
            action: "project_updated",
            entityId: ${JSON.stringify(created.project.id)},
          },
        }),
      };
    `)).toEqual({
      project: {
        name: "Roadmap refresh",
        description: "Agree on the next two quarters.",
      },
      activities: 0,
    });
    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_project_activity");
    `);

    const updateResponse = await submitActionForm(
      origin,
      detailPath,
      updateForm,
      {
        projectId: created.project.id,
        name: "Roadmap 2027",
        description: "A server-confirmed update.",
        teamId: "team_foreign_mutations",
      },
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.text()).toContain("Roadmap 2027 was updated.");

    runDatabaseScript(root, `
      await prisma.membership.update({
        where: {
          teamId_userId: { teamId: "team_1", userId: "user_1" },
        },
        data: { role: "member" },
      });
    `);
    const forbiddenResponse = await submitActionForm(
      origin,
      detailPath,
      updateForm,
      {
        projectId: "project_2",
        name: "Forbidden rename",
        description: "Must not land.",
      },
    );
    expect(forbiddenResponse.status).toBe(200);
    expect(await forbiddenResponse.text()).toContain(
      "You do not have permission to manage this project.",
    );
    const foreignResponse = await submitActionForm(
      origin,
      detailPath,
      updateForm,
      {
        projectId: "project_foreign_mutation",
        name: "Foreign rename",
        description: "Must not land.",
      },
    );
    expect(foreignResponse.status).toBe(200);
    expect(await foreignResponse.text()).toContain(
      "The project could not be found in your active team.",
    );
    expect(queryDatabase(root, `
      const result = {
        ownTeam: await prisma.project.findUniqueOrThrow({
          where: { id: "project_2" },
          select: { name: true },
        }),
        foreign: await prisma.project.findUniqueOrThrow({
          where: { id: "project_foreign_mutation" },
          select: { name: true },
        }),
        forbiddenActivities: await prisma.activityLog.count({
          where: {
            action: "project_updated",
            entityId: { in: ["project_2", "project_foreign_mutation"] },
          },
        }),
      };
    `)).toEqual({
      ownTeam: { name: "Customer onboarding" },
      foreign: { name: "Foreign mutation target" },
      forbiddenActivities: 0,
    });

    const archiveForm = await readActionForm(
      origin,
      detailPath,
      "Archive project",
    );
    const archiveResponse = await submitActionForm(
      origin,
      detailPath,
      archiveForm,
      { projectId: created.project.id },
    );
    expect(archiveResponse.status).toBe(200);
    expect(await archiveResponse.text()).toContain(
      "The project was archived. Its history and tasks were preserved.",
    );
    const repeatedArchiveResponse = await submitActionForm(
      origin,
      detailPath,
      archiveForm,
      { projectId: created.project.id },
    );
    expect(repeatedArchiveResponse.status).toBe(200);
    expect(await repeatedArchiveResponse.text()).toContain(
      "already archived",
    );
    expect(queryDatabase(root, `
      const result = {
        project: await prisma.project.findUniqueOrThrow({
          where: { id: ${JSON.stringify(created.project.id)} },
          select: { archivedAt: true, name: true },
        }),
        updateActivities: await prisma.activityLog.count({
          where: {
            action: "project_updated",
            entityId: ${JSON.stringify(created.project.id)},
          },
        }),
        archiveActivities: await prisma.activityLog.count({
          where: {
            action: "project_archived",
            entityId: ${JSON.stringify(created.project.id)},
          },
        }),
      };
    `)).toMatchObject({
      project: {
        name: "Roadmap 2027",
        archivedAt: expect.any(String),
      },
      updateActivities: 1,
      archiveActivities: 1,
    });

    const activeList = await fetch(new URL("/projects", origin));
    expect(await activeList.text()).not.toContain("Roadmap 2027");
    const archivedDetail = await fetch(new URL(detailPath, origin));
    expect(archivedDetail.status).toBe(200);
    expect(await archivedDetail.text()).toContain("read-only");
  }, 90_000);

  it("executes task lifecycle actions with team-safe assignees and live authority", async () => {
    const root = createRunnableSample();
    runDatabaseScript(root, `
      await prisma.team.create({
        data: {
          id: "team_foreign_tasks",
          name: "Foreign Tasks",
          memberships: {
            create: {
              id: "membership_foreign_tasks",
              userId: "user_6",
              role: "owner",
            },
          },
          projects: {
            create: {
              id: "project_foreign_tasks",
              name: "Foreign task project",
              description: "Outside the active team.",
              createdById: "user_6",
              tasks: {
                create: {
                  id: "task_foreign_target",
                  title: "Foreign task target",
                  description: "Must never change.",
                  status: "todo",
                  createdById: "user_6",
                  assigneeId: "user_6",
                },
              },
            },
          },
        },
      });
    `);
    const origin = await startRunnableSample(root);
    const detailPath = "/projects/project_1";
    const projectUpdatedBefore = queryDatabase<string>(root, `
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: "project_1" },
        select: { updatedAt: true },
      });
      const result = project.updatedAt;
    `);
    const createForm = await readActionForm(origin, detailPath, "Create task");

    const invalidTitleResponse = await submitActionForm(
      origin,
      detailPath,
      createForm,
      {
        projectId: "project_1",
        title: "x",
        description: "Too short.",
        status: "todo",
        assigneeId: "",
        dueDate: "",
      },
    );
    expect(invalidTitleResponse.status).toBe(200);
    expect(await invalidTitleResponse.text()).toContain(
      "Use between 3 and 120 characters.",
    );

    const foreignAssigneeResponse = await submitActionForm(
      origin,
      detailPath,
      createForm,
      {
        projectId: "project_1",
        title: "Unsafe assignment",
        description: "Must not be created.",
        status: "todo",
        assigneeId: "user_6",
        dueDate: "",
      },
    );
    expect(foreignAssigneeResponse.status).toBe(200);
    expect(await foreignAssigneeResponse.text()).toContain(
      "Choose a member of the active team.",
    );
    const invalidStatusResponse = await submitActionForm(
      origin,
      detailPath,
      createForm,
      {
        projectId: "project_1",
        title: "Unknown status task",
        description: "Must not be created.",
        status: "waiting_for_magic",
        assigneeId: "",
        dueDate: "",
      },
    );
    expect(invalidStatusResponse.status).toBe(200);
    expect(await invalidStatusResponse.text()).toContain(
      "Choose one of the available task statuses.",
    );
    const invalidDateResponse = await submitActionForm(
      origin,
      detailPath,
      createForm,
      {
        projectId: "project_1",
        title: "Impossible due date",
        description: "Must not be created.",
        status: "todo",
        assigneeId: "",
        dueDate: "2030-02-30",
      },
    );
    expect(invalidDateResponse.status).toBe(200);
    expect(await invalidDateResponse.text()).toContain(
      "Choose a date between 2000 and 2100.",
    );
    expect(queryDatabase(root, `
      const result = {
        invalidTasks: await prisma.task.count({
          where: {
            title: {
              in: [
                "x",
                "Unsafe assignment",
                "Unknown status task",
                "Impossible due date",
              ],
            },
          },
        }),
        invalidActivities: await prisma.activityLog.count({
          where: {
            action: "task_created",
            OR: [
              { summary: { contains: "Unsafe" } },
              { summary: { contains: "Unknown status" } },
              { summary: { contains: "Impossible due" } },
            ],
          },
        }),
        projectUpdatedAt: (
          await prisma.project.findUniqueOrThrow({
            where: { id: "project_1" },
            select: { updatedAt: true },
          })
        ).updatedAt,
      };
    `)).toEqual({
      invalidTasks: 0,
      invalidActivities: 0,
      projectUpdatedAt: projectUpdatedBefore,
    });

    const createResponse = await submitActionForm(
      origin,
      detailPath,
      createForm,
      {
        projectId: "project_1",
        title: "Publish launch notes",
        description: "Draft and publish the release notes.",
        status: "todo",
        assigneeId: "user_5",
        dueDate: "2030-02-03",
        teamId: "team_foreign_tasks",
        userId: "user_6",
        createdById: "user_6",
        actorId: "user_6",
      },
    );
    expect(createResponse.status).toBe(200);
    expect(await createResponse.text()).toContain(
      "Publish launch notes was created.",
    );
    const created = queryDatabase<{
      task: {
        id: string;
        projectId: string;
        createdById: string;
        assigneeId: string | null;
        title: string;
        description: string;
        status: string;
        dueDate: string | null;
        archivedAt: string | null;
      };
      projectTeamId: string;
      projectUpdatedAt: string;
      activity: {
        teamId: string;
        actorId: string;
        projectId: string;
        taskId: string;
        action: string;
        entityType: string;
        entityId: string;
      };
    }>(root, `
      const task = await prisma.task.findFirstOrThrow({
        where: { title: "Publish launch notes" },
        select: {
          id: true,
          projectId: true,
          createdById: true,
          assigneeId: true,
          title: true,
          description: true,
          status: true,
          dueDate: true,
          archivedAt: true,
        },
      });
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: task.projectId },
        select: { teamId: true, updatedAt: true },
      });
      const result = {
        task,
        projectTeamId: project.teamId,
        projectUpdatedAt: project.updatedAt,
        activity: await prisma.activityLog.findFirstOrThrow({
          where: { action: "task_created", entityId: task.id },
          select: {
            teamId: true,
            actorId: true,
            projectId: true,
            taskId: true,
            action: true,
            entityType: true,
            entityId: true,
          },
        }),
      };
    `);
    expect(created).toMatchObject({
      task: {
        projectId: "project_1",
        createdById: "user_1",
        assigneeId: "user_5",
        title: "Publish launch notes",
        description: "Draft and publish the release notes.",
        status: "todo",
        dueDate: expect.stringContaining("2030-02-03"),
        archivedAt: null,
      },
      projectTeamId: "team_1",
      projectUpdatedAt: expect.any(String),
      activity: {
        teamId: "team_1",
        actorId: "user_1",
        projectId: "project_1",
        taskId: created.task.id,
        action: "task_created",
        entityType: "task",
        entityId: created.task.id,
      },
    });
    expect(new Date(created.projectUpdatedAt).getTime()).toBeGreaterThan(
      new Date(projectUpdatedBefore).getTime(),
    );

    const editForm = await readActionForm(
      origin,
      detailPath,
      "Save task",
      { taskId: created.task.id },
    );
    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe(
        "CREATE TRIGGER fail_task_activity BEFORE INSERT ON ActivityLog WHEN NEW.action = 'task_updated' BEGIN SELECT RAISE(ABORT, 'activity blocked'); END",
      );
    `);
    const rolledBackResponse = await submitActionForm(
      origin,
      detailPath,
      editForm,
      {
        taskId: created.task.id,
        title: "Rollback task update",
        description: "The paired activity write will fail.",
        status: "done",
        assigneeId: "user_4",
        dueDate: "2030-03-04",
      },
    );
    expect(rolledBackResponse.status).toBe(200);
    expect(await rolledBackResponse.text()).toContain(
      "The task could not be saved. Please try again.",
    );
    expect(queryDatabase(root, `
      const result = await prisma.task.findUniqueOrThrow({
        where: { id: ${JSON.stringify(created.task.id)} },
        select: { title: true, status: true, assigneeId: true },
      });
    `)).toEqual({
      title: "Publish launch notes",
      status: "todo",
      assigneeId: "user_5",
    });
    runDatabaseScript(root, `
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_task_activity");
    `);

    const updateResponse = await submitActionForm(
      origin,
      detailPath,
      editForm,
      {
        taskId: created.task.id,
        title: "Publish release notes",
        description: "Publish the reviewed release notes.",
        status: "done",
        assigneeId: "user_4",
        dueDate: "2030-03-04",
      },
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.text()).toContain(
      "Publish release notes was updated.",
    );
    expect(queryDatabase(root, `
      const result = await prisma.task.findUniqueOrThrow({
        where: { id: ${JSON.stringify(created.task.id)} },
        select: { status: true },
      });
    `)).toEqual({ status: "todo" });

    const createdStatusForm = await readActionForm(
      origin,
      detailPath,
      "Update status",
      { taskId: created.task.id },
    );
    const createdStatusResponse = await submitActionForm(
      origin,
      detailPath,
      createdStatusForm,
      {
        taskId: created.task.id,
        status: "in_progress",
      },
    );
    expect(createdStatusResponse.status).toBe(200);
    expect(await createdStatusResponse.text()).toContain(
      "Publish release notes status was updated.",
    );

    const invalidReassignmentResponse = await submitActionForm(
      origin,
      detailPath,
      editForm,
      {
        taskId: created.task.id,
        title: "Publish release notes",
        description: "Publish the reviewed release notes.",
        status: "done",
        assigneeId: "user_6",
        dueDate: "2030-03-04",
      },
    );
    expect(invalidReassignmentResponse.status).toBe(200);
    expect(await invalidReassignmentResponse.text()).toContain(
      "Choose a member of the active team.",
    );

    runDatabaseScript(root, `
      await prisma.membership.update({
        where: {
          teamId_userId: { teamId: "team_1", userId: "user_1" },
        },
        data: { role: "member" },
      });
    `);
    const forbiddenEditResponse = await submitActionForm(
      origin,
      "/projects/project_2",
      editForm,
      {
        taskId: "task_4",
        title: "Forbidden task edit",
        description: "The assignee cannot rewrite task details.",
        status: "done",
        assigneeId: "user_1",
        dueDate: "2026-07-18",
      },
    );
    expect(forbiddenEditResponse.status).toBe(200);
    expect(await forbiddenEditResponse.text()).toContain(
      "You do not have permission to manage this task.",
    );

    const statusForm = await readActionForm(
      origin,
      "/projects/project_2",
      "Update status",
      { taskId: "task_4" },
    );
    const statusResponse = await submitActionForm(
      origin,
      "/projects/project_2",
      statusForm,
      {
        taskId: "task_4",
        status: "in_progress",
      },
    );
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.text()).toContain(
      "Map first-run checklist status was updated.",
    );

    const foreignTaskResponse = await submitActionForm(
      origin,
      detailPath,
      editForm,
      {
        taskId: "task_foreign_target",
        title: "Foreign task changed",
        description: "Must not land.",
        status: "done",
        assigneeId: "user_1",
        dueDate: "",
      },
    );
    expect(foreignTaskResponse.status).toBe(200);
    expect(await foreignTaskResponse.text()).toContain(
      "could not be found in your active team",
    );

    const archivedProjectResponse = await submitActionForm(
      origin,
      "/projects/project_3",
      createForm,
      {
        projectId: "project_3",
        title: "Task in archived project",
        description: "Must not be created.",
        status: "todo",
        assigneeId: "",
        dueDate: "",
      },
    );
    expect(archivedProjectResponse.status).toBe(200);
    expect(await archivedProjectResponse.text()).toContain(
      "Tasks cannot change inside an archived project.",
    );

    const archiveForm = await readActionForm(
      origin,
      detailPath,
      "Archive task",
      { taskId: created.task.id },
    );
    const archiveResponse = await submitActionForm(
      origin,
      detailPath,
      archiveForm,
      { taskId: created.task.id },
    );
    expect(archiveResponse.status).toBe(200);
    expect(await archiveResponse.text()).toContain(
      "Publish release notes was archived.",
    );
    const repeatedArchiveResponse = await submitActionForm(
      origin,
      detailPath,
      archiveForm,
      { taskId: created.task.id },
    );
    expect(repeatedArchiveResponse.status).toBe(200);
    expect(await repeatedArchiveResponse.text()).toContain(
      "already archived",
    );

    expect(queryDatabase(root, `
      const result = {
        task: await prisma.task.findUniqueOrThrow({
          where: { id: ${JSON.stringify(created.task.id)} },
          select: {
            title: true,
            status: true,
            assigneeId: true,
            dueDate: true,
            archivedAt: true,
          },
        }),
        taskActivities: await prisma.activityLog.groupBy({
          by: ["action"],
          where: { taskId: ${JSON.stringify(created.task.id)} },
          _count: { _all: true },
          orderBy: { action: "asc" },
        }),
        assigneeStatusActivities: await prisma.activityLog.count({
          where: { taskId: "task_4", action: "task_status_changed" },
        }),
        forbiddenActivities: await prisma.activityLog.count({
          where: {
            action: { in: ["task_updated", "task_created"] },
            OR: [
              { taskId: "task_4" },
              { taskId: "task_foreign_target" },
              { summary: { contains: "archived project" } },
            ],
          },
        }),
        foreignTask: await prisma.task.findUniqueOrThrow({
          where: { id: "task_foreign_target" },
          select: { title: true, status: true, assigneeId: true },
        }),
      };
    `)).toMatchObject({
      task: {
        title: "Publish release notes",
        status: "in_progress",
        assigneeId: "user_4",
        dueDate: expect.stringContaining("2030-03-04"),
        archivedAt: expect.any(String),
      },
      taskActivities: [
        { action: "task_archived", _count: { _all: 1 } },
        { action: "task_created", _count: { _all: 1 } },
        { action: "task_status_changed", _count: { _all: 1 } },
        { action: "task_updated", _count: { _all: 1 } },
      ],
      assigneeStatusActivities: 1,
      forbiddenActivities: 0,
      foreignTask: {
        title: "Foreign task target",
        status: "todo",
        assigneeId: "user_6",
      },
    });
    const finalDetail = await fetch(new URL(detailPath, origin));
    expect(finalDetail.status).toBe(200);
    expect(await finalDetail.text()).not.toContain("Publish release notes");
    const finalList = await fetch(new URL("/projects", origin));
    expect(finalList.status).toBe(200);
    expect(projectCurrentTaskCount(
      await finalList.text(),
      "Website launch",
    )).toBe(3);
  }, 90_000);
});

interface ActionForm {
  fields: Array<[string, string]>;
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
    .map((match) => match[0])
    .filter((candidate) => new RegExp(
      `<button\\b[^>]*>${escapedLabel}</button>`,
      "u",
    ).test(candidate))
    .map((candidate) => ({
      candidate,
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

function projectCurrentTaskCount(html: string, projectName: string): number {
  const escapedName = projectName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const row = Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gu))
    .map((match) => match[0])
    .find((candidate) => new RegExp(
      `>${escapedName}</a>`,
      "u",
    ).test(candidate));
  if (!row) throw new Error(`Could not find project row '${projectName}'`);
  const cells = Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gu));
  const taskCell = cells[2]?.[1]?.replace(/<[^>]+>/gu, "").trim();
  const count = Number(taskCell);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Project row '${projectName}' had invalid current task count`);
  }
  return count;
}

function createRunnableSample(): string {
  const container = mkdtempSync(join(tmpdir(), "projectos-projects-app-"));
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
      const response = await fetch(new URL("/projects", origin));
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
