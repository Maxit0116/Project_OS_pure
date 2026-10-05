'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

interface CheckoutUser {
  email: string
}

interface CheckoutPlan {
  id: string
  name: string
  price: number
}

export function CheckoutForm({
  user,
  plan,
}: {
  user: CheckoutUser
  plan: CheckoutPlan
}) {
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')

  async function handleCheckout() {
    setProcessing(true)
    setMessage('')
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      })
      const result = await response.json() as {
        error?: string
        paymentCaptured?: boolean
      }
      if (!response.ok) throw new Error(result.error || 'plan_selection_failed')
      if (result.paymentCaptured !== false) throw new Error('payment_state_invalid')
      setMessage('Plan selection stored. No payment was processed.')
    } catch {
      setMessage('The plan could not be selected. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="checkout-form">
      <div className="checkout-summary">
        <h3>{plan.name}</h3>
        <p>{formatCurrency(plan.price)}/month</p>
      </div>
      <div className="checkout-user">
        <p>Workspace contact: {user.email}</p>
      </div>
      <p>
        This legacy selector stores a plan in the sample database. It does not
        collect payment details or process a payment.
      </p>
      <button onClick={handleCheckout} disabled={processing}>
        {processing ? 'Selecting plan...' : 'Use this plan'}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  )
}
