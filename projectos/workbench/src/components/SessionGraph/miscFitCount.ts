export const MISC_CHIP_GAP_PX = 6

/** How many misc chips fit on the collapsed row while reserving space for a +N badge. */
export function computeMiscFitCount(
  chipWidths: number[],
  moreWidth: number,
  availableWidth: number,
): number {
  if (chipWidths.length === 0 || availableWidth <= 0) return 0
  let used = 0
  let fit = 0
  for (let i = 0; i < chipWidths.length; i++) {
    const width = chipWidths[i] ?? 0
    const nextUsed = used + (fit > 0 ? MISC_CHIP_GAP_PX : 0) + width
    const remainingAfter = chipWidths.length - i - 1
    const reserved = remainingAfter > 0 ? MISC_CHIP_GAP_PX + moreWidth : 0
    if (nextUsed + reserved > availableWidth) break
    used = nextUsed
    fit += 1
  }
  if (fit === 0) return 1
  return fit
}
