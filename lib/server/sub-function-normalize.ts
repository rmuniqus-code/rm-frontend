export function normalizeSubFunction(name: string | null | undefined): string {
  if (!name) return name ?? ''
  if (/^arc[\s-]*us$/i.test(name.trim())) return 'ARC - A'
  return name
}

export const EXCLUDED_DEPARTMENTS = new Set(['Central', 'central'])
export const EXCLUDED_SUB_FUNCTIONS = new Set(['LT'])

export function isExcluded(dept: string | null | undefined, sub?: string | null | undefined): boolean {
  if (dept && EXCLUDED_DEPARTMENTS.has(dept)) return true
  if (sub && EXCLUDED_SUB_FUNCTIONS.has(sub)) return true
  return false
}
