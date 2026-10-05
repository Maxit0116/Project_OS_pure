export default function AdminLoading() {
  return (
    <main aria-busy="true" aria-live="polite" style={{ padding: 32 }}>
      <h1>Loading workspace</h1>
      <p>Reading the sample database...</p>
    </main>
  )
}
