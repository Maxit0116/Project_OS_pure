import Link from 'next/link'

interface Props {
  user: { name: string; email: string } | null
}

export default function ProfileForm({ user }: Props) {
  if (!user) {
    return <p role="alert">The fixed demo profile could not be loaded.</p>
  }
  return (
    <section aria-label="Read-only demo profile">
      <dl>
        <div>
          <dt>Name</dt>
          <dd>{user.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
      </dl>
      <p>
        This compatibility page is read-only. Use{' '}
        <Link href="/settings">Settings</Link> for the preferences this sample
        actually persists.
      </p>
    </section>
  )
}
