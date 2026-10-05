import { prisma } from './db'

export async function requireDashboardMembership(teamId: string, userId: string) {
  const membershipCount = await prisma.membership.count({ where: { teamId, userId } })
  if (membershipCount !== 1) throw new Error('Active team membership is required')
  return membershipCount
}

export async function getStats(teamId: string) {
  const memberCount = await prisma.membership.count({ where: { teamId } })
  const projectCount = await prisma.project.count({ where: { teamId, archivedAt: null } })
  const taskCount = await prisma.task.count({ where: { project: { teamId } } })
  return { memberCount, projectCount, taskCount }
}

function activitySummary(activity: { summary: string } | null) {
  if (!activity) return 'No recent activity.'
  return String(activity.summary)
}

export async function getRecentActivity(teamId: string) {
  const firstActivity = await prisma.activityLog.findFirst({
    where: { teamId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { summary: true },
  })
  const secondActivity = await prisma.activityLog.findFirst({
    where: { teamId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 1,
    select: { summary: true },
  })
  const thirdActivity = await prisma.activityLog.findFirst({
    where: { teamId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: 2,
    select: { summary: true },
  })
  const firstSummary = activitySummary(firstActivity)
  const secondSummary = activitySummary(secondActivity)
  const thirdSummary = activitySummary(thirdActivity)
  return { firstSummary, secondSummary, thirdSummary }
}

export async function fetchPosts() {
  return prisma.post.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
}

export async function fetchPostBySlug(slug: string) {
  return prisma.post.findUnique({ where: { slug } })
}
