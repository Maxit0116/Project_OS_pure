import { getAdminAnalytics } from '@/lib/admin-analytics'

export const metadata = { title: 'Analytics' }

export default async function AnalyticsPage() {
  const analytics = await getAdminAnalytics()
  return (
    <div className="analytics-page">
      <h1>Fixture analytics</h1>
      <p>
        These are current database counts. The sample does not collect a time
        series, payments, invoices, or revenue.
      </p>
      <dl>
        <div>
          <dt>Users</dt>
          <dd>{analytics.userCount}</dd>
        </div>
        <div>
          <dt>Posts</dt>
          <dd>{analytics.postCount}</dd>
        </div>
        <div>
          <dt>Active plan selections</dt>
          <dd>{analytics.activePlanSelectionCount}</dd>
        </div>
        <div>
          <dt>Selected catalog monthly value</dt>
          <dd>${analytics.selectedCatalogMonthlyValue}</dd>
        </div>
        <div>
          <dt>Unsupported active plan IDs</dt>
          <dd>{analytics.unsupportedActivePlanCount}</dd>
        </div>
      </dl>
      <p>
        Catalog value is the sum of static list prices for active stored
        selections. It is not revenue and does not imply a charge.
      </p>
    </div>
  )
}
