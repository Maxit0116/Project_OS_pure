export interface InertPanelElement {
  inert: boolean
}

export function setPersistentPanelVisibility(
  element: InertPanelElement | null,
  visible: boolean,
): void {
  if (element) element.inert = !visible
}
