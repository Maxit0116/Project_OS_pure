import { SearchBar } from '@/components/ui/SearchBar'
import { SearchResults } from '@/components/SearchResults'

export const metadata = { title: 'Search' }

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  return (
    <main className="search-page">
      <h1>Search public posts</h1>
      <p>Searches title text only and returns at most ten database-backed posts.</p>
      <SearchBar placeholder="Search post titles..." defaultValue={searchParams.q} />
      {searchParams.q !== undefined ? (
        <SearchResults query={searchParams.q} />
      ) : (
        <p role="status">Enter at least two characters to begin.</p>
      )}
    </main>
  )
}
