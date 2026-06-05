export function parseISODate(val: string | null | undefined): string | null {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

export function parseInt32(val: string | null | undefined, fallback: number): number {
  if (!val) return fallback
  const n = parseInt(val, 10)
  return isNaN(n) ? fallback : n
}
