import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <div>
      <h1>Demo access</h1>
      <p>
        This fixture has no production authentication or stored passwords.
        Continue as the fixed Demo User in the Northstar Studio workspace.
      </p>
      <LoginForm />
    </div>
  )
}
