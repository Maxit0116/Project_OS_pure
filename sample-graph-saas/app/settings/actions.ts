'use server'

import { revalidatePath } from 'next/cache'
import {
  SettingsMutationError,
  updateCurrentUserSettings,
} from '@/lib/settings'
import { WorkspaceAccessError } from '@/lib/workspace-context'

export type SettingsActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export async function updateSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const notificationValues = formData.getAll('emailNotifications')
  const themeValues = formData.getAll('theme')
  if (
    notificationValues.length > 1 ||
    (notificationValues.length === 1 &&
      notificationValues[0] !== 'enabled')
  ) {
    return settingsActionError(
      new SettingsMutationError('invalid_email_notifications'),
    )
  }
  if (themeValues.length !== 1) {
    return settingsActionError(new SettingsMutationError('invalid_theme'))
  }

  let result: Awaited<ReturnType<typeof updateCurrentUserSettings>>
  try {
    result = await updateCurrentUserSettings({
      emailNotifications: notificationValues.length === 1,
      theme: themeValues[0],
    })
  } catch (error) {
    return settingsActionError(error)
  }
  if (result.changed) revalidateSettingsViews()
  return {
    status: 'success',
    message: result.changed
      ? 'Personal preferences saved.'
      : 'Personal preferences were already up to date.',
  }
}

function revalidateSettingsViews(): void {
  try {
    revalidatePath('/settings')
    revalidatePath('/dashboard')
  } catch {
    // The durable transaction already committed; cache refresh cannot undo it.
  }
}

function settingsActionError(error: unknown): SettingsActionState {
  if (error instanceof SettingsMutationError) {
    if (error.code === 'invalid_theme') {
      return {
        status: 'error',
        message: 'Choose the Light or Dark theme preference.',
      }
    }
    if (error.code === 'invalid_email_notifications') {
      return {
        status: 'error',
        message: 'The email-notification preference is invalid.',
      }
    }
    return {
      status: 'error',
      message: 'These settings changed. Refresh and try again.',
    }
  }
  if (error instanceof WorkspaceAccessError) {
    return {
      status: 'error',
      message: 'Your workspace access could not be verified.',
    }
  }
  return {
    status: 'error',
    message: 'Personal preferences could not be saved. Please try again.',
  }
}
