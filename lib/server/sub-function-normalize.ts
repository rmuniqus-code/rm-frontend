export function normalizeSubFunction(name: string | null | undefined): string {
  if (!name) return name ?? ''
  if (/^arc[\s-]*us$/i.test(name.trim())) return 'ARC - A'
  return name
}

export const EXCLUDED_DEPARTMENTS = new Set(['Central', 'central'])
export const EXCLUDED_SUB_FUNCTIONS = new Set(['LT'])
const EXCLUDED_DESIGNATION_PATTERNS = [/co[\s-]*founder/i, /^advisor$/i, /global\s+head/i, /regional\s+head/i]

export function isExcludedDesignation(designation: string | null | undefined): boolean {
  if (!designation) return false
  return EXCLUDED_DESIGNATION_PATTERNS.some(p => p.test(designation.trim()))
}

export function isExcluded(dept: string | null | undefined, sub?: string | null | undefined, designation?: string | null | undefined): boolean {
  if (dept && EXCLUDED_DEPARTMENTS.has(dept)) return true
  if (sub && EXCLUDED_SUB_FUNCTIONS.has(sub)) return true
  if (designation && isExcludedDesignation(designation)) return true
  return false
}
