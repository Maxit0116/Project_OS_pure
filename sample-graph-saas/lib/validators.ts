export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (password.length < 8) errors.push('Must be at least 8 characters')
  if (!/[A-Z]/.test(password)) errors.push('Must contain uppercase letter')
  if (!/[0-9]/.test(password)) errors.push('Must contain a number')
  return { valid: errors.length === 0, errors }
}

export function validateSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug)
}
