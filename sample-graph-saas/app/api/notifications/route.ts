import { db } from '@/lib/db'
import {
  getRequestWorkspaceContext,
  WorkspaceAccessError,
} from '@/lib/workspace-context'

export async function GET(request: Request) {
  try {
    const context = await getRequestWorkspaceContext(request)
    const notifications = await db.notification.findMany({
      where: { userId: context.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        message: true,
        read: true,
        createdAt: true,
      },
    })
    return Response.json(notifications)
  } catch (error) {
    return notificationAccessError(error)
  }
}

export async function POST(request: Request) {
  const user = await validateToken(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json()) as { content?: unknown }
  const content = body.content
  if (typeof content !== 'string' || content.trim() === '') {
    return Response.json({ error: 'Content is required' }, { status: 400 })
  }
  await db.notification.create({ data: { userId: user.id, content } })
  return Response.json({ success: true })
}

export async function PATCH(request: Request) {
  try {
    const context = await getRequestWorkspaceContext(request)
    const result = await db.notification.updateMany({
      where: {
        userId: context.userId,
        read: false,
      },
      data: { read: true },
    })
    return Response.json({ updatedCount: result.count })
  } catch (error) {
    return notificationAccessError(error)
  }
}

function notificationAccessError(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    return Response.json(
      { error: 'Workspace access could not be verified.' },
      { status: error.status },
    )
  }
  return Response.json(
    { error: 'Notifications could not be loaded.' },
    { status: 500 },
  )
}
