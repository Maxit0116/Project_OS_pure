import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  setIcon: vi.fn(),
  setAboutPanelOptions: vi.fn(),
  setAppUserModelId: vi.fn(),
  platform: 'darwin' as NodeJS.Platform,
}))

vi.mock('electron', () => {
  const image = {
    isEmpty: () => false,
  }
  return {
    app: {
      isPackaged: false,
      getAppPath: () => join(__dirname, '../..'),
      getVersion: () => '0.1.0',
      dock: { setIcon: electron.setIcon },
      setAboutPanelOptions: electron.setAboutPanelOptions,
      setAppUserModelId: electron.setAppUserModelId,
    },
    nativeImage: {
      createFromPath: vi.fn(() => image),
    },
  }
})

describe('appBrandIcon', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('resolves the interim build/icon assets checked into the desktop package', async () => {
    const { resolveAppBrandIconPath, loadAppBrandIcon, applyAppBrandIcon } = await import(
      './appBrandIcon.js'
    )
    const iconPath = resolveAppBrandIconPath()
    expect(iconPath).toBeTruthy()
    expect(existsSync(iconPath!)).toBe(true)
    expect(iconPath!.endsWith('icon.png') || iconPath!.endsWith('icon.icns')).toBe(true)

    const image = loadAppBrandIcon()
    expect(image).toBeTruthy()

    const applied = applyAppBrandIcon()
    expect(applied).toBeTruthy()
    // Force stock Electron Dock/Stage Manager tile (same asset as Electron.app).
    expect(electron.setIcon).toHaveBeenCalledTimes(1)
    expect(electron.setAboutPanelOptions).toHaveBeenCalled()
  })
})
