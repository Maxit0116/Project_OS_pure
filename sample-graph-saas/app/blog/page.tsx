import { BlogCard } from '@/components/BlogCard'
import { fetchPosts } from '@/lib/data'

export const metadata = { title: 'Blog' }

export default async function BlogPage() {
  const posts = await fetchPosts()
  return (
    <main className="blog-page">
      <h1>Blog</h1>
      {posts.length === 0 ? (
        <p role="status">No posts have been published in the sample database.</p>
      ) : (
        <div className="post-grid">
          {posts.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </main>
  )
}
