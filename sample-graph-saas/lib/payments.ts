import 'server-only'

import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { PLANS } from '@/lib/constants'
import { db } from '@/lib/db'
import {
  requireWorkspaceMembership,
  WorkspaceAccessError,
  type WorkspaceRole,
} from '@/lib/workspace-context'

const BILLING_MANAGEMENT_ROLES: readonly WorkspaceRole[] = ['owner', 'admin']

type KnownPlan = (typeof PLANS)[number]

export interface TeamBillingOverview {
  teamName: string
  viewerRole: WorkspaceRole
  canManage: boolean
  subscription: {
    planId: string
    planName: string | null
    planSupported: boolean
    status: string
    statusSupported: boolean
    startDate: string
    endDate: string | null
    updatedAt: string
  } | null
}

export class PlanSelectionError extends Error {
  readonly status = 400

  constructor() {
    super('invalid_plan')
    this.name = 'PlanSelectionError'
  }
}

export class SubscriptionMutationError extends Error {
  readonly status: 404 | 409

  constructor(
    readonly code:
      | 'subscription_missing'
      | 'subscription_state_unsupported'
      | 'subscription_changed',
  ) {
    super(code)
    this.name = 'SubscriptionMutationError'
    this.status = code === 'subscription_missing' ? 404 : 409
  }
}

export async function getTeamBillingOverview(): Promise<TeamBillingOverview> {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    const viewerRole = await requireWorkspaceMembership(transaction, session)
    const team = await transaction.team.findUnique({
      where: { id: session.activeTeamId },
      select: {
        name: true,
        subscription: {
          select: {
            planId: true,
            status: true,
            startDate: true,
            endDate: true,
            updatedAt: true,
          },
        },
      },
    })
    if (!team) throw new WorkspaceAccessError('membership_missing', 403)
    const plan = team.subscription
      ? knownPlan(team.subscription.planId)
      : undefined
    return {
      teamName: team.name,
      viewerRole,
      canManage: BILLING_MANAGEMENT_ROLES.includes(viewerRole),
      subscription: team.subscription
        ? {
            planId: team.subscription.planId,
            planName: plan?.name ?? null,
            planSupported: Boolean(plan),
            status: team.subscription.status,
            statusSupported: isSupportedSubscriptionState(
              team.subscription.status,
              team.subscription.endDate,
            ),
            startDate: team.subscription.startDate.toISOString(),
            endDate: team.subscription.endDate?.toISOString() ?? null,
            updatedAt: team.subscription.updatedAt.toISOString(),
          }
        : null,
    }
  })
}

export async function selectTeamPlan(planId: string) {
  const plan = knownPlan(planId)
  if (!plan) throw new PlanSelectionError()
  const session = await requiredSession()

  return db.$transaction(async (transaction) => {
    await lockActiveTeam(transaction, session.activeTeamId)
    await requireWorkspaceMembership(
      transaction,
      session,
      BILLING_MANAGEMENT_ROLES,
    )
    const existing = await transaction.subscription.findUnique({
      where: { teamId: session.activeTeamId },
      select: {
        id: true,
        planId: true,
        status: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
      },
    })
    if (
      existing &&
      existing.planId === plan.id &&
      existing.status === 'active' &&
      existing.endDate === null
    ) {
      return subscriptionResult(existing, false)
    }

    const subscription = existing
      ? await updateSubscriptionPlan(
          transaction,
          session.activeTeamId,
          existing,
          plan,
        )
      : await transaction.subscription.create({
          data: {
            teamId: session.activeTeamId,
            planId: plan.id,
            status: 'active',
            startDate: new Date(),
          },
          select: {
            id: true,
            planId: true,
            status: true,
          },
        })
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        action: 'plan_selected',
        entityType: 'subscription',
        entityId: subscription.id,
        summary: `Selected the ${plan.name} plan for the workspace.`,
      },
    })
    return subscriptionResult(subscription, true)
  })
}

