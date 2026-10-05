'use client'

import { useFormState, useFormStatus } from 'react-dom'

type ThemePreference = 'light' | 'dark'

type SettingsActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type SettingsAction = (
  previous: SettingsActionState,
  formData: FormData,
) => Promise<SettingsActionState>

const initialState: SettingsActionState = { status: 'idle' }

export function SettingsForm({
  action,
  emailNotifications,
  theme,
}: {
  action: SettingsAction
  emailNotifications: boolean
  theme: ThemePreference | null
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={formStyle}>
      <label style={fieldStyle}>
        <span style={{ fontWeight: 700 }}>Email notifications</span>
        <span>
          <input
            defaultChecked={emailNotifications}
            name="emailNotifications"
            type="checkbox"
            value="enabled"
          />{' '}
          Store email notifications as enabled
        </span>
        <small>
          This sample stores the preference but does not send real email.
        </small>
      </label>

      <label style={fieldStyle}>
        <span style={{ fontWeight: 700 }}>Theme preference</span>
        <select defaultValue={theme ?? ''} name="theme" required>
          <option disabled value="">Choose a supported theme</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <small>
          This sample stores the preference but does not apply a global theme.
        </small>
      </label>

      <SettingsSubmitButton />
      {state.status === 'idle' ? null : (
        <p role={state.status === 'error' ? 'alert' : 'status'}>
          {state.message}
        </p>
      )}
    </form>
  )
}

function SettingsSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Saving...' : 'Save preferences'}
    </button>
  )
}

const formStyle = {
  display: 'grid',
  gap: 20,
} as const

const fieldStyle = {
  display: 'grid',
  gap: 8,
} as const
