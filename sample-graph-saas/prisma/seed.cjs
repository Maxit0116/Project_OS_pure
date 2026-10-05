const { PrismaClient } = require("@prisma/client");

const FIXTURE_VERSION = "workspace-v2";
const FIXTURE_APPLIED_AT = new Date("2026-07-01T09:30:00.000Z");
const datasourceUrl = process.env.PROJECTOS_TEST_DATABASE_URL;
const prisma = new PrismaClient(
  datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {},
);

const users = [
  { id: "user_1", name: "Demo User", email: "demo@example.com", role: "admin" },
  ...Array.from({ length: 11 }, (_, index) => {
    const number = index + 2;
    return {
      id: `user_${number}`,
      name: `Demo User ${number}`,
      email: `demo+${number}@example.com`,
      role: "user",
    };
  }),
].map((user, index) => ({
  ...user,
  createdAt: new Date(`2026-06-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`),
  updatedAt: new Date(`2026-06-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`),
}));

const team = {
  id: "team_1",
  name: "Northstar Studio",
  createdAt: new Date("2026-07-01T09:00:00.000Z"),
  updatedAt: new Date("2026-07-01T09:00:00.000Z"),
};

const memberships = [
  { id: "membership_1", userId: "user_1", role: "owner" },
  { id: "membership_2", userId: "user_2", role: "admin" },
  { id: "membership_3", userId: "user_3", role: "member" },
  { id: "membership_4", userId: "user_4", role: "member" },
  { id: "membership_5", userId: "user_5", role: "member" },
].map((membership) => ({
  ...membership,
  teamId: team.id,
  joinedAt: new Date("2026-07-01T09:00:00.000Z"),
  updatedAt: new Date("2026-07-01T09:00:00.000Z"),
}));

const projects = [
  {
    id: "project_1",
    teamId: team.id,
    name: "Website launch",
    description: "Ship the new marketing site and customer stories.",
    createdById: "user_1",
    archivedAt: null,
    createdAt: new Date("2026-07-02T09:00:00.000Z"),
    updatedAt: new Date("2026-07-18T15:30:00.000Z"),
  },
  {
    id: "project_2",
    teamId: team.id,
    name: "Customer onboarding",
    description: "Reduce time-to-value for new workspace owners.",
    createdById: "user_2",
    archivedAt: null,
    createdAt: new Date("2026-07-05T10:00:00.000Z"),
    updatedAt: new Date("2026-07-20T12:00:00.000Z"),
  },
  {
    id: "project_3",
    teamId: team.id,
    name: "Mobile research",
    description: "Archived discovery work for a future companion app.",
    createdById: "user_1",
    archivedAt: new Date("2026-07-16T17:00:00.000Z"),
    createdAt: new Date("2026-06-20T08:30:00.000Z"),
    updatedAt: new Date("2026-07-16T17:00:00.000Z"),
  },
];

