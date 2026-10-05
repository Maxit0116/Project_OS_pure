import { db } from '@/lib/db'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim() ?? ''
  if (query.length < 2) return Response.json({ posts: [] })
  const posts = await db.post.findMany({
    where: { title: { contains: query } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      createdAt: true,
    },
  })
  return Response.json({ posts })
}
