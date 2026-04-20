'use client'

import { useState, useCallback, useEffect } from 'react'

/* ── Types matching the dashboard's existing data shapes ───── */

export interface DashboardKPI {
  totalCapacity: number
  forecastedFte: number
  utilization: number
  avgCompliance: number
  benchCount: number
  timesheetGapCount: number
  overAllocated: number
  variance: number
}

export interface ChargeabilityRow {
  department: string
  current: number
  previous: number
}

export interface ComplianceRow {
  department: string
  current: number
  previous: number
}

export interface TimesheetGapRow {
  name: string
  empId: string
  department: string
  designation: string
  compliancePct: number
  period: string
  wc1: number | null
  wc8: number | null
}

export interface AllocationRow {
  location: string
  region: string
  analyst: number | null
  assocConsultant: number | null
  consultant: number | null
  asstManager: number | null
  manager: number | null
  assocDirector: number | null
  total: number
}

export interface EmployeeRow {
  department: string
  subFunction: string
  empId: string
  name: string
  email: string
  designation: string
  location: string
  region: string
  dateOfJoining: string
  status: 'green' | 'red'
}

export interface CapacityRow {
  serviceLine?: string
  location?: string
  capacity: number
  forecast: number
  actual: number
  subServiceLines?: string[]
}

export interface UtilizationPoint {
  week: string
  forecast: number
  actual: number
}

export interface OverAllocResource {
  id: string
  empCode: string
  name: string
  weekStart: string
  totalAllocation: number
  projectCount: number
}

export interface ProjectSummary {
  id: string
  name: string
  client: string
  projectType: string
  status: string
  teamSize: number
  firstWeek: string
  lastWeek: string
}

export interface LiveDashboardData {
  kpi: DashboardKPI | null
  chargeability: ChargeabilityRow[]
  chargeabilitySub: ChargeabilityRow[]
  compliance: ComplianceRow[]
  complianceSub: ComplianceRow[]
  timesheetGaps: TimesheetGapRow[]
  allocation: AllocationRow[]
  employees: EmployeeRow[]
  capacityByServiceLine: CapacityRow[]
  capacityByLocation: CapacityRow[]
  utilizationTrend: UtilizationPoint[]
  overAllocList: OverAllocResource[]
  projectList: ProjectSummary[]
  lastRefreshed: Date | null
}

const EMPTY: LiveDashboardData = {
  kpi: null,
  chargeability: [],
  chargeabilitySub: [],
  compliance: [],
  complianceSub: [],
  timesheetGaps: [],
  allocation: [],
  employees: [],
  capacityByServiceLine: [],
  capacityByLocation: [],
  utilizationTrend: [],
  overAllocList: [],
  projectList: [],
  lastRefreshed: null,
}

/* ── Hook ──────────────────────────────────────────────────── */

export function useDashboardData() {
  const [data, setData] = useState<LiveDashboardData>(EMPTY)
  const [loading, setLoading] = useState(true) // true on mount → prevents mock flash
  const [error, setError] = useState<string | null>(null)
  const [hasLiveData, setHasLiveData] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/dashboard-data')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = await res.json()

      const liveData: LiveDashboardData = {
        kpi: body.kpi ?? null,
        chargeability: body.chargeability ?? [],
        chargeabilitySub: [],
        compliance: body.compliance ?? [],
        complianceSub: [],
        timesheetGaps: body.timesheetGaps ?? [],
        allocation: body.allocation ?? [],
        employees: body.employees ?? [],
        capacityByServiceLine: body.capacityByServiceLine ?? [],
        capacityByLocation: body.capacityByLocation ?? [],
        utilizationTrend: body.utilizationTrend ?? [],
        overAllocList: body.overAllocList ?? [],
        projectList: body.projectList ?? [],
        lastRefreshed: new Date(),
      }

      setData(liveData)
      setHasLiveData(
        !!(liveData.kpi && liveData.kpi.totalCapacity > 0) ||
        liveData.employees.length > 0
      )
    } catch (err) {
      console.error('[useDashboardData] refresh error:', err)
      setError(err instanceof Error ? err.message : 'Failed to load live data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-fetch on mount
  useEffect(() => { refresh() }, [refresh])

  // Listen for db-reset events to clear cached data and re-fetch
  useEffect(() => {
    const handleReset = () => {
      setData(EMPTY)
      setHasLiveData(false)
      refresh()
    }
    window.addEventListener('db-reset', handleReset)
    return () => window.removeEventListener('db-reset', handleReset)
  }, [refresh])

  return { data, loading, error, hasLiveData, refresh }
}
