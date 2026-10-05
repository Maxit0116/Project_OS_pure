'use client'

export function ShareButton({ url }: { url: string }) {
  function handleShare() {
    navigator.clipboard.writeText(`${window.location.origin}${url}`)
  }

  return (
    <button onClick={handleShare} className="share-btn">
      Share
    </button>
  )
}
