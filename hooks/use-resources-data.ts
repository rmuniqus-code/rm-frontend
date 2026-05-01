'use client'

/**
 * useResourcesData
 *
 * Queries v_resource_allocation_grid (Supabase view joining
 * forecast_allocations + employees + projects) and transforms rows
 * into GridRow[] format expected by AllocationGrid.
 *
 * Column keys are ISO-date strings of week_start (e.g. "2026-04-14").
 * The page slices a window of N weeks based on dateOffset.
 */

import { useEffect, useState, useCallback } from 'react'
import type { GridRow, DayAllocation, AllocationCategory } from '@/components/shared/allocation-grid'
import { toMonday } from '@/lib/date-utils'
import { apiRaw } from '@/lib/api'

// ─── Public types ────────────────────────────────────────────

export interface EmployeeMeta {
  location: string
  grade: string        // designation
  role: string         // sub_function
  subServiceLine: string // department
  region: string
  primarySkill: string   // sub_function displayed as primary skill
  skills: string[]       // sub_function as a skill pill
}

export interface LiveProjectOption {
  id: string           // project_name used as stable id
  name: string
}

export interface ResourcesLiveData {
  resourceRows: GridRow[]
  projectRows: GridRow[]
  /** All ISO week-start dates present in the dataset, sorted asc */
  allWeeks: string[]
  employeeMeta: Map<string, EmployeeMeta>   // row.id (emp_code) → meta
  projectOptions: LiveProjectOption[]
  filterOptions: {
    locations: string[]
    grades: string[]
    roles: string[]
    subServiceLines: string[]
    regions: string[]
  }
  totalResources: number
  avgUtilization: number
  availableCount: number
  lastRefreshed: Date
}

export interface UseResourcesDataReturn {
  data: ResourcesLiveData | null
  loading: boolean
  error: string | null
  hasLiveData: boolean
  refresh: () => void
}

// ─── Helpers ─────────────────────────────────────────────────

function toCategory(status: string, projectType?: string | null): AllocationCategory {
  const s = (status ?? '').toLowerCase()
  if (s === 'available' || s === 'leaver') return 'available'
  if (s === 'leave' || s === 'maternity' || s === 'levaes') return 'leaves'
  if (s === 'jip') return 'training'
  if (s === 'proposed') return 'proposed'
  const pt = (projectType ?? '').toLowerCase()
  if (!projectType || pt.includes('internal') || pt.includes('bau') || pt.includes('non-billable')) return 'internal'
  return 'client'
}

const PALETTE = [
  '#f59e0b', '#8b5cf6', '#3b82f6', '#22c55e', '#06b6d4',
  '#ec4899', '#f97316', '#14b8a6', '#64748b', '#a855f7',
  '#ef4444', '#84cc16', '#0ea5e9', '#d946ef', '#fb923c',
]
const colFor = (i: number) => PALETTE[i % PALETTE.length]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function isoToWeekColumn(iso: string): { label: string; sublabel: string } {
  const d = new Date(iso + 'T00:00:00')
  const e = new Date(d)
  e.setDate(e.getDate() + 6)
  return {
    label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
    sublabel: `– ${e.getDate()} ${MONTHS[e.getMonth()]}`,
  }
}

/** Format a Date as YYYY-MM-DD using LOCAL time (not UTC).
 *  Using toISOString() on a Date constructed from local midnight shifts the
 *  date back by one day in any UTC+ timezone (e.g. IST = UTC+5:30).
 *  This helper avoids that by reading the local year/month/day directly.
 */
function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Monday of the week containing d */
function mondayOf(d: Date): string {
  const day  = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m    = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return toLocalISO(m)
}

/** Add N weeks to an ISO date string */
function addWeeksISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return toLocalISO(d)
}

/** Generate every weekly Monday from fromISO to toISO (inclusive) */
function generateWeekRange(fromISO: string, toISO: string): string[] {
  const weeks: string[] = []
  const cur = new Date(fromISO + 'T00:00:00')
  const end = new Date(toISO   + 'T00:00:00')
  while (cur <= end) {
    weeks.push(toLocalISO(cur))
    cur.setDate(cur.getDate() + 7)
  }
  return weeks
}

// ─── Row shape from the view ──────────────────────────────────

interface ViewRow {
  emp_code: string
  employee_name: string
  designation: string | null
  department: string | null
  sub_function: string | null
  location: string | null
  week_start: string
  allocation_pct: number
  allocation_status: string
  project_name: string | null
  project_client: string | null
  project_type: string | null
  engagement_manager: string | null
  current_em_ep: string | null
}

// ─── Transform flat DB rows → GridRow maps ────────────────────

