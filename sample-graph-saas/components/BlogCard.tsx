import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export function BlogCard({ post }: { post: any }) {
  return (
    <Link href={`/blog/${post.slug}`} className="blog-card">
      <h3>{post.title}</h3>
      <p>{post.excerpt}</p>
      <time>{formatDate(post.createdAt)}</time>
    </Link>
  )
}
