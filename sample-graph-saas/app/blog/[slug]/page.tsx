import { fetchPostBySlug } from '@/lib/data'
import { ShareButton } from '@/components/ui/ShareButton'
import { notFound } from 'next/navigation'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await fetchPostBySlug(params.slug)
  return { title: post?.title || 'Not Found' }
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await fetchPostBySlug(params.slug)
  if (!post) notFound()
  return (
    <article className="blog-post">
      <h1>{post.title}</h1>
      <time dateTime={post.createdAt.toISOString()}>
        {post.createdAt.toISOString().slice(0, 10)}
      </time>
      <div>{post.content}</div>
      <ShareButton url={`/blog/${params.slug}`} />
    </article>
  )
}
