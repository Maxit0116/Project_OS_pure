'use client'

import { useEffect, useState } from 'react'
import { BlogCard } from '@/components/BlogCard'

interface SearchPost {
  id: string
  title: string
  slug: string
  excerpt: string
  createdAt: string
}

type SearchState =
  | { status: 'loading'; posts: SearchPost[] }
  | { status: 'ready'; posts: SearchPost[] }
  | { status: 'error'; posts: SearchPost[] }

export function SearchResults({ query }: { query: string }) {
  const [state, setState] = useState<SearchState>({
    status: 'loading',
    posts: [],
  })

  useEffect(() => {
    if (query.trim().length < 2) {
      setState({ status: 'ready', posts: [] })
      return
    }
    setState({ status: 'loading', posts: [] })
    let active = true
    async function search() {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        if (!response.ok) throw new Error('search_request_failed')
        const payload: unknown = await response.json()
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('posts' in payload) ||
          !Array.isArray(payload.posts)
        ) {
          throw new Error('search_shape_invalid')
        }
        if (active) {
          setState({ status: 'ready', posts: payload.posts as SearchPost[] })
        }
      } catch {
        if (active) setState({ status: 'error', posts: [] })
      }
    }
    void search()
    return () => {
      active = false
    }
  }, [query])

  if (query.trim().length < 2) {
    return <p role="status">Enter at least two characters to search public posts.</p>
  }
  if (state.status === 'loading') {
    return <p role="status">Searching posts...</p>
  }
  if (state.status === 'error') {
    return <p role="alert">Search could not be completed. Try again later.</p>
  }
  if (state.posts.length === 0) {
    return <p role="status">No public posts match this search.</p>
  }

  return (
    <div className="search-results">
      <section>
        <h2>Posts ({state.posts.length})</h2>
        {state.posts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </section>
    </div>
  )
}
