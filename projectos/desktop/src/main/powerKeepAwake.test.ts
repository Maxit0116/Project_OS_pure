import { describe, expect, it, vi } from 'vitest'

import { PowerKeepAwakeService, type LidSleepGuardPort, type PowerSaveBlockerPort } from './powerKeepAwake.js'

function createFakeBlocker(): PowerSaveBlockerPort & { started: Set<number> } {
  let nextId = 1
  const started = new Set<number>()
  return {
    started,
    start() {
      const id = nextId++
      started.add(id)
      return id
    },
    stop(id: number) {
      const had = started.has(id)
      started.delete(id)
      return had
    },
    isStarted(id: number) {
      return started.has(id)
    },
  }
}

function createFakeLid(
  initialDisabled = false,
): LidSleepGuardPort & { disabled: boolean; calls: boolean[] } {
  const state = { disabled: initialDisabled, calls: [] as boolean[] }
  return {
    get disabled() {
      return state.disabled
    },
    get calls() {
      return state.calls
    },
    async setDisabled(disabled: boolean) {
      state.calls.push(disabled)
      state.disabled = disabled
    },
  }
}

describe('PowerKeepAwakeService', () => {
  it('while_app_open enables idle + lid and releases on deactivate', async () => {
    const blocker = createFakeBlocker()
    const lid = createFakeLid()
    const marker = {
      read: vi.fn(() => false),
      write: vi.fn(),
      clear: vi.fn(),
    }
    const service = new PowerKeepAwakeService({
      platform: 'darwin',
      powerSaveBlocker: blocker,
      lidGuard: lid,
      marker,
    })

    const status = await service.setMode('while_app_open')
    expect(status.active).toBe(true)
    expect(status.idleBlocked).toBe(true)
    expect(status.lidGuardActive).toBe(true)
    expect(marker.write).toHaveBeenCalled()
    expect(lid.disabled).toBe(true)

    await service.deactivate()
    expect(service.getStatus().active).toBe(false)
    expect(blocker.started.size).toBe(0)
    expect(lid.disabled).toBe(false)
    expect(marker.clear).toHaveBeenCalled()
  })

  it('while_agents_running keeps lid armed but only blocks idle when agents work', async () => {
    const blocker = createFakeBlocker()
    const lid = createFakeLid()
    const service = new PowerKeepAwakeService({
      platform: 'darwin',
      powerSaveBlocker: blocker,
      lidGuard: lid,
      marker: { read: () => false, write: () => undefined, clear: () => undefined },
    })

    await service.setMode('while_agents_running')
    expect(service.getStatus().idleBlocked).toBe(false)
    expect(service.getStatus().lidGuardActive).toBe(true)

    await service.setAgentActivity(true)
    expect(service.getStatus().idleBlocked).toBe(true)

    await service.setAgentActivity(false)
    expect(service.getStatus().idleBlocked).toBe(false)
    expect(service.getStatus().lidGuardActive).toBe(true)
  })

  it('reconcileOnLaunch clears a leftover lid guard', async () => {
    const lid = createFakeLid(true)
    const marker = {
      read: vi.fn(() => true),
      write: vi.fn(),
      clear: vi.fn(),
    }
    const service = new PowerKeepAwakeService({
      platform: 'darwin',
      powerSaveBlocker: createFakeBlocker(),
      lidGuard: lid,
      marker,
    })

    await service.reconcileOnLaunch()
    expect(lid.disabled).toBe(false)
    expect(marker.clear).toHaveBeenCalled()
  })

  it('skips lid guard on non-darwin but still blocks idle', async () => {
    const blocker = createFakeBlocker()
    const service = new PowerKeepAwakeService({
      platform: 'linux',
      powerSaveBlocker: blocker,
    })

    const status = await service.setMode('while_app_open')
    expect(status.supported).toBe(false)
    expect(status.idleBlocked).toBe(true)
    expect(status.lidGuardActive).toBe(false)
  })

  it('records lid errors without dropping idle blocker', async () => {
    const blocker = createFakeBlocker()
    const service = new PowerKeepAwakeService({
      platform: 'darwin',
      powerSaveBlocker: blocker,
      lidGuard: {
        async setDisabled() {
          throw new Error('admin cancelled')
        },
      },
    })

    const status = await service.setMode('while_app_open')
    expect(status.idleBlocked).toBe(true)
    expect(status.lidGuardActive).toBe(false)
    expect(status.lastError).toMatch(/admin cancelled/)
  })

  it('deactivate releases silently and keeps marker when silent lid release fails', async () => {
    const marker = {
      read: vi.fn(() => false),
      write: vi.fn(),
      clear: vi.fn(),
    }
    const service = new PowerKeepAwakeService({
      platform: 'darwin',
      powerSaveBlocker: createFakeBlocker(),
      lidGuard: {
        async setDisabled(disabled, options) {
          if (disabled) return
          if (options?.interactive === false) {
            throw new Error('needs password')
          }
        },
      },
      marker,
    })

    await service.setMode('while_app_open')
    expect(marker.write).toHaveBeenCalled()
    await service.deactivate()
    expect(service.getStatus().active).toBe(false)
    expect(marker.clear).not.toHaveBeenCalled()
  })
})
