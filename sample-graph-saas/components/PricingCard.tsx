import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

interface Plan {
  id: string
  name: string
  price: number
  features: string[]
  popular?: boolean
}

export function PricingCard({ plan }: { plan: Plan }) {
  return (
    <div className={`pricing-card ${plan.popular ? 'popular' : ''}`}>
      <h3>{plan.name}</h3>
      <div className="price">{formatCurrency(plan.price)}/mo</div>
      <ul>
        {plan.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <Link href={`/billing?plan=${plan.id}`} className="btn-primary">
        View in workspace
      </Link>
    </div>
  )
}
