import Link from 'next/link'
import { CheckoutForm } from '@/components/CheckoutForm'
import { getCurrentUser } from '@/lib/auth'
import { PLANS } from '@/lib/constants'

export const metadata = { title: 'Checkout' }

export default async function CheckoutPage({ searchParams }: { searchParams: { plan?: string } }) {
  const user = await getCurrentUser()
  const requestedPlan = searchParams.plan
  const matchedPlan = PLANS.find((candidate) => candidate.id === requestedPlan)
  const invalidPlan = requestedPlan !== undefined && matchedPlan === undefined
  const plan = matchedPlan ?? PLANS[0]
  return (
    <main className="checkout-page">
      <h1>Choose a Workspace Plan</h1>
      <p>
        This legacy route remains available for compatibility. The workspace
        billing page is the primary subscription-management surface.
      </p>
      {invalidPlan ? (
        <p role="alert">
          The requested plan is not in the static catalog. Starter is shown
          without changing the stored workspace selection.
        </p>
      ) : null}
      <CheckoutForm user={user} plan={plan} />
      <p><Link href="/billing">Open workspace billing</Link></p>
    </main>
  )
}
