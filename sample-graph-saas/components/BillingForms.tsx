'use client'

import { useFormState, useFormStatus } from 'react-dom'

type BillingActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type BillingAction = (
  previous: BillingActionState,
  formData: FormData,
) => Promise<BillingActionState>

interface BillingPlan {
  id: string
  name: string
  price: number
  features: readonly string[]
}

const initialState: BillingActionState = { status: 'idle' }

export function BillingPlanForm({
  action,
  current,
  plan,
}: {
  action: BillingAction
  current: boolean
  plan: BillingPlan
}) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={planStyle}>
      <input name="planId" type="hidden" value={plan.id} />
      <div>
        <h2>{plan.name}</h2>
        <p>${plan.price} per month in the static demo catalog</p>
      </div>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <PlanSubmitButton current={current} />
      <ActionMessage state={state} />
    </form>
  )
}

export function BillingCancelForm({ action }: { action: BillingAction }) {
  const [state, formAction] = useFormState(action, initialState)
  return (
    <form action={formAction} style={{ display: 'grid', gap: 8 }}>
      <CancelSubmitButton />
      <ActionMessage state={state} />
    </form>
  )
}

function PlanSubmitButton({ current }: { current: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Saving...' : current ? 'Confirm current plan' : 'Select plan'}
    </button>
  )
}

function CancelSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Cancelling...' : 'Cancel subscription selection'}
    </button>
  )
}

function ActionMessage({ state }: { state: BillingActionState }) {
  return state.status === 'idle' ? null : (
    <p role={state.status === 'error' ? 'alert' : 'status'}>
      {state.message}
    </p>
  )
}

const planStyle = {
  border: '1px solid #d1d5db',
  borderRadius: 12,
  display: 'grid',
  gap: 12,
  padding: 20,
} as const
