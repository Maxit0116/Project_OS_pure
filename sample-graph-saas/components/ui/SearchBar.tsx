'use client'

import { useRouter } from 'next/navigation'

export function SearchBar({ placeholder, defaultValue }: { placeholder: string; defaultValue?: string }) {
  const router = useRouter()

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q') as string
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <form onSubmit={handleSearch} className="search-bar">
      <input name="q" placeholder={placeholder} defaultValue={defaultValue} />
    </form>
  )
}