const tasks = [
  {
    id: "task_1",
    projectId: "project_1",
    title: "Approve homepage copy",
    description: "Review the final value proposition and proof points.",
    status: "done",
    assigneeId: "user_2",
    createdById: "user_1",
    dueDate: new Date("2026-07-12T17:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-07-03T09:00:00.000Z"),
    updatedAt: new Date("2026-07-11T14:00:00.000Z"),
  },
  {
    id: "task_2",
    projectId: "project_1",
    title: "Build customer story cards",
    description: "Add three accessible case-study summaries.",
    status: "in_progress",
    assigneeId: "user_3",
    createdById: "user_1",
    dueDate: new Date("2026-07-28T17:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-07-06T11:00:00.000Z"),
    updatedAt: new Date("2026-07-21T10:30:00.000Z"),
  },
  {
    id: "task_3",
    projectId: "project_1",
    title: "Run launch accessibility pass",
    description: "Verify keyboard, contrast, and landmark coverage.",
    status: "todo",
    assigneeId: "user_4",
    createdById: "user_2",
    dueDate: new Date("2026-08-01T17:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-07-10T13:00:00.000Z"),
    updatedAt: new Date("2026-07-10T13:00:00.000Z"),
  },
  {
    id: "task_4",
    projectId: "project_2",
    title: "Map first-run checklist",
    description: "Define the smallest successful onboarding path.",
    status: "done",
    assigneeId: "user_1",
    createdById: "user_2",
    dueDate: new Date("2026-07-18T17:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-07-07T10:00:00.000Z"),
    updatedAt: new Date("2026-07-17T16:00:00.000Z"),
  },
  {
    id: "task_5",
    projectId: "project_2",
    title: "Instrument activation event",
    description: "Record when a new team completes its first project.",
    status: "in_progress",
    assigneeId: "user_5",
    createdById: "user_1",
    dueDate: new Date("2026-07-30T17:00:00.000Z"),
    archivedAt: null,
    createdAt: new Date("2026-07-12T09:30:00.000Z"),
    updatedAt: new Date("2026-07-22T11:45:00.000Z"),
  },
  {
    id: "task_6",
    projectId: "project_2",
    title: "Draft welcome email",
    description: "Write a concise email linked to the first-run checklist.",
    status: "todo",
    assigneeId: null,
    createdById: "user_2",
    dueDate: null,
    archivedAt: null,
    createdAt: new Date("2026-07-14T15:00:00.000Z"),
    updatedAt: new Date("2026-07-14T15:00:00.000Z"),
  },
  {
    id: "task_7",
    projectId: "project_3",
    title: "Interview mobile users",
    description: "Summarize recurring mobile workflow constraints.",
    status: "done",
    assigneeId: "user_3",
    createdById: "user_1",
    dueDate: new Date("2026-07-10T17:00:00.000Z"),
    archivedAt: new Date("2026-07-16T17:00:00.000Z"),
    createdAt: new Date("2026-06-22T09:00:00.000Z"),
    updatedAt: new Date("2026-07-16T17:00:00.000Z"),
  },
  {
    id: "task_8",
    projectId: "project_3",
    title: "Prototype offline notes",
    description: "Explore a local-first capture flow.",
    status: "todo",
    assigneeId: "user_4",
    createdById: "user_1",
    dueDate: null,
    archivedAt: new Date("2026-07-16T17:00:00.000Z"),
    createdAt: new Date("2026-06-26T14:00:00.000Z"),
    updatedAt: new Date("2026-07-16T17:00:00.000Z"),
  },
];

const activities = [
  {
    id: "activity_1",
    teamId: team.id,
    actorId: "user_1",
    projectId: "project_1",
    taskId: null,
    action: "created",
    entityType: "project",
    entityId: "project_1",
    summary: "Demo User created Website launch.",
    createdAt: new Date("2026-07-02T09:00:00.000Z"),
  },
  {
    id: "activity_2",
    teamId: team.id,
    actorId: "user_2",
    projectId: "project_1",
    taskId: "task_1",
    action: "completed",
    entityType: "task",
    entityId: "task_1",
    summary: "Demo User 2 completed Approve homepage copy.",
    createdAt: new Date("2026-07-11T14:00:00.000Z"),
  },
  {
    id: "activity_3",
    teamId: team.id,
    actorId: "user_1",
    projectId: "project_2",
    taskId: "task_4",
    action: "completed",
    entityType: "task",
    entityId: "task_4",
    summary: "Demo User completed Map first-run checklist.",
    createdAt: new Date("2026-07-17T16:00:00.000Z"),
  },
  {
    id: "activity_4",
    teamId: team.id,
    actorId: "user_3",
    projectId: "project_1",
    taskId: "task_2",
    action: "started",
    entityType: "task",
    entityId: "task_2",
    summary: "Demo User 3 started Build customer story cards.",
    createdAt: new Date("2026-07-21T10:30:00.000Z"),
  },
  {
    id: "activity_5",
    teamId: team.id,
    actorId: "user_5",
    projectId: "project_2",
    taskId: "task_5",
    action: "started",
    entityType: "task",
    entityId: "task_5",
    summary: "Demo User 5 started Instrument activation event.",
    createdAt: new Date("2026-07-22T11:45:00.000Z"),
  },
];

