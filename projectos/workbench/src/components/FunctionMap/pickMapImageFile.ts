import type { ImageMimeType } from '@contracts/index'
import { MAP_IMAGE_MAX_BYTES } from '@contracts/index'
import { isDesktopApp } from '../../data/clientMode'

export interface PickedMapImageFile {
  fileName: string
  mimeType: ImageMimeType
  width: number
  height: number
  dataUrl: string
}

export type PickMapImageFailureReason =
  | 'cancelled'
  | 'too_large'
  | 'invalid_type'
  | 'failed'

export type PickMapImageResult =
  | { ok: true; file: PickedMapImageFile }
  | { ok: false; reason: PickMapImageFailureReason }

export const WEB_IMAGE_PICKER_FOCUS_CANCEL_DELAY_MS = 250
export const WEB_IMAGE_PICKER_TIMEOUT_MS = 60_000

function mimeTypeFromFileName(fileName: string): ImageMimeType | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  return null
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = dataUrl
  })
}

async function pickMapImageFileDesktop(): Promise<PickMapImageResult> {
  const bridge = window.projectOS
  if (!bridge) {
    return { ok: false, reason: 'failed' }
  }

  const result = await bridge.shell.pickImageFile()
  if (!result) {
    return { ok: false, reason: 'cancelled' }
  }
  if ('error' in result) {
    if (result.error === 'too_large') return { ok: false, reason: 'too_large' }
    if (result.error === 'invalid_type') return { ok: false, reason: 'invalid_type' }
    return { ok: false, reason: 'failed' }
  }

  return {
    ok: true,
    file: {
      fileName: result.fileName,
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      dataUrl: result.dataUrl,
    },
  }
}

async function pickMapImageFileWeb(): Promise<PickMapImageResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,.jpg,.jpeg,.png'
    input.hidden = true
    let dialogSettled = false
    let focusTimer: ReturnType<typeof globalThis.setTimeout> | null = null
    let timeoutTimer: ReturnType<typeof globalThis.setTimeout> | null = null

    const cleanup = () => {
      input.removeEventListener('change', handleChange)
      input.removeEventListener('cancel', handleCancel)
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleWindowFocus)
      }
      if (focusTimer !== null) {
        globalThis.clearTimeout(focusTimer)
        focusTimer = null
      }
      if (timeoutTimer !== null) {
        globalThis.clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      input.remove()
    }

    const finishDialog = (result: PickMapImageResult) => {
      if (dialogSettled) return
      dialogSettled = true
      cleanup()
      resolve(result)
    }

    const handleChange = () => {
      if (dialogSettled) return
      dialogSettled = true
      const file = input.files?.[0]
      cleanup()
      if (!file) {
        resolve({ ok: false, reason: 'cancelled' })
        return
      }

      const mimeType = mimeTypeFromFileName(file.name) ?? (file.type as ImageMimeType | '')
      if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
        resolve({ ok: false, reason: 'invalid_type' })
        return
      }
      if (file.size > MAP_IMAGE_MAX_BYTES) {
        resolve({ ok: false, reason: 'too_large' })
        return
      }

      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : null
        if (!dataUrl) {
          resolve({ ok: false, reason: 'failed' })
          return
        }

        try {
          const dimensions = await loadImageDimensions(dataUrl)
          resolve({
            ok: true,
            file: {
              fileName: file.name,
              mimeType,
              width: dimensions.width,
              height: dimensions.height,
              dataUrl,
            },
          })
        } catch {
          resolve({ ok: false, reason: 'failed' })
        }
      }
      reader.onerror = () => resolve({ ok: false, reason: 'failed' })
      reader.readAsDataURL(file)
    }

    const handleCancel = () => {
      finishDialog({ ok: false, reason: 'cancelled' })
    }

    const handleWindowFocus = () => {
      if (dialogSettled) return
      if (focusTimer !== null) globalThis.clearTimeout(focusTimer)
      focusTimer = globalThis.setTimeout(() => {
        focusTimer = null
        if (!input.files?.length) {
          finishDialog({ ok: false, reason: 'cancelled' })
        }
      }, WEB_IMAGE_PICKER_FOCUS_CANCEL_DELAY_MS)
    }

    input.addEventListener('change', handleChange)
    input.addEventListener('cancel', handleCancel)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleWindowFocus)
    }
    timeoutTimer = globalThis.setTimeout(() => {
      timeoutTimer = null
      finishDialog({ ok: false, reason: 'cancelled' })
    }, WEB_IMAGE_PICKER_TIMEOUT_MS)

    document.body?.appendChild(input)
    input.click()
  })
}

export async function pickMapImageFile(): Promise<PickMapImageResult> {
  if (isDesktopApp()) {
    return pickMapImageFileDesktop()
  }
  return pickMapImageFileWeb()
}
