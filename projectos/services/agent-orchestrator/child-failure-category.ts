import { ProjectOSError } from '../../errors.js'

const SAFE_FAILURE_CATEGORY = /^[a-z][a-z0-9_]{0,63}$/u

export function childRunFailureCategory(error: unknown): string {
  if (error instanceof ProjectOSError) {
    const detailed = error.details?.['failureCategory'] ??
      error.details?.['lastFailureCategory']
    if (typeof detailed === 'string' && SAFE_FAILURE_CATEGORY.test(detailed)) {
      return detailed
    }
    return error.code
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'category' in error &&
    typeof (error as { category?: unknown }).category === 'string' &&
    SAFE_FAILURE_CATEGORY.test((error as { category: string }).category)
  ) {
    return (error as { category: string }).category
  }
  return 'unexpected_error'
}
