/**
 * GET /api/outliers
 *
 * Unified outliers endpoint. Returns all outlier types in one response:
 *   - missed_timesheet: employees with zero/low timesheet compliance
 *   - low_utilization_am: Analyst–Manager below 75%
 *   - low_utilization_ad: Associate Director below 65%
 *   - over_allocated: >100% allocation in any week
 *
 * Query params:
 *   from        — start date (default: current Monday)
 *   to          — end date (default: +4 weeks)
 *   type        — filter by outlier_type (optional, comma-separated)
 *   region      — filter by region name (drilldown level 1)
 *   serviceLine — filter by department/service line (drilldown level 2)
 *   department  — alias for serviceLine
 *
 * Response includes:
 *   - summary: counts per outlier type
 *   - outliers: enriched with region, serviceLine per entry
 *   - aggregations: grouped counts for drilldown charts
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling, parseISODate } from '@/lib/api-helpers'

interface OutlierEntry {
  employee_id: string
  employee_code: string
  employee_name: string
  designation: string
  department: string
  location: string
  outlier_type: string
  metric_value: number
  threshold: number
  detail: string
  week_start: string | null
  region?: string
  serviceLine?: string
  projects?: { name: string; allocation_pct: number; status: string }[]
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const typeFilter = url.searchParams.get('type')
  const regionFilter = url.searchParams.get('region')
  const serviceLineFilter = url.searchParams.get('serviceLine') || url.searchParams.get('department')
  const from = parseISODate(url.searchParams.get('from')) ?? todayMonday()
  const to = parseISODate(url.searchParams.get('to')) ?? addWeeks(from, 4)

  const [outlierRes, allocRes, locationRes, tsCompRes, empDetailsRes] = await Promise.all([
    supabaseAdmin().rpc('fn_outliers', { p_from: from, p_to: to }),
    // Fetch current project allocations for all active employees in this range
    supabaseAdmin()
      .from('v_resource_allocation_grid')
      .select('emp_code, project_name, allocation_pct, allocation_status, week_start')
      .gte('week_start', from)
      .lte('week_start', to)
      .in('allocation_status', ['confirmed', 'proposed']),
    // Fetch location → region mapping for drilldown
    supabaseAdmin()
      .from('locations')
      .select('name, region:regions(name)'),
    // Fetch employees with strictly 0% compliance (consistent with dashboard KPI)
    supabaseAdmin()
      .from('timesheet_compliance')
      .select(`
        period_month, compliance_pct, total_hours,
        employees!inner(
          id, employee_id, name,
          designations(name),
          departments(name),
          locations(name)
        )
      `)
      .eq('compliance_pct', 0)
      .order('period_month', { ascending: false }),
    // Fetch emp_code → region from v_employee_details (the authoritative source)
    supabaseAdmin()
      .from('v_employee_details')
      .select('emp_code,region')
      .eq('is_active', true),
  ])

  if (outlierRes.error) return fail(500, outlierRes.error.message)

  // Build emp_code → region map from the authoritative employee details view
  const empRegionMap = new Map<string, string>()
  for (const emp of (empDetailsRes.data ?? [])) {
    if (emp.emp_code && emp.region) empRegionMap.set(emp.emp_code, emp.region)
  }

  // Build location → region map (fallback for entries without emp_code lookup)
  const locationRegionMap = new Map<string, string>()
  for (const loc of (locationRes.data ?? [])) {
    const regionName = (loc.region as any)?.name ?? 'Unknown'
    locationRegionMap.set(loc.name, regionName)
  }

  // Build strict timesheet rows: only compliance_pct = 0, latest period
  const tsAllRows = tsCompRes.data ?? []
  const latestTsPeriod = tsAllRows.reduce((max: string, r: any) =>
    (r.period_month > max ? r.period_month : max), '')
  const strictTimesheetOutliers: OutlierEntry[] = tsAllRows
    .filter((r: any) => r.period_month === latestTsPeriod)
    .map((r: any) => {
      const emp = r.employees as any
      const loc = emp?.locations?.name ?? ''
      return {
        employee_id: emp?.id ?? '',
        employee_code: emp?.employee_id ?? '',
        employee_name: emp?.name ?? '',
        designation: emp?.designations?.name ?? '',
        department: emp?.departments?.name ?? '',
        location: loc,
        outlier_type: 'missed_timesheet',
        metric_value: Number(r.total_hours ?? 0),
        threshold: 1.0,
        detail: `Total hours = ${r.total_hours ?? 0} for period ${r.period_month}`,
        week_start: null,
        region: empRegionMap.get(emp?.employee_id ?? '') ?? locationRegionMap.get(loc) ?? 'Unknown',
        serviceLine: emp?.departments?.name ?? 'Unknown',
      }
    })

  // Merge: use strict timesheet rows + non-timesheet rows from fn_outliers
  let outliers: OutlierEntry[] = [
    ...strictTimesheetOutliers,
    ...((outlierRes.data ?? []) as OutlierEntry[]).filter(o => o.outlier_type !== 'missed_timesheet'),
  ]

  // Enrich non-timesheet outliers with region and serviceLine
  for (const o of outliers) {
    if (o.outlier_type !== 'missed_timesheet') {
      o.region = empRegionMap.get(o.employee_code) ?? locationRegionMap.get(o.location) ?? 'Unknown'
      o.serviceLine = o.department ?? 'Unknown'
    }
  }

  // Build a map: emp_code → distinct projects with their allocation
  const empProjectMap = new Map<string, Map<string, { totalPct: number; status: string; weeks: number }>>()
  for (const row of (allocRes.data ?? [])) {
    if (!empProjectMap.has(row.emp_code)) empProjectMap.set(row.emp_code, new Map())
    const projMap = empProjectMap.get(row.emp_code)!
    const existing = projMap.get(row.project_name) ?? { totalPct: 0, status: row.allocation_status, weeks: 0 }
    existing.totalPct += Number(row.allocation_pct) || 0
    existing.weeks++
    projMap.set(row.project_name, existing)
  }

  // Attach project details to each outlier
  for (const o of outliers) {
    const projMap = empProjectMap.get(o.employee_code)
    if (projMap) {
      o.projects = [...projMap.entries()].map(([name, info]) => ({
        name,
        allocation_pct: Math.round(info.totalPct / info.weeks),
        status: info.status,
      })).sort((a, b) => b.allocation_pct - a.allocation_pct)
    }
  }

  // Apply type filter
  if (typeFilter) {
    const types = typeFilter.split(',').map(t => t.trim())
    outliers = outliers.filter(o => types.includes(o.outlier_type))
  }

  // Apply region filter (drilldown level 1)
  if (regionFilter) {
    outliers = outliers.filter(o => o.region === regionFilter)
  }

  // Apply serviceLine/department filter (drilldown level 2)
  if (serviceLineFilter) {
    outliers = outliers.filter(o => o.serviceLine === serviceLineFilter)
  }

  // Deduplicate by employee+type (keep worst week)
  const deduped = deduplicateOutliers(outliers)

  // Group by type for summary counts
  const summary = {
    total: deduped.length,
    missed_timesheet: deduped.filter(o => o.outlier_type === 'missed_timesheet').length,
    low_utilization_am: deduped.filter(o => o.outlier_type === 'low_utilization_am').length,
    low_utilization_ad: deduped.filter(o => o.outlier_type === 'low_utilization_ad').length,
    over_allocated: deduped.filter(o => o.outlier_type === 'over_allocated').length,
  }

  // Build aggregations for drilldown charts
  const byRegion = groupBy(deduped, 'region')
  const byServiceLine = groupBy(deduped, 'serviceLine')
  const byDepartment = groupBy(deduped, 'department')

  return ok({
    summary,
    outliers: deduped,
    dateRange: { from, to },
    aggregations: { byRegion, byServiceLine, byDepartment },
  })
})

/** Group outliers by a field and return counts per group */
function groupBy(outliers: OutlierEntry[], field: keyof OutlierEntry): { name: string; count: number; missed_timesheet: number; low_utilization: number; over_allocated: number }[] {
  const map = new Map<string, { count: number; missed_timesheet: number; low_utilization: number; over_allocated: number }>()
  for (const o of outliers) {
    const key = String(o[field] ?? 'Unknown')
    if (!map.has(key)) map.set(key, { count: 0, missed_timesheet: 0, low_utilization: 0, over_allocated: 0 })
    const g = map.get(key)!
    g.count++
    if (o.outlier_type === 'missed_timesheet') g.missed_timesheet++
    else if (o.outlier_type.startsWith('low_utilization')) g.low_utilization++
    else if (o.outlier_type === 'over_allocated') g.over_allocated++
  }
  return [...map.entries()]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => b.count - a.count)
}

/** Deduplicate: keep one entry per employee per outlier_type (worst metric) */
function deduplicateOutliers(outliers: OutlierEntry[]): OutlierEntry[] {
  const map = new Map<string, OutlierEntry>()
  for (const o of outliers) {
    const key = `${o.employee_code}:${o.outlier_type}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, o)
    } else {
      if (o.outlier_type === 'over_allocated') {
        if (o.metric_value > existing.metric_value) map.set(key, o)
      } else {
        if (o.metric_value < existing.metric_value) map.set(key, o)
      }
    }
  }
  return [...map.values()]
}

function todayMonday(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}
