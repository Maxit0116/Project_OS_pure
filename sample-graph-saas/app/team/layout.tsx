import WorkspaceNav from '@/components/WorkspaceNav'

export const dynamic = 'force-dynamic'

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <WorkspaceNav />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  )
}
