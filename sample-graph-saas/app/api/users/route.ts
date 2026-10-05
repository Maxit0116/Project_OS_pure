import { NextResponse } from 'next/server'
import { validateToken } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  getRequestWorkspaceContext,
  WorkspaceAccessError,
} from '@/lib/workspace-context'

export async function GET(request: Request) {
  const tokenUser = await validateToken(request)
  if (!tokenUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const context = await getRequestWorkspaceContext(request)
    if (tokenUser.id !== context.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const memberships = await db.membership.findMany({
      where: { teamId: context.activeTeamId },
      orderBy: { joinedAt: 'asc' },
      select: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
    return NextResponse.json(
      memberships.map((membership) => membership.user),
    )
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json(
        { error: 'Workspace access could not be verified.' },
        { status: error.status },
      )
    }
    return NextResponse.json(
      { error: 'Workspace members could not be loaded.' },
      { status: 500 },
    )
  }
}
