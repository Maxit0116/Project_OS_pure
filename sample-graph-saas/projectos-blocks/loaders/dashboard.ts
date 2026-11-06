import { getSession } from "@/lib/auth";
import { getRecentActivity, getStats, requireDashboardMembership } from "@/lib/data";

// Server-side loader for the dashboard block document: session, membership check, real metrics, recent activity.
export async function loadDashboardViewModel() {
  const session = await getSession();
  if (!session) throw new Error("Authentication required");
  await requireDashboardMembership(session.activeTeamId, session.userId);
  const stats = await getStats(session.activeTeamId);
  const activity = await getRecentActivity(session.activeTeamId);
  return { stats, activity };
}
