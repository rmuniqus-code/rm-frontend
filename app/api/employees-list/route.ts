import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/server/ingestion/ingest'
import { withAuth, AuthUser } from '@/lib/server/auth'
import { isExcluded } from '@/lib/server/sub-function-normalize'

const ALLOC_PAGE = 1000
const BOOKED_STATUSES = ['confirmed', 'proposed', 'unconfirmed']

export const GET = withAuth(async (req: NextRequest, _user: AuthUser) => {
  const sp = req.nextUrl.searchParams
  const startDate = sp.get('startDate')
  const endDate = sp.get('endDate')

  const supabase = getSupabase()

  const { data: empRows, error: empError } = await supabase
    .from('v_employee_details')
    .select('emp_code,name,designation,department,sub_function,location,region')
    .eq('is_active', true)
    .order('name')
    .limit(2000)

  if (empError) return NextResponse.json({ error: empError.message }, { status: 500 })

  // Fetch allocations for the request period to compute availability
  const avgPct = new Map<string, number>()
  if (startDate && endDate) {
    const allocRows: any[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await supabase
        .from('v_resource_allocation_grid')
        .select('emp_code,allocation_pct,week_start')
        .gte('week_start', startDate)
        .lte('week_start', endDate)
        .in('allocation_status', BOOKED_STATUSES)
        .range(offset, offset + ALLOC_PAGE - 1)
      if (error) break
      if (!data || data.length === 0) break
      allocRows.push(...data)
      if (data.length < ALLOC_PAGE) break
      offset += ALLOC_PAGE
    }

    // Sum allocation per employee per week, then average across weeks
    const weekTotals = new Map<string, Map<string, number>>()
    for (const row of allocRows) {
      if (!weekTotals.has(row.emp_code)) weekTotals.set(row.emp_code, new Map())
      const wMap = weekTotals.get(row.emp_code)!
      wMap.set(row.week_start, (wMap.get(row.week_start) ?? 0) + (row.allocation_pct ?? 0))
    }
    for (const [empCode, wMap] of weekTotals.entries()) {
      const total = Array.from(wMap.values()).reduce((a, b) => a + b, 0)
      avgPct.set(empCode, total / wMap.size)
    }
  }

  const employees = (empRows ?? []).filter((r: any) => !isExcluded(r.department, r.sub_function, r.designation)).map((r: any) => {
    const bookedPct = avgPct.get(r.emp_code) ?? 0
    const availabilityPct = startDate && endDate
      ? Math.max(0, Math.round(100 - bookedPct))
      : null
    return {
      emp_code: r.emp_code,
      name: r.name,
      designation: r.designation,
      department: r.department,
      sub_function: r.sub_function,
      location: r.location,
      region: r.region,
      availabilityPct,
    }
  })

  return NextResponse.json(employees)
})
