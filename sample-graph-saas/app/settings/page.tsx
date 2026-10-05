import { updateSettingsAction } from '@/app/settings/actions'
import { SettingsForm } from '@/components/SettingsForm'
import { getCurrentUserSettings } from '@/lib/settings'

export const metadata = { title: 'Personal settings' }

export default async function SettingsPage() {
  const settings = await getCurrentUserSettings()
  return (
    <section style={{ maxWidth: 720, padding: 32 }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ color: '#4f46e5', fontWeight: 700 }}>Personal preferences</p>
        <h1>Settings</h1>
        <p>
          Signed in as <strong>{settings.userName}</strong> ({settings.userEmail}).
          These preferences belong only to this account.
        </p>
      </header>

      {!settings.persisted ? (
        <p role="status">
          No settings row exists yet. The form shows the documented defaults and
          will save them when submitted.
        </p>
      ) : null}
      {!settings.themeSupported ? (
        <p role="alert">
          The stored theme is unsupported. Choose Light or Dark before saving.
        </p>
      ) : null}

      <SettingsForm
        action={updateSettingsAction}
        emailNotifications={settings.emailNotifications}
        theme={settings.theme}
      />
    </section>
  )
}