function transformRows(rows: ViewRow[], visibleWeeks: string[]): {
  resourceRows: GridRow[]
  projectRows: GridRow[]
  metaMap: Map<string, EmployeeMeta>
} {
  // visibleWeeks must already be Monday-normalised (guaranteed by the caller).
  const weekSet = new Set(visibleWeeks)

  // employee accumulator
  const empMap = new Map<string, {
    row: GridRow
    meta: EmployeeMeta
    chargedHours: number
  }>()
  let empIdx = 0

  // project accumulator
  const projMap = new Map<string, GridRow>()
  const projColors = new Map<string, string>()
  let projIdx = 0

  for (const r of rows) {
    // Normalise the DB week_start to Monday before lookup.
    // Defensive: the parser already snaps to Monday, but DB rows from older
    // uploads or manual inserts may carry a non-Monday date (e.g. a Sunday
    // from a timezone-shifted Excel Date object).  Normalising here means no
    // row is silently dropped due to a ±1 day drift.
    const bucketKey = toMonday(r.week_start)

    if (!weekSet.has(bucketKey)) {
      // Log in development so misconfigured date columns surface immediately.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[transformRows] Skipped row — bucket ${bucketKey} (raw: ${r.week_start}) `
          + `not in visible weeks. emp=${r.emp_code}`,
        )
      }
      continue
    }

    // ── Resource rows ──────────────────────────────────────
    if (!empMap.has(r.emp_code)) {
      const initials = r.employee_name
        .split(' ')
        .slice(0, 2)
        .map(w => w[0] ?? '')
        .join('')
        .toUpperCase()

      empMap.set(r.emp_code, {
        row: {
          id: r.emp_code,
          name: r.employee_name,
          subtitle: r.designation ?? r.sub_function ?? '',
          location: r.location ?? undefined,
          avatar: initials,
          avatarColor: colFor(empIdx++),
          utilization: 0,
          days: Object.fromEntries(visibleWeeks.map(w => [w, [] as DayAllocation[]])),
        },
        meta: {
          location: r.location ?? '',
          grade: r.designation ?? '',
          role: r.sub_function ?? '',
          subServiceLine: r.department ?? '',
          region: '',
          primarySkill: '',
          skills: [],
        },
        chargedHours: 0,
      })
    }

    const emp = empMap.get(r.emp_code)!
    const cat = toCategory(r.allocation_status, r.project_type)
    const hours = Math.round((r.allocation_pct / 100) * 40)

    // Merge duplicate (emp, week, project/status) view rows by summing hours.
    // Use bucketKey (Monday-normalised) for all day-map reads/writes.
    const label = r.project_name ?? r.allocation_status
    const existing = emp.row.days[bucketKey]?.find(a => a.label === label)
    if (existing) {
      // Two DB rows with the same label are duplicates (same project or same status).
      // Use max rather than sum — summing would inflate hours/% for duplicate rows
      // caused by previous uploads with different filenames.
      existing.hours = Math.max(existing.hours ?? 0, hours)
      existing.allocPct = Math.max(existing.allocPct ?? 0, r.allocation_pct)
    } else {
      const idx = emp.row.days[bucketKey]?.length ?? 0
      emp.row.days[bucketKey].push({
        id: `${r.emp_code}-${bucketKey}-${label}-${idx}`,
        label,
        category: cat,
        hours,
        allocPct: r.allocation_pct,
        projectId: r.project_name ?? undefined,
        emEp: r.current_em_ep ?? r.engagement_manager ?? undefined,
      })
    }
    // Utilization = chargeable client work only. Leaves, internal/non-billable,
    // training and the available placeholder should NOT inflate the utilization %.
    if (cat === 'client') emp.chargedHours += hours

    // ── Project rows ───────────────────────────────────────
    if (!r.project_name) continue

    if (!projColors.has(r.project_name)) projColors.set(r.project_name, colFor(projIdx++))

    if (!projMap.has(r.project_name)) {
      projMap.set(r.project_name, {
        id: r.project_name,
        name: r.project_name,
        subtitle: r.project_client ?? r.project_type ?? 'Client',
        avatarColor: projColors.get(r.project_name)!,
        days: Object.fromEntries(visibleWeeks.map(w => [w, [] as DayAllocation[]])),
      })
    }

    const proj = projMap.get(r.project_name)!
    const initials = r.employee_name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0] ?? '')
      .join('')
      .toUpperCase()

    // Merge duplicate (project, emp, week) view rows by taking max hours/%.
    const projLabel = r.employee_name
    const existingProj = proj.days[bucketKey]?.find(a => a.resourceId === r.emp_code)
    if (existingProj) {
      existingProj.hours = Math.max(existingProj.hours ?? 0, hours)
      existingProj.allocPct = Math.max(existingProj.allocPct ?? 0, r.allocation_pct)
    } else {
      const pidx = proj.days[bucketKey]?.length ?? 0
      proj.days[bucketKey].push({
        id: `${r.project_name}-${r.emp_code}-${bucketKey}-${pidx}`,
        label: projLabel,
        category: cat,
        hours,
        allocPct: r.allocation_pct,
        resourceId: r.emp_code,
        emEp: r.current_em_ep ?? r.engagement_manager ?? undefined,
      })
    }
  }

  // Post-process: for each employee week, if there is at least one non-available
  // allocation (i.e. a real project or leave), drop the "available" placeholder.
  // This prevents the grid showing both "available" and a project for the same week
  // after an approval creates forecast_allocations.
  for (const e of empMap.values()) {
    for (const week of visibleWeeks) {
      const slots = e.row.days[week]
      if (!slots || slots.length <= 1) continue
      const hasRealWork = slots.some(a => a.category !== 'available')
      if (hasRealWork) {
        e.row.days[week] = slots.filter(a => a.category !== 'available')
      }
    }
  }

  // Compute utilization % (charged / max per visible window)
  const maxH = visibleWeeks.length * 40
  for (const e of empMap.values()) {
    e.row.utilization = maxH > 0 ? Math.round((e.chargedHours / maxH) * 100) : 0
  }

  return {
    resourceRows: Array.from(empMap.values()).map(e => e.row),
    projectRows: Array.from(projMap.values()),
    metaMap: new Map(Array.from(empMap.entries()).map(([k, v]) => [k, v.meta])),
  }
}

