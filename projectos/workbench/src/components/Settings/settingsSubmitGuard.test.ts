import { describe, expect, it, vi } from 'vitest'

import { createSettingsSubmitGuard } from './settingsSubmitGuard'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('settings submit guard', () => {
  it('coalesces a double-submit into one mutation', async () => {
    const pending = deferred<boolean>()
    const action = vi.fn(() => pending.promise)
    const setPending = vi.fn()
    const guard = createSettingsSubmitGuard(setPending, vi.fn())

    const first = guard.run(action, vi.fn(), 'Save failed')
    const second = guard.run(action, vi.fn(), 'Save failed')
    expect(action).toHaveBeenCalledOnce()

    pending.resolve(true)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
    expect(setPending).toHaveBeenLastCalledWith(false)
  })

  it('surfaces a failed save and does not run the success callback', async () => {
    const setError = vi.fn()
    const onSuccess = vi.fn()
    const guard = createSettingsSubmitGuard(vi.fn(), setError)

    await expect(
      guard.run(async () => {
        throw new Error('transport failed')
      }, onSuccess, 'Save failed'),
    ).resolves.toBe(false)

    expect(setError).toHaveBeenLastCalledWith('Save failed')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
