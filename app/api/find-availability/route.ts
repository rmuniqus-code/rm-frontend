/**
 * GET /api/find-availability
 *
 * Returns active employees with their current utilisation for a given
 * date window so the Find Availability modal can show real capacity data.
 *
 * Query params (all optional):
 *   startDate  YYYY-MM-DD  start of the request period (defaults to today's Monday)
 *   endDate    YYYY-MM-DD  end of the request period   (defaults to +4 weeks)
 *   grade      string      filter by designation name (exact)
 *   serviceLine string     filter by department name (exact)
 *
 * Response shape:
 *   { resources: AvailableResource[] }
 *
 * AvailableResource:
 *   id            string  emp_code
 *   name          string
 *   grade         string  designation
 *   serviceLine   string  department name
 *   subServiceLine string sub_function name
 *   location      string
 *   region        string
 *   totalFte      number  0.0 – n.n  (sum of allocation_pct / 100 averaged over weeks)
 *                         0 = fully free, 1 = 100 % booked
 */

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/ingestion/ingest'

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const today     = new Date()
    const fromISO   = searchParams.get('startDate') ?? mondayOf(today)
    const toISO     = searchParams.get('endDate')   ?? addWeeks(mondayOf(today), 4)
    const gradeFilter       = searchParams.get('grade') ?? ''
    const serviceLineFilter = searchParams.get('serviceLine') ?? ''

    const sb = getSupabase()

    // ── 1. All active employees ───────────────────────────────────
    let empQuery = sb
      .from('v_employee_details')
      .select('emp_code,name,designation,department,sub_function,location,region')
      .eq('is_active', true)
      .order('name')

    if (gradeFilter)       empQuery = empQuery.eq('designation', gradeFilter)
    if (serviceLineFilter) empQuery = empQuery.eq('department', serviceLineFilter)

    const { data: empRows, error: empError } = await empQuery

    if (empError) {
      return NextResponse.json({ error: empError.message }, { status: 500 })
    }

    const employees: any[] = empRows ?? []

    // ── 1b. Primary skills for all employees ──────────────────────
    const { data: skillRows } = await sb
      .from('v_employee_skills')
      .select('emp_code,primary_skill')

    const skillMap = new Map<string, string>()
    for (const s of skillRows ?? []) {
      if (s.emp_code && s.primary_skill) skillMap.set(s.emp_code, s.primary_skill)
    }

    // ── 2. Allocation rows for the date window (paginated) ────────
    //    Only count actual project bookings — exclude 'available', 'leave',
    //    'maternity', 'jip', 'leaver' statuses which are NOT real utilisation.
    const BOOKED_STATUSES = ['confirmed', 'proposed', 'unconfirmed']
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

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!data || data.length === 0) break
      allocRows.push(...data)
      if (data.length < ALLOC_PAGE) break
      offset += ALLOC_PAGE
    }

    // ── 3. Aggregate: for each employee sum allocation_pct per week ─
    //      Then average across distinct weeks to get a 0-100 figure.
    //      Multiple projects in the same week are summed (>100 = over-allocated).

    // weekTotals: empCode → Map<weekISO, sumPct>
    const weekTotals = new Map<string, Map<string, number>>()

    for (const row of allocRows) {
      if (!weekTotals.has(row.emp_code)) weekTotals.set(row.emp_code, new Map())
      const wMap = weekTotals.get(row.emp_code)!
      wMap.set(row.week_start, (wMap.get(row.week_start) ?? 0) + (row.allocation_pct ?? 0))
    }

    // avgPct: empCode → average allocation % across the period
    const avgPct = new Map<string, number>()
    for (const [empCode, wMap] of weekTotals.entries()) {
      const total   = Array.from(wMap.values()).reduce((a, b) => a + b, 0)
      const avg     = total / wMap.size
      avgPct.set(empCode, avg)
    }

    // ── 4. Build response — only employees with < 100% avg allocation ─
    const resources = employees
      .map((e: any) => ({
        id:             e.emp_code,
        name:           e.name,
        grade:          e.designation ?? '',
        serviceLine:    e.department  ?? '',
        subServiceLine: e.sub_function ?? '',
        location:       e.location    ?? '',
        region:         e.region      ?? '',
        primarySkill:   skillMap.get(e.emp_code) ?? '',
        totalFte:       Math.round((avgPct.get(e.emp_code) ?? 0)) / 100,
      }))
      .filter(r => r.totalFte < 1.0)
      .sort((a, b) => a.totalFte - b.totalFte)   // most available first

    return NextResponse.json({ resources, fromISO, toISO })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
