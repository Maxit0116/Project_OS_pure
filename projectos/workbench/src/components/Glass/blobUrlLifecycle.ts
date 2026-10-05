export interface BlobUrlLifecycle {
  created(url: string): void
  abandoned(url: string): void
  committed(url: string | null): void
  dispose(): void
}

export function createBlobUrlLifecycle(
  revoke: (url: string) => void = (url) => URL.revokeObjectURL(url),
): BlobUrlLifecycle {
  const pending = new Set<string>()
  let committedUrl: string | null = null

  const revokeOnce = (url: string) => {
    pending.delete(url)
    revoke(url)
  }

  return {
    created(url) {
      pending.add(url)
    },
    abandoned(url) {
      if (url !== committedUrl && pending.has(url)) revokeOnce(url)
    },
    committed(url) {
      if (url) pending.delete(url)
      const previous = committedUrl
      committedUrl = url
      if (previous && previous !== url) revokeOnce(previous)
    },
    dispose() {
      const urls = new Set(pending)
      if (committedUrl) urls.add(committedUrl)
      pending.clear()
      committedUrl = null
      for (const url of urls) revoke(url)
    },
  }
}
