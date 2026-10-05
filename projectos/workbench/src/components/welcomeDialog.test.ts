import { describe, expect, it, vi } from 'vitest'

import {
  closeWelcomeImportDialog,
  handleWelcomeDialogCancel,
  showWelcomeImportDialog,
} from './welcomeDialog'

describe('welcome import modal', () => {
  it('opens modally and closes through the Escape cancel path', () => {
    const dialog = {
      open: false,
      showModal: vi.fn(function (this: { open: boolean }) { this.open = true }),
      close: vi.fn(function (this: { open: boolean }) { this.open = false }),
    } as unknown as HTMLDialogElement
    const cancelEvent = { preventDefault: vi.fn() }

    showWelcomeImportDialog(dialog)
    handleWelcomeDialogCancel(cancelEvent, () => closeWelcomeImportDialog(dialog))

    expect(dialog.showModal).toHaveBeenCalledOnce()
    expect(cancelEvent.preventDefault).toHaveBeenCalledOnce()
    expect(dialog.close).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(false)
  })
})
