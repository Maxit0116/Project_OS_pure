import {
  cancelBillingSubscriptionAction,
  selectBillingPlanAction,
} from '@/app/billing/actions'
import {
  BillingCancelForm,
  BillingPlanForm,
} from '@/components/BillingForms'
import { PLANS } from '@/lib/constants'
import { getTeamBillingOverview } from '@/lib/payments'

export const metadata = { title: 'Billing' }

export default async function BillingPage() {
  const billing = await getTeamBillingOverview()
  const subscription = billing.subscription
  const exactActiveSelection = subscription?.status === 'active' &&
    subscription.endDate === null

  return (
    <section style={{ maxWidth: 1040, padding: 32 }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ color: '#4f46e5', fontWeight: 700 }}>{billing.teamName}</p>
        <h1>Billing and subscription</h1>
        <p>
          This sample stores a team plan selection in SQLite. It has no payment
          provider and does not create charges, invoices, refunds, or receipts.
        </p>
        <p>
          Prices and features are static catalog copy only. Project limits,
          member limits, analytics, support, and SLA terms are not enforced or
          provisioned.
        </p>
      </header>

      <section aria-labelledby="current-subscription">
        <h2 id="current-subscription">Stored subscription state</h2>
        {!subscription ? (
          <p role="status">No subscription selection is stored for this workspace.</p>
        ) : (
          <dl style={detailsStyle}>
            <div>
              <dt>Plan</dt>
              <dd>
                {subscription.planSupported
                  ? subscription.planName
                  : `Unsupported stored plan (${subscription.planId})`}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {subscription.statusSupported
                  ? subscription.status
                  : `Unsupported stored status (${subscription.status})`}
              </dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd><BillingDate value={subscription.startDate} /></dd>
            </div>
            <div>
              <dt>Ended</dt>
              <dd>
                {subscription.endDate
                  ? <BillingDate value={subscription.endDate} />
                  : 'Not ended'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {billing.canManage ? (
        <>
          <section aria-labelledby="plan-catalog" style={{ marginTop: 32 }}>
            <h2 id="plan-catalog">Static plan catalog</h2>
            <div style={catalogStyle}>
              {PLANS.map((plan) => (
                <BillingPlanForm
                  key={plan.id}
                  action={selectBillingPlanAction}
                  current={Boolean(
                    exactActiveSelection && subscription?.planId === plan.id,
                  )}
                  plan={plan}
                />
              ))}
            </div>
          </section>
          {exactActiveSelection ? (
            <section aria-labelledby="cancel-selection" style={{ marginTop: 32 }}>
              <h2 id="cancel-selection">Cancel stored selection</h2>
              <p>
                Cancellation changes only this sample database. No external
                payment or service is cancelled.
              </p>
              <BillingCancelForm action={cancelBillingSubscriptionAction} />
            </section>
          ) : null}
        </>
      ) : (
        <p role="status" style={{ marginTop: 32 }}>
          Billing is read-only unless you are a current workspace owner or admin.
        </p>
      )}
    </section>
  )
}

function BillingDate({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC' })}
    </time>
  )
}

const detailsStyle = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
} as const

const catalogStyle = {
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
} as const
