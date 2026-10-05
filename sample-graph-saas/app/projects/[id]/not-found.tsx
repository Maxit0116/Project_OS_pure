import Link from 'next/link'

export default function ProjectNotFound() {
  return (
    <section style={{ padding: 32 }}>
      <h1>Project not found</h1>
      <p>The project does not exist in your active team, or it is no longer available.</p>
      <Link href="/projects">Return to projects</Link>
    </section>
  )
}
