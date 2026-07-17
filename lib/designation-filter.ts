export type DesignationFilter = 'all' | 'upto_ad' | 'pd_group'

/**
 * PD Group: Partner (incl. Associate Partner), Director (excl. Associate Director),
 * Managing Director, Technical Director, Director – AI Platforms, Global Head,
 * Co-Founder and Global Head, Partner Global Head - GRC, Regional Head.
 *
 * Upto AD: everyone else (Analyst, AM, Consultant, Manager, Associate Director, etc.)
 */
export function isPDGroup(designation: string | null | undefined): boolean {
  if (!designation) return false
  const d = designation.toLowerCase().trim()
  if (/associate\s+director/.test(d)) return false  // Associate Director → Upto AD
  if (/\bdirector\b/.test(d)) return true           // Director, Managing Director, Technical Director
  if (/\bpartner\b/.test(d)) return true            // Partner, Associate Partner
  if (/global\s+head/.test(d)) return true          // Global Head, Co-Founder and Global Head
  if (/regional\s+head/.test(d)) return true        // Regional Head
  if (/co[-\s]*founder/.test(d)) return true        // Co-Founder
  return false
}

export function matchesDesignationFilter(
  designation: string | null | undefined,
  filter: DesignationFilter,
): boolean {
  if (filter === 'all') return true
  const pd = isPDGroup(designation)
  return filter === 'pd_group' ? pd : !pd
}
