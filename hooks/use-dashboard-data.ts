'use client'

import { useState, useCallback, useEffect } from 'react'
import { apiRaw } from '@/lib/api'

/* ── Types matching the dashboard's existing data shapes ───── */

export interface DashboardKPI {
  totalCapacity: number
  forecastedFte: number
  utilization: number
  utilizationYtd: number
  avgCompliance: number
  benchCount: number
  timesheetGapCount: number
  overAllocated: number
  variance: number
  activeResources: number
  servingNotice: number | null
  contract: number | null
  exited: number
}

export interface ChargeabilityRow {
  department: string
  headcount: number
  current: number
  previous: number
  ytd: number | null
}

export interface ChargeabilityBySubTeamRow {
  department: string
  subTeam: string
  headcount: number
  current: number
  previous: number
  ytd: number | null
}

export interface ComplianceRow {
  department: string
  headcount: number
  current: number
  previous: number
  ytd: number | null
}

export interface ComplianceBySubTeamRow extends ChargeabilityBySubTeamRow {}

export interface RegionChargeabilityRow {
  region: string
  current: number
  headcount: number
}

export interface DeptStatusSubTeam {
  subTeam: string
  active: number
  exited: number
  servingNotice: number
  contract: number
}

export interface DeptStatusRow {
  department: string
  active: number
  exited: number
  servingNotice: number
  contract: number
  subTeams: DeptStatusSubTeam[]
}

export interface TrendPoint { period: string; value: number }
export interface DeptTrendRow { department: string; trend: TrendPoint[] }
export interface SubTeamTrendRow { department: string; subTeam: string; trend: TrendPoint[] }

export interface TimesheetGapRow {
  name: string
  empId: string
  department: string
  subTeam: string
  designation: string
  location: string
  compliancePct: number
  period: string
  wc1: number | null
  wc8: number | null
}

export interface TimesheetGapBySubTeamRow {
  subTeam: string
  count: number
}

export interface TimesheetGapByTeamRow {
  department: string
  count: number
  subTeams: TimesheetGapBySubTeamRow[]
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
  employeeStatus: string
  status: 'green' | 'red'
  chargeabilityMTD: number | null
  complianceMTD: number | null
  chargeabilityYTD: number | null
  currentProject: string | null
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
  chargeabilityBySubTeam: ChargeabilityBySubTeamRow[]
  compliance: ComplianceRow[]
  complianceSub: ComplianceRow[]
  complianceBySubTeam: ComplianceBySubTeamRow[]
  chargeabilityByRegion: RegionChargeabilityRow[]
  complianceByRegion: RegionChargeabilityRow[]
  chargeabilityTrendByDept: DeptTrendRow[]
  chargeabilityTrendBySubTeam: SubTeamTrendRow[]
  complianceTrendByDept: DeptTrendRow[]
  complianceTrendBySubTeam: SubTeamTrendRow[]
  deptStatusBreakdown: DeptStatusRow[]
  timesheetGaps: TimesheetGapRow[]
  timesheetGapsByTeam: TimesheetGapByTeamRow[]
  allocation: AllocationRow[]
  employees: EmployeeRow[]
  capacityByServiceLine: CapacityRow[]
  capacityByLocation: CapacityRow[]
  utilizationTrend: UtilizationPoint[]
  overAllocList: OverAllocResource[]
  projectList: ProjectSummary[]
  lastRefreshed: Date | null
  availablePeriods: string[]
  currentPeriod: string | null
}

const EMPTY: LiveDashboardData = {
  kpi: null,
  chargeability: [],
  chargeabilitySub: [],
  chargeabilityBySubTeam: [],
  compliance: [],
  complianceSub: [],
  complianceBySubTeam: [],
  chargeabilityByRegion: [],
  complianceByRegion: [],
  chargeabilityTrendByDept: [],
  chargeabilityTrendBySubTeam: [],
  complianceTrendByDept: [],
  complianceTrendBySubTeam: [],
  deptStatusBreakdown: [],
  timesheetGaps: [],
  timesheetGapsByTeam: [],
  allocation: [],
  employees: [],
  capacityByServiceLine: [],
  capacityByLocation: [],
  utilizationTrend: [],
  overAllocList: [],
  projectList: [],
  lastRefreshed: null,
  availablePeriods: [],
  currentPeriod: null,
}

/* ── Hook ──────────────────────────────────────────────────── */

export function useDashboardData(month?: string) {
  const [data, setData] = useState<LiveDashboardData>(EMPTY)
  const [loading, setLoading] = useState(true) // true on mount → prevents mock flash
  const [error, setError] = useState<string | null>(null)
  const [hasLiveData, setHasLiveData] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const url = month
        ? `/api/dashboard-data?month=${encodeURIComponent(month)}`
        : '/api/dashboard-data'
      const res = await apiRaw(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const body = await res.json()

      const liveData: LiveDashboardData = {
        kpi: body.kpi ?? null,
        chargeability: body.chargeability ?? [],
        chargeabilitySub: [],
        chargeabilityBySubTeam: body.chargeabilityBySubTeam ?? [],
        compliance: body.compliance ?? [],
        complianceSub: [],
        complianceBySubTeam: body.complianceBySubTeam ?? [],
        chargeabilityByRegion: body.chargeabilityByRegion ?? [],
        complianceByRegion: body.complianceByRegion ?? [],
        chargeabilityTrendByDept: body.chargeabilityTrendByDept ?? [],
        chargeabilityTrendBySubTeam: body.chargeabilityTrendBySubTeam ?? [],
        complianceTrendByDept: body.complianceTrendByDept ?? [],
        complianceTrendBySubTeam: body.complianceTrendBySubTeam ?? [],
        deptStatusBreakdown: body.deptStatusBreakdown ?? [],
        timesheetGaps: body.timesheetGaps ?? [],
        timesheetGapsByTeam: body.timesheetGapsByTeam ?? [],
        allocation: body.allocation ?? [],
        employees: body.employees ?? [],
        capacityByServiceLine: body.capacityByServiceLine ?? [],
        capacityByLocation: body.capacityByLocation ?? [],
        utilizationTrend: body.utilizationTrend ?? [],
        overAllocList: body.overAllocList ?? [],
        projectList: body.projectList ?? [],
        lastRefreshed: new Date(),
        availablePeriods: body.availablePeriods ?? [],
        currentPeriod: body.currentPeriod ?? null,
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
  }, [month])

  // Auto-fetch on mount and when month changes
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
