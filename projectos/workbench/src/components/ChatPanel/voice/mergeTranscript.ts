export function mergeBaseWithSpoken(base: string, spoken: string): string {
  if (!spoken) return base
  if (!base.trim()) return spoken
  if (base.endsWith(' ') || spoken.startsWith(' ')) return `${base}${spoken}`
  return `${base} ${spoken}`
}
