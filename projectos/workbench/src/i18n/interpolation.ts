export function interpolateMessage(
  message: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return message
  let interpolated = message
  for (const [key, value] of Object.entries(params)) {
    interpolated = interpolated.split(`{${key}}`).join(String(value))
  }
  return interpolated
}
