export function normalizeSubFunction(name: string | null | undefined): string {
  if (!name) return name ?? ''
  if (/^arc[\s-]*us$/i.test(name.trim())) return 'ARC - A'
  return name
}

export const EXCLUDED_DEPARTMENTS = new Set(['Central', 'central'])
export const EXCLUDED_SUB_FUNCTIONS = new Set(['LT'])

// Designation exclusion has been moved to the global designation filter buttons (All/Upto AD/PD Group).
// isExcluded no longer gates on designation so that all headcounts are visible when filter = 'all'.
export function isExcluded(dept: string | null | undefined, sub?: string | null | undefined, _designation?: string | null | undefined): boolean {
  if (dept && EXCLUDED_DEPARTMENTS.has(dept)) return true
  if (sub && EXCLUDED_SUB_FUNCTIONS.has(sub)) return true
  return false
}