const post = {
  id: "post_1",
  title: "Welcome to ProjectOS",
  slug: "welcome-to-projectos",
  excerpt: "A deterministic post for the runnable sample workspace.",
  content: "<p>The sample content and database are ready.</p>",
  authorId: "user_1",
  createdAt: new Date("2026-07-01T10:00:00.000Z"),
  updatedAt: new Date("2026-07-01T10:00:00.000Z"),
};

const subscription = {
  id: "subscription_1",
  teamId: team.id,
  planId: "pro",
  status: "active",
  startDate: new Date("2026-07-19T00:00:00.000Z"),
  endDate: null,
  createdAt: new Date("2026-07-19T00:00:00.000Z"),
  updatedAt: new Date("2026-07-19T00:00:00.000Z"),
};

const settings = {
  id: "settings_1",
  userId: "user_1",
  emailNotifications: true,
  theme: "dark",
  createdAt: new Date("2026-07-01T10:00:00.000Z"),
  updatedAt: new Date("2026-07-01T10:00:00.000Z"),
};

const notification = {
  id: "notification_1",
  userId: "user_1",
  message: "ProjectOS sample data is ready.",
  read: false,
  createdAt: new Date("2026-07-01T10:00:00.000Z"),
};

async function createIfMissing(delegate, record, alternateWhere) {
  const existing = await delegate.findUnique({
    where: { id: record.id },
    select: { id: true },
  });
  if (existing) return;
  if (alternateWhere) {
    const alternate = await delegate.findUnique({
      where: alternateWhere,
      select: { id: true },
    });
    if (alternate) return;
  }
  await delegate.create({ data: record });
}

async function createMembershipIfMissing(transaction, record) {
  const existing = await transaction.membership.findUnique({
    where: {
      teamId_userId: {
        teamId: record.teamId,
        userId: record.userId,
      },
    },
    select: { id: true },
  });
  if (existing) return;
  const conflictingId = await transaction.membership.findUnique({
    where: { id: record.id },
    select: { teamId: true, userId: true },
  });
  if (conflictingId) {
    throw new Error(
      `Seed refused to repoint ${record.id} from ` +
      `${conflictingId.teamId}/${conflictingId.userId}.`,
    );
  }
  await transaction.membership.create({ data: record });
}

async function createTeamSubscriptionIfMissing(transaction, record) {
  const existing = await transaction.subscription.findUnique({
    where: { teamId: record.teamId },
    select: { id: true },
  });
  if (!existing) await transaction.subscription.create({ data: record });
}

async function seed() {
  await prisma.$transaction(async (transaction) => {
    for (const user of users) {
      await createIfMissing(transaction.user, user, { email: user.email });
    }
    await createIfMissing(transaction.team, team);
    for (const membership of memberships) {
      await createMembershipIfMissing(transaction, membership);
    }
    for (const project of projects) await createIfMissing(transaction.project, project);
    for (const task of tasks) await createIfMissing(transaction.task, task);
    await createTeamSubscriptionIfMissing(transaction, subscription);
    await createIfMissing(transaction.settings, settings, {
      userId: settings.userId,
    });
    await createIfMissing(transaction.post, post, { slug: post.slug });
    await createIfMissing(transaction.notification, notification);
    for (const activity of activities) {
      await createIfMissing(transaction.activityLog, activity);
    }
    await transaction.fixtureState.upsert({
      where: { id: "sample_workspace" },
      update: { version: FIXTURE_VERSION, appliedAt: FIXTURE_APPLIED_AT },
      create: {
        id: "sample_workspace",
        version: FIXTURE_VERSION,
        appliedAt: FIXTURE_APPLIED_AT,
      },
    });
  });
  console.log(
    `Seeded ${users.length} users, ${memberships.length} team members, ` +
    `${projects.length} projects, and ${tasks.length} tasks (${FIXTURE_VERSION}).`,
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
