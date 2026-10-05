/**
 * Physically-based refraction displacement map for a rounded-rect "squircle
 * dome" lens — computed, not painted. Port of the optics described in
 * https://glass.outpacestudios.com/
 *
 * For every pixel: distance to the rounded-rect edge -> dome depth -> surface
 * slope -> Snell's law bend -> displacement along the edge normal. The R/G
 * channels store the x/y offset (128 = no displacement); B stores a specular
 * height used for an optional rim highlight.
 */

const REFRACTIVE_INDEX = 1.5
const RIM_DEPTH_RATIO = 0.42

export interface DisplacementMapOptions {
  width: number
  height: number
  radius: number
  /** Max pixel displacement at the rim. */
  gain?: number
}

function roundedRectSDF(px: number, py: number, w: number, h: number, r: number): number {
  const qx = Math.abs(px - w / 2) - (w / 2 - r)
  const qy = Math.abs(py - h / 2) - (h / 2 - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  const outside = Math.hypot(ax, ay)
  const inside = Math.min(Math.max(qx, qy), 0)
  return outside + inside - r
}

/** Squircle dome slope, flat at centre (x=1) and steep at the rim (x=0). */
function domeSlope(x: number): number {
  const oneMinusX = 1 - x
  const numerator = oneMinusX ** 3
  const denom = Math.max(1e-6, (1 - oneMinusX ** 4) ** 0.75)
  return numerator / denom
}

function snellBend(slope: number): number {
  const thetaI = Math.atan(slope)
  const sinT = Math.sin(thetaI) / REFRACTIVE_INDEX
  const thetaT = Math.asin(Math.max(-1, Math.min(1, sinT)))
  return Math.sin(thetaI - thetaT)
}

export function buildDisplacementMapCanvas({
  width,
  height,
  radius,
  gain = 14,
}: DisplacementMapOptions): HTMLCanvasElement {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(w, h)
  const rim = Math.max(10, Math.min(w, h) * RIM_DEPTH_RATIO)
  const step = 1

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4
      const sdf = roundedRectSDF(px, py, w, h, radius)
      const distFromEdge = -sdf
      const depth = Math.min(1, Math.max(0, distFromEdge / rim))
      const x = depth

      let dispX = 0
      let dispY = 0
      let specular = 0

      if (distFromEdge < rim) {
        const bend = snellBend(domeSlope(x))
        const sdfX1 = roundedRectSDF(px + step, py, w, h, radius)
        const sdfX0 = roundedRectSDF(px - step, py, w, h, radius)
        const sdfY1 = roundedRectSDF(px, py + step, w, h, radius)
        const sdfY0 = roundedRectSDF(px, py - step, w, h, radius)
        let nx = (sdfX1 - sdfX0) / (2 * step)
        let ny = (sdfY1 - sdfY0) / (2 * step)
        const len = Math.hypot(nx, ny) || 1
        nx /= len
        ny /= len
        dispX = nx * bend * gain
        dispY = ny * bend * gain
        specular = Math.round(bend * 255)
      }

      imageData.data[idx] = Math.max(0, Math.min(255, 128 + dispX))
      imageData.data[idx + 1] = Math.max(0, Math.min(255, 128 + dispY))
      imageData.data[idx + 2] = specular
      imageData.data[idx + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

export function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('displacement map: canvas.toBlob returned null'))
        return
      }
      resolve(URL.createObjectURL(blob))
    }, 'image/png')
  })
}
