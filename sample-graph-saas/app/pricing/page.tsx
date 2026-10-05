import { PricingCard } from '@/components/PricingCard'
import { PLANS } from '@/lib/constants'

export const metadata = { title: 'Pricing' }

export default function PricingPage() {
  return (
    <main className="pricing-page">
      <h1>Choose Your Plan</h1>
      <p>
        This is static sample catalog copy. Prices, limits, support, and service
        levels are not charged, enforced, or provisioned.
      </p>
      <div className="plans-grid">
        {PLANS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>
    </main>
  )
}
