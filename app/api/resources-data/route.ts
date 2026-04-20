/**
 * GET /api/resources-data
 *
 * Server-side route — uses service-role key (bypasses RLS).
 * Default window: 8 weeks before → 20 weeks after today's Monday (28 weeks).
 * This covers the typical navigation range and avoids transferring years of data.
 *
 * Performance: row count is fetched first, then all pages are fetched in
 * parallel (Promise.all) instead of sequentially.
 * Response is cached for 3 minutes (stale-while-revalidate 5 min).
 */
import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/ingestion/ingest'

const SELECT_COLS =
  'emp_code,employee_name,designation,department,sub_function,location,' +
  'week_start,allocation_pct,allocation_status,project_name,project_client,project_type'

const PAGE_SIZE = 1000

/** Format a Date as YYYY-MM-DD using local time (avoids UTC-shift on toISOString in UTC+ zones) */
function toLocalISO(d: Date): string {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** ISO date of the Monday for the week containing `d` */
function mondayOf(d: Date): string {
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m    = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return toLocalISO(m)
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return toLocalISO(d)
}

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300',
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // Default window: 8 weeks back → 20 weeks forward (28 weeks total).
    // Callers can override via ?from=YYYY-MM-DD&to=YYYY-MM-DD for broader navigation.
    const today   = new Date()
    const fromISO = searchParams.get('from') ?? addWeeks(mondayOf(today), -8)
    const toISO   = searchParams.get('to')   ?? addWeeks(mondayOf(today), 20)

    const sb = getSupabase()

    // ── Step 1: count rows so we can fire all pages in parallel ──────────
    const { count, error: countError } = await sb
      .from('v_resource_allocation_grid')
      .select('*', { count: 'exact', head: true })
      .gte('week_start', fromISO)
      .lte('week_start', toISO)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    const totalRows = count ?? 0

    if (totalRows === 0) {
      return NextResponse.json({ rows: [], fromISO, toISO }, { headers: CACHE_HEADERS })
    }

    // ── Step 2: fetch all pages in parallel ──────────────────────────────
    const pageCount = Math.ceil(totalRows / PAGE_SIZE)

    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, i) =>
        sb
          .from('v_resource_allocation_grid')
          .select(SELECT_COLS)
          .gte('week_start', fromISO)
          .lte('week_start', toISO)
          .order('week_start', { ascending: true })
          .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
      )
    )

    const firstError = pages.find(p => p.error)
    if (firstError?.error) {
      return NextResponse.json({ error: firstError.error.message }, { status: 500 })
    }

    const allRows = pages.flatMap(p => p.data ?? [])

    // ── Fetch employee skills in parallel with the main query ──────────
    const [{ data: skillRows }, { data: empMetaRows }] = await Promise.all([
      sb
        .from('v_employee_skills')
        .select('emp_code,primary_skill,secondary_skills'),
      // Fetch region + full department for every employee so the Resources
      // page filter dropdowns can show regions and accurate service lines.
      sb
        .from('v_employee_details')
        .select('emp_code,region,department')
        .eq('is_active', true),
    ])

    const skillsMap: Record<string, { primary: string; secondary: string[] }> = {}
    for (const s of skillRows ?? []) {
      if (s.emp_code) {
        skillsMap[s.emp_code] = {
          primary: s.primary_skill ?? '',
          secondary: Array.isArray(s.secondary_skills) ? s.secondary_skills.filter(Boolean) : [],
        }
      }
    }

    // Build emp_code → { region, department } map from the employee metadata fetch
    const empRegionMap: Record<string, { region: string; department: string }> = {}
    for (const row of empMetaRows ?? []) {
      if (row.emp_code) {
        empRegionMap[row.emp_code] = {
          region: row.region ?? '',
          department: row.department ?? '',
        }
      }
    }

    return NextResponse.json({ rows: allRows, skills: skillsMap, empMeta: empRegionMap, fromISO, toISO }, { headers: CACHE_HEADERS })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

