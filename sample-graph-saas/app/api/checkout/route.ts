import {
  getRequestSession,
  hasExplicitDemoAdminCookie,
} from '@/lib/request-auth'
import {
  PlanSelectionError,
  selectTeamPlan,
  SubscriptionMutationError,
} from '@/lib/payments'

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase()
  const mediaType = contentType?.split(';', 1)[0]?.trim()
  if (mediaType !== 'application/json') {
    return Response.json({ error: 'unsupported_media_type' }, { status: 415 })
  }
  if (!hasExplicitDemoAdminCookie(request)) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 })
  }
  try {
    const session = await getRequestSession(request)
    if (!session) {
      return Response.json({ error: 'unauthenticated' }, { status: 401 })
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 })
    }
    const planId = body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'planId' in body
      ? (body as { planId?: unknown }).planId
      : undefined
    if (typeof planId !== 'string') throw new PlanSelectionError()
    const result = await selectTeamPlan(planId)
    return Response.json({
      subscriptionId: result.subscriptionId,
      planId: result.planId,
      status: result.status,
      paymentCaptured: result.paymentCaptured,
    })
  } catch (error) {
    const status =
      error instanceof PlanSelectionError ||
      error instanceof SubscriptionMutationError
        ? error.status
        : workspaceErrorStatus(error)
    if (status && error instanceof Error) {
      return Response.json({ error: error.message }, { status })
    }
    return Response.json({ error: 'plan_selection_failed' }, { status: 500 })
  }
}

function workspaceErrorStatus(error: unknown): 401 | 403 | 404 | undefined {
  if (!(error instanceof Error) || !('status' in error)) return undefined
  return error.status === 401 || error.status === 403 || error.status === 404
    ? error.status
    : undefined
}
