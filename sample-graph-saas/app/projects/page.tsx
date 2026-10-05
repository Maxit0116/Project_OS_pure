import { Suspense } from 'react'
import Link from 'next/link'
import { createProjectAction } from '@/app/projects/actions'
import { CreateProjectForm } from '@/components/ProjectForms'
import { listWorkspaceProjects } from '@/lib/projects'

export const metadata = { title: 'Projects' }

export default function ProjectsPage() {
  return (
    <section style={{ padding: 32 }}>
      <header>
        <p style={{ color: '#4f46e5', fontWeight: 700 }}>Active workspace</p>
        <h1>Projects</h1>
        <p>Active team initiatives, their owners, and their current task counts.</p>
      </header>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
        <Suspense fallback={<ProjectListLoading />}>
          <ActiveProjectList />
        </Suspense>
        <CreateProjectForm action={createProjectAction} />
      </div>
    </section>
  )
}

async function ActiveProjectList() {
  const projects = await listWorkspaceProjects()
  return (
    <section aria-labelledby="active-projects-heading">
      <h2 id="active-projects-heading">Active projects</h2>
      {projects.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 24 }}>
          <h3>No active projects</h3>
          <p>Create the first project for this workspace.</p>
        </div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={cellStyle}>Project</th>
              <th scope="col" style={cellStyle}>Creator</th>
              <th scope="col" style={cellStyle}>Current tasks</th>
              <th scope="col" style={cellStyle}>Updated</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td style={cellStyle}>
                  <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  <p style={{ marginBottom: 0 }}>{project.description || 'No description provided.'}</p>
                </td>
                <td style={cellStyle}>{project.creatorName}</td>
                <td style={cellStyle}>{project.currentTaskCount}</td>
                <td style={cellStyle}>
                  <time dateTime={project.updatedAt}>
                    {new Date(project.updatedAt).toLocaleDateString('en-US', {
                      timeZone: 'UTC',
                    })}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function ProjectListLoading() {
  return (
    <section aria-labelledby="active-projects-loading" aria-busy="true" aria-live="polite">
      <h2 id="active-projects-loading">Active projects</h2>
      <p>Loading workspace projects...</p>
    </section>
  )
}

const cellStyle = {
  borderBottom: '1px solid #e5e7eb',
  padding: 12,
  textAlign: 'left',
  verticalAlign: 'top',
} as const
