import { revalidatePath } from 'next/cache'
import { validateToken } from '@/lib/auth'
import {
  getRequestSession,
  hasExplicitDemoAdminCookie,
} from '@/lib/request-auth'
import {
  getCurrentUserSettings,
  SettingsMutationError,
  updateCurrentUserSettings,
} from '@/lib/settings'
import { WorkspaceAccessError } from '@/lib/workspace-context'

export async function GET(request: Request) {
  if (!(await hasSettingsApiSession(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return Response.json(settingsDto(await getCurrentUserSettings()))
  } catch (error) {
    return settingsApiError(error)
  }
}

export async function PUT(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase()
  const mediaType = contentType?.split(';', 1)[0]?.trim()
  if (mediaType !== 'application/json') {
    return Response.json({ error: 'unsupported_media_type' }, { status: 415 })
  }
  if (
    !hasExplicitDemoAdminCookie(request) ||
    !(await hasSettingsApiSession(request))
  ) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid settings payload' }, { status: 400 })
  }
  const input = settingsInput(body)
  if (!input) {
    return Response.json({ error: 'Invalid settings payload' }, { status: 400 })
  }
  let result: Awaited<ReturnType<typeof updateCurrentUserSettings>>
  try {
    result = await updateCurrentUserSettings(input)
  } catch (error) {
    return settingsApiError(error)
  }
  if (result.changed) revalidateSettingsViews()
  return Response.json({
    emailNotifications: result.emailNotifications,
    theme: result.theme,
    changed: result.changed,
  })
}

function revalidateSettingsViews(): void {
  try {
    revalidatePath('/settings')
    revalidatePath('/dashboard')
  } catch {
    // The durable transaction already committed; cache refresh cannot undo it.
  }
}

async function hasSettingsApiSession(request: Request): Promise<boolean> {
  const session = await getRequestSession(request)
  const tokenUser = await validateToken(request)
  const bearer = request.headers.get('authorization')
  return Boolean(
    session &&
    tokenUser &&
    tokenUser.id === session.userId &&
    bearer === `Bearer ${session.token}`,
  )
}

function settingsInput(value: unknown): {
  emailNotifications: boolean
  theme: unknown
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).sort().join(',') !==
      'emailNotifications,theme' ||
    typeof record['emailNotifications'] !== 'boolean'
  ) return null
  return {
    emailNotifications: record['emailNotifications'],
    theme: record['theme'],
  }
}

function settingsDto(settings: Awaited<ReturnType<typeof getCurrentUserSettings>>) {
  return {
    emailNotifications: settings.emailNotifications,
    theme: settings.theme,
    themeSupported: settings.themeSupported,
    persisted: settings.persisted,
    updatedAt: settings.updatedAt,
  }
}

function settingsApiError(error: unknown) {
  if (error instanceof SettingsMutationError) {
    return Response.json(
      { error: 'Invalid or stale settings' },
      { status: error.code === 'settings_changed' ? 409 : 400 },
    )
  }
  if (error instanceof WorkspaceAccessError) {
    return Response.json(
      { error: 'Workspace access could not be verified' },
      { status: error.status === 401 ? 401 : 403 },
    )
  }
  return Response.json({ error: 'Settings update failed' }, { status: 500 })
}