export async function cancelTeamSubscription() {
  const session = await requiredSession()
  return db.$transaction(async (transaction) => {
    await lockActiveTeam(transaction, session.activeTeamId)
    await requireWorkspaceMembership(
      transaction,
      session,
      BILLING_MANAGEMENT_ROLES,
    )
    const existing = await transaction.subscription.findUnique({
      where: { teamId: session.activeTeamId },
      select: {
        id: true,
        planId: true,
        status: true,
        endDate: true,
        updatedAt: true,
      },
    })
    if (!existing) {
      throw new SubscriptionMutationError('subscription_missing')
    }
    if (existing.status === 'cancelled' && existing.endDate !== null) {
      return {
        subscriptionId: existing.id,
        planId: existing.planId,
        status: existing.status,
        changed: false,
      }
    }
    if (existing.status !== 'active' || existing.endDate !== null) {
      throw new SubscriptionMutationError('subscription_state_unsupported')
    }

    const endDate = new Date()
    const updated = await transaction.subscription.updateMany({
      where: {
        id: existing.id,
        teamId: session.activeTeamId,
        updatedAt: existing.updatedAt,
      },
      data: {
        status: 'cancelled',
        endDate,
      },
    })
    if (updated.count !== 1) {
      throw new SubscriptionMutationError('subscription_changed')
    }
    await transaction.activityLog.create({
      data: {
        teamId: session.activeTeamId,
        actorId: session.userId,
        action: 'subscription_cancelled',
        entityType: 'subscription',
        entityId: existing.id,
        summary: 'Cancelled the workspace subscription selection.',
      },
    })
    return {
      subscriptionId: existing.id,
      planId: existing.planId,
      status: 'cancelled' as const,
      changed: true,
    }
  })
}

async function updateSubscriptionPlan(
  transaction: Prisma.TransactionClient,
  teamId: string,
  existing: {
    id: string
    planId: string
    status: string
    startDate: Date
    endDate: Date | null
    updatedAt: Date
  },
  plan: KnownPlan,
) {
  const staysActive = existing.status === 'active' && existing.endDate === null
  const updated = await transaction.subscription.updateMany({
    where: {
      id: existing.id,
      teamId,
      updatedAt: existing.updatedAt,
    },
    data: staysActive
      ? { planId: plan.id }
      : {
          planId: plan.id,
          status: 'active',
          startDate: new Date(),
          endDate: null,
        },
  })
  if (updated.count !== 1) {
    throw new SubscriptionMutationError('subscription_changed')
  }
  return {
    id: existing.id,
    planId: plan.id,
    status: 'active',
  }
}

async function lockActiveTeam(
  transaction: Prisma.TransactionClient,
  teamId: string,
): Promise<void> {
  // The SQL is constant and the team ID is bound. Avoiding a tagged template
  // also keeps the editor's unchanged all-source token proof complete.
  const locked = await transaction.$executeRawUnsafe(
    'UPDATE "Team" SET "updatedAt" = "updatedAt" WHERE "id" = ?',
    teamId,
  )
  if (locked !== 1) {
    throw new WorkspaceAccessError('membership_missing', 403)
  }
}

function subscriptionResult(
  subscription: {
    id: string
    planId: string
    status: string
  },
  changed: boolean,
) {
  return {
    subscriptionId: subscription.id,
    planId: subscription.planId,
    status: subscription.status,
    paymentCaptured: false as const,
    changed,
  }
}

function knownPlan(planId: string): KnownPlan | undefined {
  return PLANS.find((plan) => plan.id === planId)
}

function isSupportedSubscriptionState(
  status: string,
  endDate: Date | null,
): boolean {
  return (status === 'active' && endDate === null) ||
    (status === 'cancelled' && endDate !== null)
}

async function requiredSession() {
  const session = await getSession()
  if (!session) throw new WorkspaceAccessError('unauthenticated', 401)
  return session
}
