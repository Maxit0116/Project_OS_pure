import 'server-only'

import { PLANS } from '@/lib/constants'
import { db } from '@/lib/db'

export interface AdminAnalytics {
  userCount: number
  postCount: number
  activePlanSelectionCount: number
  selectedCatalogMonthlyValue: number
  unsupportedActivePlanCount: number
}

export interface AdminUserRow {
  id: string
  name: string
  email: string
  role: string
  joined: string
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const [userCount, postCount, activeSubscriptions] = await Promise.all([
    db.user.count(),
    db.post.count(),
    db.subscription.findMany({
      where: {
        status: 'active',
        endDate: null,
      },
      select: { planId: true },
    }),
  ])

  let selectedCatalogMonthlyValue = 0
  let unsupportedActivePlanCount = 0
  for (const subscription of activeSubscriptions) {
    const plan = PLANS.find((candidate) => candidate.id === subscription.planId)
    if (plan) {
      selectedCatalogMonthlyValue += plan.price
    } else {
      unsupportedActivePlanCount += 1
    }
  }

  return {
    userCount,
    postCount,
    activePlanSelectionCount: activeSubscriptions.length,
    selectedCatalogMonthlyValue,
    unsupportedActivePlanCount,
  }
}

export async function getAdminUserDirectory(): Promise<AdminUserRow[]> {
  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  })
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    joined: user.createdAt.toISOString(),
  }))
}
