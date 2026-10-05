export function showWelcomeImportDialog(dialog: HTMLDialogElement): void {
  if (!dialog.open) dialog.showModal()
}

export function closeWelcomeImportDialog(dialog: HTMLDialogElement): void {
  if (dialog.open) dialog.close()
}

export function handleWelcomeDialogCancel(
  event: Pick<Event, 'preventDefault'>,
  close: () => void,
): void {
  event.preventDefault()
  close()
}
