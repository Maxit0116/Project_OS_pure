import { afterEach, describe, expect, it, vi } from 'vitest'

import { pickMapImageFile } from './pickMapImageFile'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pickMapImageFile', () => {
  it('uses the desktop bridge data URL without accepting a source path', async () => {
    const dataUrl = 'data:image/png;base64,cGlja2Vk'
    const pickImageFile = vi.fn().mockResolvedValue({
      dataUrl,
      fileName: 'picked.png',
      mimeType: 'image/png',
      width: 320,
      height: 180,
    })
    vi.stubGlobal('window', { projectOS: { shell: { pickImageFile } } })

    const result = await pickMapImageFile()

    expect(result).toEqual({
      ok: true,
      file: {
        dataUrl,
        fileName: 'picked.png',
        mimeType: 'image/png',
        width: 320,
        height: 180,
      },
    })
    expect(result.ok && result.file).not.toHaveProperty('sourceAbsolutePath')
  })

  it('keeps the browser FileReader data-URL flow unchanged', async () => {
    const dataUrl = 'data:image/jpeg;base64,d2ViLWltYWdl'
    const listeners = new Map<string, () => void>()
    const input = {
      type: '',
      accept: '',
      files: [{ name: 'web-image.jpg', type: 'image/jpeg', size: 9 }],
      addEventListener: vi.fn((type: string, listener: () => void) => {
        listeners.set(type, listener)
      }),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      remove: vi.fn(),
      click: vi.fn(() => listeners.get('change')?.()),
    }
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })
    vi.stubGlobal('FileReader', class {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL(): void {
        this.result = dataUrl
        this.onload?.()
      }
    })
    vi.stubGlobal('Image', class {
      naturalWidth = 640
      naturalHeight = 360
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        this.onload?.()
      }
    })

    await expect(pickMapImageFile()).resolves.toEqual({
      ok: true,
      file: {
        dataUrl,
        fileName: 'web-image.jpg',
        mimeType: 'image/jpeg',
        width: 640,
        height: 360,
      },
    })
  })

  it('settles a dismissed web picker on focus fallback and removes its input', async () => {
    vi.useFakeTimers()
    const inputListeners = new Map<string, () => void>()
    const windowListeners = new Map<string, () => void>()
    const input = {
      type: '',
      accept: '',
      files: [] as File[],
      addEventListener: vi.fn((type: string, listener: () => void) => {
        inputListeners.set(type, listener)
      }),
      removeEventListener: vi.fn((type: string) => inputListeners.delete(type)),
      remove: vi.fn(),
      click: vi.fn(),
    }
    const appendChild = vi.fn()
    vi.stubGlobal('window', {
      projectOS: undefined,
      addEventListener: vi.fn((type: string, listener: () => void) => {
        windowListeners.set(type, listener)
      }),
      removeEventListener: vi.fn((type: string) => windowListeners.delete(type)),
    })
    vi.stubGlobal('document', {
      body: { appendChild },
      createElement: vi.fn(() => input),
    })

    const result = pickMapImageFile()
    expect(input.click).toHaveBeenCalledOnce()
    expect(appendChild).toHaveBeenCalledWith(input)

    windowListeners.get('focus')?.()
    await vi.advanceTimersByTimeAsync(250)

    await expect(result).resolves.toEqual({ ok: false, reason: 'cancelled' })
    expect(input.remove).toHaveBeenCalledOnce()
    expect(inputListeners.size).toBe(0)
    expect(windowListeners.size).toBe(0)
  })
})
