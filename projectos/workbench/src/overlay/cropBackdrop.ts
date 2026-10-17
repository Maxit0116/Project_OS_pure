import type { ScreenRect } from '@contracts/spatial-pin'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load backdrop image'))
    img.src = src
  })
}

/** Crop a region from a frozen backdrop (viewport = overlay client space). */
export async function cropBackdropRegionPngBase64(
  backdropDataUrl: string,
  rect: ScreenRect,
  viewport: { width: number; height: number },
): Promise<string> {
  const img = await loadImage(backdropDataUrl)
  const scaleX = img.naturalWidth / Math.max(1, viewport.width)
  const scaleY = img.naturalHeight / Math.max(1, viewport.height)
  const sx = Math.max(0, Math.round(rect.x * scaleX))
  const sy = Math.max(0, Math.round(rect.y * scaleY))
  const sw = Math.max(1, Math.round(rect.width * scaleX))
  const sh = Math.max(1, Math.round(rect.height * scaleY))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  const dataUrl = canvas.toDataURL('image/png')
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}
