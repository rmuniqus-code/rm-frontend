/**
 * GET /api/smart-allocate
 *
 * Rule-based scoring engine that ranks resources against a request.
 * Returns candidates sorted by fit_score DESC.
 *
 * Query params:
 *   primarySkill   string   (required) — exact skill to match
 *   grade          string   (optional) — desired designation name
 *   startDate      YYYY-MM-DD (optional, defaults to current Monday)
 *   endDate        YYYY-MM-DD (optional, defaults to +4 weeks)
 *
 * Scoring:
 *   A. Primary Skill exact match → +50  (mandatory — no match = excluded)
 *   B. Availability (avg util over window):
 *        0–50 %  → +30
 *        50–80 % → +20
 *        80–100% → +10
 *        >100%   → excluded
 *   C. Grade match:
 *        exact          → +20
 *        1 rank away    → +10
 *        otherwise      → +0
 *
 *   Max score = 100
 */

import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/ingestion/ingest'
import { ok, fail, withErrorHandling } from '@/lib/api-helpers'

function toLocalISO(d: Date): string {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

function mondayOf(d: Date): string {
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m    = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return toLocalISO(m)
}

function addWeeks(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return toLocalISO(d)
}

const ALLOC_PAGE = 1000
const BOOKED_STATUSES = ['confirmed', 'proposed', 'unconfirmed']

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const primarySkill = url.searchParams.get('primarySkill') ?? ''
  const gradeFilter  = url.searchParams.get('grade') ?? ''
  const today = new Date()
  const fromISO = url.searchParams.get('startDate') ?? mondayOf(today)
  const toISO   = url.searchParams.get('endDate')   ?? addWeeks(mondayOf(today), 4)

  if (!primarySkill) return fail(400, 'primarySkill is required')

  const sb = getSupabase()

  // ── 1. All active employees ─────────────────────────────────────
  const { data: empRows, error: empError } = await sb
    .from('v_employee_details')
    .select('emp_code,name,designation,department,sub_function,location,region')
    .eq('is_active', true)
    .order('name')

  if (empError) return fail(500, empError.message)

  // ── 2. Primary skills ───────────────────────────────────────────
  const { data: skillRows } = await sb
    .from('v_employee_skills')
    .select('emp_code,primary_skill')

  const skillMap = new Map<string, string>()
  for (const s of skillRows ?? []) {
    if (s.emp_code && s.primary_skill) skillMap.set(s.emp_code, s.primary_skill)
  }

  // ── 3. Designation rank_order for grade proximity ───────────────
  const { data: desRows } = await sb
    .from('designations')
    .select('name,rank_order')

  const gradeRank = new Map<string, number>()
  for (const d of desRows ?? []) {
    if (d.name) gradeRank.set(d.name, d.rank_order ?? 0)
  }

  // ── 4. Allocation rows for the date window ──────────────────────
  const allocRows: any[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('v_resource_allocation_grid')
      .select('emp_code,allocation_pct,week_start,allocation_status')
      .gte('week_start', fromISO)
      .lte('week_start', toISO)
      .in('allocation_status', BOOKED_STATUSES)
      .range(offset, offset + ALLOC_PAGE - 1)

    if (error) return fail(500, error.message)
    if (!data || data.length === 0) break
    allocRows.push(...data)
    if (data.length < ALLOC_PAGE) break
    offset += ALLOC_PAGE
  }

  // ── 5. Compute avg utilisation per employee ─────────────────────
  const weekTotals = new Map<string, Map<string, number>>()
  for (const row of allocRows) {
    if (!weekTotals.has(row.emp_code)) weekTotals.set(row.emp_code, new Map())
    const wMap = weekTotals.get(row.emp_code)!
    wMap.set(row.week_start, (wMap.get(row.week_start) ?? 0) + (row.allocation_pct ?? 0))
  }

  const avgUtil = new Map<string, number>()
  for (const [empCode, wMap] of weekTotals.entries()) {
    const total = Array.from(wMap.values()).reduce((a, b) => a + b, 0)
    avgUtil.set(empCode, Math.round(total / wMap.size))
  }

  // ── 6. Score each employee ──────────────────────────────────────
  const requestedRank = gradeFilter ? (gradeRank.get(gradeFilter) ?? -1) : -1

  const candidates: {
    id: string
    name: string
    grade: string
    serviceLine: string
    subServiceLine: string
    location: string
    region: string
    primarySkill: string
    utilization: number
    fitScore: number
    matchBreakdown: { skill: number; availability: number; grade: number }
  }[] = []

  for (const emp of empRows ?? []) {
    const empSkill = skillMap.get(emp.emp_code) ?? ''

    // A. Primary Skill — mandatory match
    if (empSkill.toLowerCase() !== primarySkill.toLowerCase()) continue

    const util = avgUtil.get(emp.emp_code) ?? 0

    // Exclude over-allocated (>100%)
    if (util > 100) continue

    let skillScore = 50

    // B. Availability score
    let availScore = 0
    if (util <= 50)       availScore = 30
    else if (util <= 80)  availScore = 20
    else                  availScore = 10

    // C. Grade match score
    let gradeScore = 0
    if (gradeFilter && emp.designation) {
      if (emp.designation === gradeFilter) {
        gradeScore = 20
      } else {
        const empRank = gradeRank.get(emp.designation) ?? -99
        if (requestedRank >= 0 && empRank >= 0 && Math.abs(empRank - requestedRank) === 1) {
          gradeScore = 10
        }
      }
    }

    const fitScore = Math.min(skillScore + availScore + gradeScore, 100)

    candidates.push({
      id:             emp.emp_code,
      name:           emp.name,
      grade:          emp.designation ?? '',
      serviceLine:    emp.department ?? '',
      subServiceLine: emp.sub_function ?? '',
      location:       emp.location ?? '',
      region:         emp.region ?? '',
      primarySkill:   empSkill,
      utilization:    util,
      fitScore,
      matchBreakdown: { skill: skillScore, availability: availScore, grade: gradeScore },
    })
  }

  // Sort by fitScore DESC, then by utilization ASC (most available first as tie-break)
  candidates.sort((a, b) => b.fitScore - a.fitScore || a.utilization - b.utilization)

  return ok({ candidates, fromISO, toISO })
})
