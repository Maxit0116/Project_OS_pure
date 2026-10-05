import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SaaS Starter',
  description: 'A sample SaaS application',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