// ─── Hook ────────────────────────────────────────────────────

export function useResourcesData(): UseResourcesDataReturn {
  const [data, setData] = useState<ResourcesLiveData | null>(null)
  const [loading, setLoading] = useState(true) // true = initial fetch in progress; prevents mock data flash
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiRaw('/api/resources-data')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = await res.json() as {
        rows: unknown[]
        skills?: Record<string, { primary: string; secondary: string[] }>
        empMeta?: Record<string, { region: string; department: string; subFunction: string }>
      }
      const rows = body.rows
      const skillsMap = body.skills ?? {}
      const empMetaMap = body.empMeta ?? {}

      if (!rows || rows.length === 0) {
        setData(null)
        return
      }

      const typed = rows as ViewRow[]

      // Derive navigation weeks from DB week_start values, normalised to
      // Monday so timezone drift in the parser (e.g. IST midnight → UTC Sunday)
      // doesn't produce duplicate or off-by-one bucket keys.
      const navWeeks = [...new Set(typed.map(r => toMonday(r.week_start)))].sort()

      const { resourceRows, projectRows, metaMap } = transformRows(typed, navWeeks)

      // Overlay skills data into employeeMeta
      for (const [empCode, skillData] of Object.entries(skillsMap)) {
        const meta = metaMap.get(empCode)
        if (meta) {
          meta.primarySkill = skillData.primary
          meta.skills = skillData.secondary
        }
      }

      // Overlay region + correct department from employee metadata.
      // v_resource_allocation_grid has no `region` column and sometimes
      // has null/empty department for employees like SCC with no allocations.
      for (const [empCode, empData] of Object.entries(empMetaMap)) {
        const meta = metaMap.get(empCode)
        if (meta) {
          if (empData.region) meta.region = empData.region
          if (!meta.subServiceLine && empData.department) meta.subServiceLine = empData.department
          // Always prefer the normalized subFunction from empMeta over the raw DB row value.
          if (empData.subFunction) meta.role = empData.subFunction
        }
      }

      const vals = Array.from(metaMap.values())
      const uniq = <T>(arr: T[]) => [...new Set(arr.filter(Boolean))] as T[]

      const projectOptions: LiveProjectOption[] = [
        ...new Set(typed.filter(r => r.project_name).map(r => r.project_name!)),
      ].map(name => ({ id: name, name }))

      const total = resourceRows.length
      const avgUtil = total > 0
        ? Math.round(resourceRows.reduce((s, r) => s + (r.utilization ?? 0), 0) / total)
        : 0
      const availCount = resourceRows.filter(r => (r.utilization ?? 0) < 70).length

      setData({
        resourceRows,
        projectRows,
        allWeeks: navWeeks,
        employeeMeta: metaMap,
        projectOptions,
        filterOptions: {
          locations: uniq(vals.map(m => m.location)),
          grades: uniq(vals.map(m => m.grade)),
          // Include sub_functions from ALL active employees (not just those with allocations).
          roles: uniq([
            ...vals.map(m => m.role),
            ...Object.values(empMetaMap).map(e => e.subFunction),
          ]),
          // Include departments/regions from ALL active employees so filters
          // show options even when some employees have no current allocations.
          subServiceLines: uniq([
            ...vals.map(m => m.subServiceLine),
            ...Object.values(empMetaMap).map(e => e.department),
          ]),
          regions: uniq([
            ...vals.map(m => m.region),
            ...Object.values(empMetaMap).map(e => e.region),
          ]),
        },
        totalResources: total,
        avgUtilization: avgUtil,
        availableCount: availCount,
        lastRefreshed: new Date(),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Listen for db-reset events to clear cached data and re-fetch
  useEffect(() => {
    const handleReset = () => {
      setData(null)
      fetchData()
    }
    window.addEventListener('db-reset', handleReset)
    return () => window.removeEventListener('db-reset', handleReset)
  }, [fetchData])

  // Listen for allocation-created events (fired after request approval)
  // so the resource timeline reflects new allocations without a full page reload
  useEffect(() => {
    window.addEventListener('allocation-created', fetchData)
    return () => window.removeEventListener('allocation-created', fetchData)
  }, [fetchData])

  return {
    data,
    loading,
    error,
    hasLiveData: !!(data && data.resourceRows.length > 0),
    refresh: fetchData,
  }
}
