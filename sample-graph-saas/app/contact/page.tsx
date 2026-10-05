import { ContactForm } from '@/components/ContactForm'

export const metadata = { title: 'Contact' }

export default function ContactPage() {
  return (
    <main className="contact-page">
      <h1>Contact</h1>
      <ContactForm />
    </main>
  )
}
