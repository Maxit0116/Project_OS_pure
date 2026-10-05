import StatsCard from '@/components/StatsCard'
import { getAdminAnalytics } from '@/lib/admin-analytics'

export const metadata = { title: 'Admin Dashboard' }

export default async function AdminPage() {
  const analytics = await getAdminAnalytics()
  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      <p>Read-only counts from the sample SQLite database.</p>
      <div className="stats-grid">
        <StatsCard title="Users" value={analytics.userCount} />
        <StatsCard
          title="Active plan selections"
          value={analytics.activePlanSelectionCount}
        />
        <StatsCard title="Posts" value={analytics.postCount} />
      </div>
      <p>
        Plan selections are stored fixture state, not paid subscriptions or
        recognized revenue.
      </p>
    </div>
  )
}
