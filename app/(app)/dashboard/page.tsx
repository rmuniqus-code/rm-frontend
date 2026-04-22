'use client'

import { useState, useMemo, useEffect } from 'react'
import styled from 'styled-components'
import StatCard from '@/components/shared/stat-card'
import ToggleView from '@/components/shared/toggle-view'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import {
  capacityByServiceLine,
  capacityByLocation,
  utilizationByMonth,
  forecastMonths,
  forecastByRole,
} from '@/data/mock-data'
import type { ForecastEntry } from '@/data/mock-data'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { Upload, Download, MapPin, Shield, TrendingUp, TrendingDown, RefreshCw, Trash2 } from 'lucide-react'
import { useRole } from '@/components/shared/role-context'
import DataTable from '@/components/shared/data-table'
import type { DataTableColumn } from '@/components/shared/data-table'
import { SelectFilter } from '@/components/shared/filter-bar'
import MultiSelect from '@/components/shared/multi-select'
import { useToast } from '@/components/shared/toast'
import ImportModal from '@/components/dashboard/import-modal'
import OutliersWidget from '@/components/dashboard/outliers-widget'
import { useDashboardData } from '@/hooks/use-dashboard-data'
import type { TimesheetGapRow, DashboardKPI, EmployeeRow, OverAllocResource } from '@/hooks/use-dashboard-data'
import { apiRaw } from '@/lib/api'
import { PageLoader } from '@/components/shared/page-loader'

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
`

const PageTitleArea = styled.div`
  h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text);
  }

  p {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-top: 4px;
  }
`

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`

const ActionBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
`

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const FilterLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
`

const FilterSelect = styled.select`
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 12px;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`

const TabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 24px;
  overflow-x: auto;
`

const Tab = styled.button<{ $active: boolean }>`
  padding: 10px 20px;
  font-size: 13px;
  font-weight: ${(p: { $active: boolean }) => p.$active ? 600 : 400};
  color: ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  border-bottom: 2px solid ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'transparent'};
  margin-bottom: -2px;
  white-space: nowrap;
  transition: all var(--transition-fast);
  &:hover { color: var(--color-primary); }
`

const SectionGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`

const TrendIcon = styled.span<{ $direction: string }>`
  display: inline-flex;
  align-items: center;
  color: ${(p: { $direction: string }) => p.$direction === 'up' ? 'var(--color-trend-up)' : 'var(--color-trend-down)'};
`

const StatusDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p: { $color: string }) => p.$color};
  margin-right: 6px;
`

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
`

const ChartToggle = styled.div`
  display: inline-flex;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
`

const ChartToggleBtn = styled.button<{ $active: boolean }>`
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: ${(p: { $active: boolean }) => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'transparent'};
  transition: all var(--transition-fast);
  &:hover { background: ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary-hover)' : 'var(--color-border-light)'}; }
`

const TimesheetViewRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`

const TimesheetSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
`

const SummaryStat = styled.div`
  padding: 12px 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  h4 { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  span { font-size: 20px; font-weight: 700; color: var(--color-danger); }
`

const InsightCards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  margin-top: 20px;
`

const InsightCard = styled.div`
  padding: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  border-left: 3px solid var(--color-primary);
  h4 { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  p { font-size: 12px; color: var(--color-text-secondary); }
`

const DASHBOARD_TABS = ['Overview', 'Chargeability', 'Compliance', 'Timesheet Gaps', 'Resource Allocation', 'Employee Details'] as const

const RoleBanner = styled.div<{ $role: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  border-radius: var(--border-radius);
  font-size: 13px;
  font-weight: 500;
  background: ${p =>
    p.$role === 'rm' ? 'var(--color-primary-light)' :
    p.$role === 'employee' ? '#fef3c7' :
    '#e0e7ff'};
  color: ${p =>
    p.$role === 'rm' ? 'var(--color-primary-dark)' :
    p.$role === 'employee' ? '#92400e' :
    '#3730a3'};
  border: 1px solid ${p =>
    p.$role === 'rm' ? 'var(--color-primary)' :
    p.$role === 'employee' ? '#f59e0b' :
    '#6366f1'};
`

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ChartCard = styled.div<{ $clickable?: boolean }>`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  cursor: ${p => p.$clickable ? 'pointer' : 'default'};
  transition: all var(--transition-fast);

  ${p => p.$clickable && `
    &:hover {
      box-shadow: var(--shadow-md);
      border-color: var(--color-primary);
    }
  `}

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 16px;
  }
`

const ForecastSection = styled.div`
  margin-top: 24px;
`

const ForecastGrid = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
`

const ForecastTable = styled.div`
  overflow-x: auto;
`

const FTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`

const FTh = styled.th`
  padding: 8px 12px;
  text-align: center;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  font-size: 11px;
`

const FThMonth = styled.th`
  padding: 6px 12px;
  text-align: center;
  font-weight: 700;
  color: var(--color-text);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
`

const FTd = styled.td<{ $level: number }>`
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-light);
  white-space: nowrap;
  padding-left: ${p => 12 + p.$level * 20}px;
`

const FTdValue = styled.td<{ $value: number | null }>`
  padding: 8px 12px;
  text-align: center;
  border-bottom: 1px solid var(--color-border-light);
  font-weight: 500;
  color: ${p =>
    p.$value === null ? 'var(--color-text-muted)' :
    p.$value > 50 ? 'var(--color-danger)' :
    p.$value > 30 ? 'var(--color-success)' :
    'var(--color-text-muted)'
  };
`

const RoleBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${p => p.$color};
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  margin-right: 8px;
`

const ExpandBtn = styled.button`
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;

  &:hover { color: var(--color-text); }
`

const ModalTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border-light);
  }

  tr:last-child td {
    border-bottom: none;
  }
`

type ModalType = null | 'kpi' | 'service-line' | 'location' | 'utilization'

interface KpiModalInfo {
  title: string
  value: string | number
}

export default function DashboardPage() {
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState<typeof DASHBOARD_TABS[number]>('Overview')
  const [timeView, setTimeView] = useState('Weekly')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [modalType, setModalType] = useState<ModalType>(null)
  const [kpiModal, setKpiModal] = useState<KpiModalInfo | null>(null)
  const [locationFilter, setLocationFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState<string[]>([])
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const [timesheetView, setTimesheetView] = useState<'W' | '4W' | 'M'>('W')
  const [timeRange, setTimeRange] = useState('6m')
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null)
  const { role: roleView, roleLabel } = useRole()
  const [importOpen, setImportOpen] = useState(false)
  const [chargeServiceLine, setChargeServiceLine] = useState<string[]>([])
  const [chargeSubSL, setChargeSubSL] = useState<string[]>([])
  const [chargeLocation, setChargeLocation] = useState<string[]>([])
  const [chargeRegion, setChargeRegion] = useState<string[]>([])
  const [chargeGrade, setChargeGrade] = useState<string[]>([])
  const [chargeChartType, setChargeChartType] = useState<'bar' | 'line'>('bar')
  const [compServiceLine, setCompServiceLine] = useState<string[]>([])
  const [compSubSL, setCompSubSL] = useState<string[]>([])
  const [compLocation, setCompLocation] = useState<string[]>([])
  const [compRegion, setCompRegion] = useState<string[]>([])
  const [compGrade, setCompGrade] = useState<string[]>([])
  const [compChartType, setCompChartType] = useState<'bar' | 'line'>('bar')
  // Employee Details tab filters
  const [empDetailSubSL, setEmpDetailSubSL] = useState<string[]>([])
  const [empDetailRegion, setEmpDetailRegion] = useState<string[]>([])
  const [empDetailLocation, setEmpDetailLocation] = useState<string[]>([])
  const [empDetailGrade, setEmpDetailGrade] = useState<string[]>([])
  // Resource Allocation tab filters
  const [allocRegion, setAllocRegion] = useState<string[]>([])
  const [allocLocation, setAllocLocation] = useState<string[]>([])
  const { data: liveData, loading: liveLoading, hasLiveData, refresh: refreshLive } = useDashboardData()

  // ── Data source: live data only — no mock fallback ──
  const kpiData: DashboardKPI = (liveData.kpi ?? {
    totalCapacity: 0, forecastedFte: 0, utilization: 0, avgCompliance: 0,
    benchCount: 0, timesheetGapCount: 0, overAllocated: 0, variance: 0,
  }) as DashboardKPI
  const chargeabilityData = liveData.chargeability
  const chargeabilitySubData = liveData.chargeabilitySub
  const complianceData = liveData.compliance
  const complianceSubData = liveData.complianceSub
  const timesheetNotFilledData: TimesheetGapRow[] = liveData.timesheetGaps as TimesheetGapRow[]
  const arcAllTeamsData = liveData.allocation
  const employeeDetailData = liveData.employees

  // Chart data — live with mock fallback
  const capacityByServiceLineData = hasLiveData && liveData.capacityByServiceLine.length > 0
    ? liveData.capacityByServiceLine.map(r => ({ serviceLine: r.serviceLine!, capacity: r.capacity, forecast: r.forecast, actual: r.actual, subServiceLines: r.subServiceLines ?? [] }))
    : capacityByServiceLine
  const capacityByLocationData = hasLiveData && liveData.capacityByLocation.length > 0
    ? liveData.capacityByLocation.map(r => ({ location: r.location!, capacity: r.capacity, forecast: r.forecast, actual: r.actual }))
    : capacityByLocation
  const utilizationData = hasLiveData && liveData.utilizationTrend.length > 0
    ? liveData.utilizationTrend.map(r => ({ month: r.week, forecast: r.forecast, actual: r.actual }))
    : utilizationByMonth
  const liveOverAllocList = hasLiveData ? liveData.overAllocList : []
  const liveProjectList = hasLiveData ? liveData.projectList : []

  const handleImportComplete = () => {
    addToast('Data imported successfully — refreshing dashboard…', 'success')
    refreshLive()
  }

  const allWeeks = forecastMonths.flatMap(m => m.weeks.map(w => ({ month: m.month, week: w })))

  const locations = useMemo(() =>
    Array.from(new Set(capacityByLocationData.map(l => l.location))),
    [capacityByLocationData]
  )

  const departments = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.department).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const subServiceLines = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.subFunction).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const empLocations = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.location).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const empRegions = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.region).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const grades = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.designation).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const serviceLines = useMemo(() =>
    Array.from(new Set(chargeabilityData.map(d => d.department).filter(Boolean))).sort(),
    [chargeabilityData]
  )

  // Region → locations cascade map derived from live employee data
  const dashRegionToLocations = useMemo(() => {
    const map = new Map<string, Set<string>>()
    employeeDetailData.forEach(e => {
      if (!e.region || !e.location) return
      if (!map.has(e.region)) map.set(e.region, new Set())
      map.get(e.region)!.add(e.location)
    })
    return map
  }, [employeeDetailData])

  // Chargeability tab: locations filtered by chargeRegion (multi-select)
  const filteredChargeLocations = useMemo(() => {
    if (chargeRegion.length === 0) return empLocations
    const inRegions = new Set(chargeRegion.flatMap(r => [...(dashRegionToLocations.get(r) ?? [])]))
    return empLocations.filter(l => inRegions.has(l))
  }, [chargeRegion, empLocations, dashRegionToLocations])

  // Compliance tab: locations filtered by compRegion (multi-select)
  const filteredCompLocations = useMemo(() => {
    if (compRegion.length === 0) return empLocations
    const inRegions = new Set(compRegion.flatMap(r => [...(dashRegionToLocations.get(r) ?? [])]))
    return empLocations.filter(l => inRegions.has(l))
  }, [compRegion, empLocations, dashRegionToLocations])

  // Employee Details tab: locations filtered by region represented in locationFilter
  const dashAllRegions = empRegions // already computed

  // Reset locations when region changes (multi-select: keep only still-valid selections)
  useEffect(() => {
    setChargeLocation(prev => prev.filter(l => filteredChargeLocations.includes(l)))
  }, [filteredChargeLocations])

  useEffect(() => {
    setCompLocation(prev => prev.filter(l => filteredCompLocations.includes(l)))
  }, [filteredCompLocations])

  // Service Line → Sub-Service Line cascade map
  const deptToSubFunctions = useMemo(() => {
    const map = new Map<string, Set<string>>()
    employeeDetailData.forEach(e => {
      if (!e.department || !e.subFunction) return
      if (!map.has(e.department)) map.set(e.department, new Set())
      map.get(e.department)!.add(e.subFunction)
    })
    return map
  }, [employeeDetailData])

  // Chargeability tab: sub-SLs filtered by chargeServiceLine (multi-select)
  const filteredChargeSubSLs = useMemo(() => {
    if (chargeServiceLine.length === 0) return subServiceLines
    const inDepts = new Set(chargeServiceLine.flatMap(d => [...(deptToSubFunctions.get(d) ?? [])]))
    return subServiceLines.filter(s => inDepts.has(s))
  }, [chargeServiceLine, subServiceLines, deptToSubFunctions])

  // Compliance tab: sub-SLs filtered by compServiceLine (multi-select)
  const filteredCompSubSLs = useMemo(() => {
    if (compServiceLine.length === 0) return subServiceLines
    const inDepts = new Set(compServiceLine.flatMap(d => [...(deptToSubFunctions.get(d) ?? [])]))
    return subServiceLines.filter(s => inDepts.has(s))
  }, [compServiceLine, subServiceLines, deptToSubFunctions])

  // Employee Details tab: sub-SLs and locations filtered by dept/region (multi-select)
  const filteredEmpSubSLs = useMemo(() => {
    if (deptFilter.length === 0) return subServiceLines
    const inDepts = new Set(deptFilter.flatMap(d => [...(deptToSubFunctions.get(d) ?? [])]))
    return subServiceLines.filter(s => inDepts.has(s))
  }, [deptFilter, subServiceLines, deptToSubFunctions])

  const filteredEmpDetailLocations = useMemo(() => {
    if (empDetailRegion.length === 0) return empLocations
    const inRegions = new Set(empDetailRegion.flatMap(r => [...(dashRegionToLocations.get(r) ?? [])]))
    return empLocations.filter(l => inRegions.has(l))
  }, [empDetailRegion, empLocations, dashRegionToLocations])

  // Reset cascaded sub-SL when service line changes
  useEffect(() => {
    setChargeSubSL(prev => prev.filter(s => filteredChargeSubSLs.includes(s)))
  }, [filteredChargeSubSLs])

  useEffect(() => {
    setCompSubSL(prev => prev.filter(s => filteredCompSubSLs.includes(s)))
  }, [filteredCompSubSLs])

  // Reset Employee Details cascaded filters
  useEffect(() => {
    setEmpDetailSubSL(prev => prev.filter(s => filteredEmpSubSLs.includes(s)))
  }, [filteredEmpSubSLs])

  useEffect(() => {
    setEmpDetailLocation(prev => prev.filter(l => filteredEmpDetailLocations.includes(l)))
  }, [filteredEmpDetailLocations])

  // Resource Allocation tab: locations filtered by allocRegion (multi-select)
  const filteredAllocLocations = useMemo(() => {
    if (allocRegion.length === 0) return empLocations
    const inRegions = new Set(allocRegion.flatMap(r => [...(dashRegionToLocations.get(r) ?? [])]))
    return empLocations.filter(l => inRegions.has(l))
  }, [allocRegion, empLocations, dashRegionToLocations])

  useEffect(() => {
    setAllocLocation(prev => prev.filter(l => filteredAllocLocations.includes(l)))
  }, [filteredAllocLocations])

  const filteredCapacityByLocation = useMemo(() => {
    if (locationFilter === 'all') return capacityByLocationData
    return capacityByLocationData.filter(l => l.location === locationFilter)
  }, [locationFilter, capacityByLocationData])

  // Over-allocated & bench lists — live data when available
  const overAllocatedResources = useMemo(() => liveOverAllocList, [liveOverAllocList])

  const benchResources = useMemo(() => [] as OverAllocResource[], [])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openKpiModal = (title: string, value: string | number) => {
    setKpiModal({ title, value })
    setModalType('kpi')
  }

  const renderForecastRows = (entries: ForecastEntry[], level: number): React.ReactNode[] => {
    return entries.flatMap(entry => {
      const isExpanded = expanded.has(entry.id)
      const hasChildren = entry.children && entry.children.length > 0

      return [
        <tr key={entry.id}>
          <FTd $level={level} style={{ position: 'sticky', left: 0, background: 'var(--color-bg-card)', zIndex: 1, minWidth: 200 }}>
            {hasChildren && (
              <ExpandBtn onClick={() => toggleExpand(entry.id)}>
                {isExpanded ? '▾' : '▸'}
              </ExpandBtn>
            )}
            <RoleBadge $color={entry.color}>{entry.shortCode}</RoleBadge>
            {entry.name}
          </FTd>
          {allWeeks.map(({ month, week }) => {
            const key = `${month}|${week}`
            const val = entry.weeklyUtilization[key]
            return (
              <FTdValue key={key} $value={val ?? null}>
                {val !== null && val !== undefined ? `${val.toFixed(1)}%` : '—'}
              </FTdValue>
            )
          })}
        </tr>,
        ...(isExpanded && hasChildren ? renderForecastRows(entry.children!, level + 1) : []),
      ]
    })
  }

  // (overAllocatedResources & benchResources defined above via useMemo)

  // ── Forecasting data used in sub-tabs ──
  const chargeabilityCols: DataTableColumn<typeof chargeabilityData[0]>[] = [
    { key: 'department', header: 'Department', render: (row) => <span style={{ fontWeight: 500 }}>{row.department}</span> },
    { key: 'current', header: 'Current %', align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.current}%</span> },
    { key: 'previous', header: 'Previous %', align: 'center', render: (row) => <span style={{ color: 'var(--color-text-secondary)' }}>{row.previous}%</span> },
    { key: 'trend', header: 'Trend', align: 'center', render: (row) => (
      <TrendIcon $direction={row.current >= row.previous ? 'up' : 'down'}>
        {row.current >= row.previous ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      </TrendIcon>
    )},
  ]

  const complianceCols: DataTableColumn<typeof complianceData[0]>[] = [
    { key: 'department', header: 'Department', render: (row) => <span style={{ fontWeight: 500 }}>{row.department}</span> },
    { key: 'current', header: 'Current %', align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.current}%</span> },
    { key: 'previous', header: 'Previous %', align: 'center', render: (row) => <span>{row.previous}%</span> },
  ]

  const timesheetCols: DataTableColumn<typeof timesheetNotFilledData[0]>[] = [
    { key: 'name', header: 'Employee Name', render: (row) => <span style={{ fontWeight: 600 }}>{row.name || '—'}</span> },
    { key: 'department', header: 'Department' },
    { key: 'designation', header: 'Designation' },
    { key: 'period', header: 'Period' },
    { key: 'compliancePct', header: 'Compliance %', align: 'center', render: (row) => <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{row.compliancePct ?? 0}%</span> },
  ]

  const allocCols: DataTableColumn<typeof arcAllTeamsData[0]>[] = [
    { key: 'location', header: 'Location', render: (row) => <span style={{ fontWeight: 500 }}>{row.location}</span> },
    { key: 'region', header: 'Region' },
    { key: 'analyst', header: 'Analyst', align: 'center', render: (row) => <span>{row.analyst ?? '—'}</span> },
    { key: 'assocConsultant', header: 'Assoc. Consultant', align: 'center', render: (row) => <span>{row.assocConsultant ?? '—'}</span> },
    { key: 'consultant', header: 'Consultant', align: 'center', render: (row) => <span>{row.consultant ?? '—'}</span> },
    { key: 'asstManager', header: 'Asst. Manager', align: 'center', render: (row) => <span>{row.asstManager ?? '—'}</span> },
    { key: 'manager', header: 'Manager', align: 'center', render: (row) => <span>{row.manager ?? '—'}</span> },
    { key: 'assocDirector', header: 'Assoc. Director', align: 'center', render: (row) => <span>{row.assocDirector ?? '—'}</span> },
    { key: 'total', header: 'Total', align: 'center', render: (row) => <span style={{ fontWeight: 700 }}>{row.total}</span> },
  ]

  const empCols: DataTableColumn<typeof employeeDetailData[0]>[] = [
    { key: 'department', header: 'Dept' },
    { key: 'subFunction', header: 'Sub-Function' },
    { key: 'empId', header: 'Emp ID', render: (row) => <span style={{ fontFamily: 'monospace' }}>{row.empId}</span> },
    { key: 'name', header: 'Name', render: (row) => (
      <span><StatusDot $color={row.status === 'green' ? 'var(--color-success)' : 'var(--color-danger)'} />{row.name}</span>
    )},
    { key: 'email', header: 'Email' },
    { key: 'designation', header: 'Designation' },
    { key: 'location', header: 'Location' },
    { key: 'dateOfJoining', header: 'DOJ' },
  ]

  const demandForecastData = useMemo(() => {
    const allData = [
      { month: 'Jan', demand: 40, supply: 45 },
      { month: 'Feb', demand: 42, supply: 46 },
      { month: 'Mar', demand: 44, supply: 47 },
      { month: 'Apr', demand: 45, supply: 48 },
      { month: 'May', demand: 52, supply: 48 },
      { month: 'Jun', demand: 48, supply: 47 },
      { month: 'Jul', demand: 55, supply: 46 },
      { month: 'Aug', demand: 50, supply: 48 },
      { month: 'Sep', demand: 53, supply: 49 },
      { month: 'Oct', demand: 49, supply: 50 },
      { month: 'Nov', demand: 46, supply: 50 },
      { month: 'Dec', demand: 44, supply: 51 },
    ]
    const count = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12
    return allData.slice(3, 3 + count)
  }, [timeRange])

  const filteredChargeability = useMemo(() => {
    if (deptFilter.length === 0) return chargeabilityData
    return chargeabilityData.filter(d => deptFilter.includes(d.department))
  }, [deptFilter, chargeabilityData])

  // ── Chargeability tab filtered data ──
  const chargeFilteredDepts = useMemo(() => {
    if (chargeLocation.length === 0 && chargeRegion.length === 0 && chargeGrade.length === 0 && chargeSubSL.length === 0) return null
    const matched = employeeDetailData.filter(e => {
      if (chargeLocation.length > 0 && !chargeLocation.includes(e.location)) return false
      if (chargeRegion.length > 0 && !chargeRegion.includes(e.region)) return false
      if (chargeGrade.length > 0 && !chargeGrade.includes(e.designation)) return false
      if (chargeSubSL.length > 0 && !chargeSubSL.includes(e.subFunction)) return false
      return true
    })
    return new Set(matched.map(e => e.department).filter(Boolean))
  }, [chargeLocation, chargeRegion, chargeGrade, chargeSubSL, employeeDetailData])

  const filteredChargeabilityTab = useMemo(() => {
    let data = chargeabilityData
    if (chargeServiceLine.length > 0) data = data.filter(d => chargeServiceLine.includes(d.department))
    if (chargeFilteredDepts !== null) data = data.filter(d => chargeFilteredDepts.has(d.department))
    return data
  }, [chargeabilityData, chargeServiceLine, chargeFilteredDepts])

  // ── Compliance tab filtered data ──
  const compFilteredDepts = useMemo(() => {
    if (compLocation.length === 0 && compRegion.length === 0 && compGrade.length === 0 && compSubSL.length === 0) return null
    const matched = employeeDetailData.filter(e => {
      if (compLocation.length > 0 && !compLocation.includes(e.location)) return false
      if (compRegion.length > 0 && !compRegion.includes(e.region)) return false
      if (compGrade.length > 0 && !compGrade.includes(e.designation)) return false
      if (compSubSL.length > 0 && !compSubSL.includes(e.subFunction)) return false
      return true
    })
    return new Set(matched.map(e => e.department).filter(Boolean))
  }, [compLocation, compRegion, compGrade, compSubSL, employeeDetailData])

  const filteredComplianceTab = useMemo(() => {
    let data = complianceData
    if (compServiceLine.length > 0) data = data.filter(d => compServiceLine.includes(d.department))
    if (compFilteredDepts !== null) data = data.filter(d => compFilteredDepts.has(d.department))
    return data
  }, [complianceData, compServiceLine, compFilteredDepts])

  const filteredEmployees = useMemo(() => {
    let data = employeeDetailData
    if (deptFilter.length > 0) data = data.filter(d => deptFilter.includes(d.department))
    if (empDetailSubSL.length > 0) data = data.filter(d => empDetailSubSL.includes(d.subFunction))
    if (empDetailRegion.length > 0) data = data.filter(d => empDetailRegion.includes(d.region))
    if (empDetailLocation.length > 0) data = data.filter(d => empDetailLocation.includes(d.location))
    if (empDetailGrade.length > 0) data = data.filter(d => empDetailGrade.includes(d.designation))
    return data
  }, [deptFilter, empDetailSubSL, empDetailRegion, empDetailLocation, empDetailGrade, employeeDetailData])

  const filteredAllocation = useMemo(() => {
    let data = arcAllTeamsData
    if (allocRegion.length > 0) data = data.filter(d => allocRegion.includes(d.region))
    if (allocLocation.length > 0) data = data.filter(d => allocLocation.includes(d.location))
    return data
  }, [allocRegion, allocLocation, arcAllTeamsData])

  const gapBySkill = [
    { skill: 'Data Analytics', gap: 3 },
    { skill: 'Cloud Architecture', gap: 2 },
    { skill: 'M&A', gap: 1 },
    { skill: 'Transfer Pricing', gap: 2 },
    { skill: 'Project Management', gap: 1 },
  ]

  // Timesheet gaps aggregated by department for chart
  const timesheetGapsByDept = useMemo(() => {
    const map = new Map<string, { count: number; avgCompliance: number; total: number }>()
    timesheetNotFilledData.forEach(r => {
      const dept = r.department || 'Unknown'
      if (!map.has(dept)) map.set(dept, { count: 0, avgCompliance: 0, total: 0 })
      const entry = map.get(dept)!
      entry.count += 1
      entry.avgCompliance += (r.compliancePct ?? 0)
      entry.total += 1
    })
    return [...map.entries()]
      .map(([department, v]) => ({
        department,
        gaps: v.count,
        avgCompliance: v.total > 0 ? Math.round(v.avgCompliance / v.total) : 0,
      }))
      .sort((a, b) => b.gaps - a.gaps)
  }, [timesheetNotFilledData])

  if (liveLoading && !hasLiveData) return <PageLoader message="Loading dashboard…" />

  return (
    <div>
      <PageHeader>
        <PageTitleArea>
          <h1>Dashboard</h1>
          <p>Resource capacity overview and forecasting</p>
        </PageTitleArea>
        <HeaderActions>
          <ActionBtn onClick={() => setImportOpen(true)}><Upload size={16} /> Import</ActionBtn>
          {hasLiveData && (
            <ActionBtn onClick={refreshLive} disabled={liveLoading}>
              <RefreshCw size={16} style={liveLoading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
            </ActionBtn>
          )}
          <ActionBtn><Download size={16} /> Export</ActionBtn>
          {process.env.NODE_ENV === 'development' && (
            <ActionBtn
              onClick={async () => {
                if (!confirm('This will delete ALL data from the database. Continue?')) return
                const res = await apiRaw('/api/reset-db', { method: 'POST' })
                const json = await res.json()
                if (json.success) {
                  addToast('Database reset successfully', 'success')
                  // Notify all data consumers (requests context, outliers, etc.)
                  window.dispatchEvent(new Event('db-reset'))
                  refreshLive()
                } else {
                  addToast(`Reset failed: ${json.errors?.join(', ') || json.error}`, 'error')
                }
              }}
              style={{ borderColor: 'var(--color-error, #e53e3e)', color: 'var(--color-error, #e53e3e)' }}
            >
              <Trash2 size={16} /> Reset DB
            </ActionBtn>
          )}
        </HeaderActions>
      </PageHeader>

      <RoleBanner $role={roleView}>
        <Shield size={14} /> Viewing as: {roleLabel}
        {hasLiveData && liveData.lastRefreshed && (
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>
            Live data • updated {liveData.lastRefreshed.toLocaleTimeString()}
          </span>
        )}
      </RoleBanner>

      <KpiGrid>
        <StatCard title="Avg Chargeability" value={`${kpiData.utilization}%`} change={-1} onClick={() => openKpiModal('Avg Chargeability', `${kpiData.utilization}%`)} />
        <StatCard title="Avg Compliance" value={`${kpiData.avgCompliance ?? 0}%`} change={2} onClick={() => openKpiModal('Avg Compliance', `${kpiData.avgCompliance ?? 0}%`)} />
        <StatCard title="Total Headcount" value={kpiData.totalCapacity} subtitle="FTEs" change={4} onClick={() => openKpiModal('Total Headcount', kpiData.totalCapacity)} />
        <StatCard title="Timesheet Gaps" value={kpiData.timesheetGapCount ?? kpiData.benchCount} change={-12} onClick={() => openKpiModal('Timesheet Gaps', kpiData.timesheetGapCount ?? kpiData.benchCount)} />
      </KpiGrid>

      <TabBar>
        {DASHBOARD_TABS.map(tab => (
          <Tab key={tab} $active={activeTab === tab} onClick={() => setActiveTab(tab)}>
            {tab}
          </Tab>
        ))}
      </TabBar>

      {activeTab === 'Overview' && (
        <>
          {/* Outliers Widget */}
          <OutliersWidget />

          <ChartCard style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Chargeability by Department{deptFilter.length > 0 ? ` (${deptFilter.join(', ')})` : ''}</h3>
              <ChartToggle>
                <ChartToggleBtn $active={chartType === 'bar'} onClick={() => setChartType('bar')}>Bar</ChartToggleBtn>
                <ChartToggleBtn $active={chartType === 'line'} onClick={() => setChartType('line')}>Line</ChartToggleBtn>
              </ChartToggle>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {chartType === 'bar' ? (
                <BarChart data={filteredChargeability}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="current" fill="var(--color-primary)" name="Current Period" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previous" fill="var(--color-primary-light)" name="Previous Period" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={filteredChargeability}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="current" stroke="var(--color-primary)" name="Current Period" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="previous" stroke="var(--color-primary-light)" name="Previous Period" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}

      {activeTab === 'Chargeability' && (
        <>
          <FilterRow style={{ flexWrap: 'wrap' }}>
            <FilterLabel>Service Line:</FilterLabel>
            <MultiSelect options={serviceLines} values={chargeServiceLine} onChange={setChargeServiceLine} placeholder="All Service Lines" />
            <FilterLabel>Sub-Service Line:</FilterLabel>
            <MultiSelect options={filteredChargeSubSLs} values={chargeSubSL} onChange={setChargeSubSL} placeholder="All Sub-SLs" />
            <FilterLabel>Region:</FilterLabel>
            <MultiSelect options={dashAllRegions} values={chargeRegion} onChange={setChargeRegion} placeholder="All Regions" />
            <FilterLabel>Location:</FilterLabel>
            <MultiSelect options={filteredChargeLocations} values={chargeLocation} onChange={setChargeLocation} placeholder="All Locations" />
            <FilterLabel>Grade:</FilterLabel>
            <MultiSelect options={grades} values={chargeGrade} onChange={setChargeGrade} placeholder="All Grades" />
            <ChartToggle style={{ marginLeft: 'auto' }}>
              <ChartToggleBtn $active={chargeChartType === 'bar'} onClick={() => setChargeChartType('bar')}>Bar</ChartToggleBtn>
              <ChartToggleBtn $active={chargeChartType === 'line'} onClick={() => setChargeChartType('line')}>Line</ChartToggleBtn>
            </ChartToggle>
          </FilterRow>
          <ChartCard style={{ marginBottom: 20 }}>
            <h3>Chargeability by Department ({filteredChargeabilityTab.length} departments)</h3>
            <ResponsiveContainer width="100%" height={300}>
              {chargeChartType === 'bar' ? (
                <BarChart data={filteredChargeabilityTab}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                  <Legend />
                  <Bar dataKey="current" fill="var(--color-primary)" name="Current Period" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previous" fill="var(--color-primary-light)" name="Previous Period" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={filteredChargeabilityTab}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="current" stroke="var(--color-primary)" name="Current Period" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="previous" stroke="var(--color-primary-light)" name="Previous Period" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </ChartCard>
          <SectionGrid>
            <DataTable columns={chargeabilityCols} data={filteredChargeabilityTab} title="All Departments" />
            <DataTable columns={chargeabilityCols} data={chargeabilitySubData} title="ARC Sub-Teams" />
          </SectionGrid>
        </>
      )}

      {activeTab === 'Compliance' && (
        <>
          <FilterRow style={{ flexWrap: 'wrap' }}>
            <FilterLabel>Service Line:</FilterLabel>
            <MultiSelect options={serviceLines} values={compServiceLine} onChange={setCompServiceLine} placeholder="All Service Lines" />
            <FilterLabel>Sub-Service Line:</FilterLabel>
            <MultiSelect options={filteredCompSubSLs} values={compSubSL} onChange={setCompSubSL} placeholder="All Sub-SLs" />
            <FilterLabel>Region:</FilterLabel>
            <MultiSelect options={dashAllRegions} values={compRegion} onChange={setCompRegion} placeholder="All Regions" />
            <FilterLabel>Location:</FilterLabel>
            <MultiSelect options={filteredCompLocations} values={compLocation} onChange={setCompLocation} placeholder="All Locations" />
            <FilterLabel>Grade:</FilterLabel>
            <MultiSelect options={grades} values={compGrade} onChange={setCompGrade} placeholder="All Grades" />
            <ChartToggle style={{ marginLeft: 'auto' }}>
              <ChartToggleBtn $active={compChartType === 'bar'} onClick={() => setCompChartType('bar')}>Bar</ChartToggleBtn>
              <ChartToggleBtn $active={compChartType === 'line'} onClick={() => setCompChartType('line')}>Line</ChartToggleBtn>
            </ChartToggle>
          </FilterRow>
          <ChartCard style={{ marginBottom: 20 }}>
            <h3>Timesheet Compliance by Department ({filteredComplianceTab.length} departments)</h3>
            <ResponsiveContainer width="100%" height={300}>
              {compChartType === 'bar' ? (
                <BarChart data={filteredComplianceTab}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                  <Legend />
                  <Bar dataKey="current" fill="var(--color-success, #22c55e)" name="Current Period" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previous" fill="#86efac" name="Previous Period" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={filteredComplianceTab}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="current" stroke="var(--color-success, #22c55e)" name="Current Period" strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="previous" stroke="#86efac" name="Previous Period" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </ChartCard>
          <SectionGrid>
            <DataTable columns={complianceCols} data={filteredComplianceTab} title="Timesheet Compliance" />
            <DataTable columns={complianceCols} data={complianceSubData} title="ARC Compliance" />
          </SectionGrid>
        </>
      )}

      {activeTab === 'Timesheet Gaps' && (
        <>
          <TimesheetViewRow>
            <FilterLabel>View:</FilterLabel>
            <ChartToggle>
              <ChartToggleBtn $active={timesheetView === 'W'} onClick={() => setTimesheetView('W')}>Weekly</ChartToggleBtn>
              <ChartToggleBtn $active={timesheetView === '4W'} onClick={() => setTimesheetView('4W')}>4 Weeks</ChartToggleBtn>
              <ChartToggleBtn $active={timesheetView === 'M'} onClick={() => setTimesheetView('M')}>Monthly</ChartToggleBtn>
            </ChartToggle>
          </TimesheetViewRow>
          <TimesheetSummary>
            <SummaryStat>
              <h4>Total With Gaps</h4>
              <span>{timesheetNotFilledData.length}</span>
            </SummaryStat>
            <SummaryStat>
              <h4>Departments Affected</h4>
              <span>{new Set(timesheetNotFilledData.map(r => r.department).filter(Boolean)).size}</span>
            </SummaryStat>
            <SummaryStat>
              <h4>Period</h4>
              <span style={{ fontSize: 14, color: 'var(--color-primary)' }}>{timesheetNotFilledData[0]?.period ?? '—'}</span>
            </SummaryStat>
          </TimesheetSummary>
          {timesheetGapsByDept.length > 0 && (
            <ChartCard style={{ marginBottom: 20 }}>
              <h3>Timesheet Gaps by Department</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={timesheetGapsByDept}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="gaps" fill="var(--color-danger, #ef4444)" name="Employees with Gaps" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgCompliance" fill="var(--color-primary-light)" name="Avg Compliance %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          <DataTable columns={timesheetCols} data={timesheetNotFilledData} title={`Timesheet Not Filled — ${timesheetView === 'W' ? 'Weekly' : timesheetView === '4W' ? '4-Week' : 'Monthly'} View`} />
        </>
      )}

      {activeTab === 'Resource Allocation' && (
        <>
          <FilterRow style={{ flexWrap: 'wrap' }}>
            <FilterLabel>Region:</FilterLabel>
            <MultiSelect options={empRegions} values={allocRegion} onChange={setAllocRegion} placeholder="All Regions" />
            <FilterLabel>Location:</FilterLabel>
            <MultiSelect options={filteredAllocLocations} values={allocLocation} onChange={setAllocLocation} placeholder="All Locations" />
          </FilterRow>
          <DataTable
            columns={allocCols}
            data={filteredAllocation}
            title="ARC All Teams — Headcount by Location"
            totalRow={{
              location: 'Grand Total',
              region: '',
              total: String(filteredAllocation.reduce((s, r) => s + r.total, 0)),
            }}
          />
        </>
      )}

      {activeTab === 'Employee Details' && (
        <>
          <FilterRow style={{ flexWrap: 'wrap' }}>
            <FilterLabel>Service Line:</FilterLabel>
            <MultiSelect options={departments} values={deptFilter} onChange={setDeptFilter} placeholder="All Service Lines" />
            <FilterLabel>Sub-Service Line:</FilterLabel>
            <MultiSelect options={filteredEmpSubSLs} values={empDetailSubSL} onChange={setEmpDetailSubSL} placeholder="All Sub-SLs" />
            <FilterLabel>Region:</FilterLabel>
            <MultiSelect options={empRegions} values={empDetailRegion} onChange={setEmpDetailRegion} placeholder="All Regions" />
            <FilterLabel>Location:</FilterLabel>
            <MultiSelect options={filteredEmpDetailLocations} values={empDetailLocation} onChange={setEmpDetailLocation} placeholder="All Locations" />
            <FilterLabel>Grade:</FilterLabel>
            <MultiSelect options={grades} values={empDetailGrade} onChange={setEmpDetailGrade} placeholder="All Grades" />
          </FilterRow>
          <DataTable
            columns={empCols}
            data={filteredEmployees}
            title={`Employee Details (${filteredEmployees.length})`}
            onRowClick={(row) => setSelectedEmployee(row)}
          />
        </>
      )}

      {/* KPI Detail Modal */}
      <Modal
        open={modalType === 'kpi' && !!kpiModal}
        onClose={() => { setModalType(null); setKpiModal(null) }}
        title={kpiModal?.title ?? ''}
        subtitle="Detailed breakdown"
        size="lg"
      >
        <Section>
          <SectionTitle>Summary</SectionTitle>
          <DetailGrid $cols={3}>
            <DetailItem><label>Current Value</label><span>{kpiModal?.value}</span></DetailItem>
            <DetailItem><label>Total Resources</label><span>{liveData.employees.length}</span></DetailItem>
            <DetailItem><label>Active Projects</label><span>{liveProjectList.filter(p => p.status === 'active').length}</span></DetailItem>
          </DetailGrid>
        </Section>
        {kpiModal?.title === 'Over-Allocated' && (
          <Section>
            <SectionTitle>Over-Allocated Resources</SectionTitle>
            <ModalTable>
              <thead><tr><th>Resource</th><th>Allocation %</th><th>Projects</th><th>Week</th></tr></thead>
              <tbody>
                {overAllocatedResources.map(r => (
                  <tr key={`${r.id}-${r.weekStart}`}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{r.totalAllocation}%</td>
                    <td>{r.projectCount}</td>
                    <td>{r.weekStart}</td>
                  </tr>
                ))}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {kpiModal?.title === 'On Bench' && (
          <Section>
            <SectionTitle>Bench Resources</SectionTitle>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No bench data available from live data yet.</p>
          </Section>
        )}
        {kpiModal?.title === 'Avg Chargeability' && (
          <Section>
            <SectionTitle>Chargeability by Service Line</SectionTitle>
            <ModalTable>
              <thead><tr><th>Service Line</th><th>Current %</th><th>Previous %</th><th>Trend</th></tr></thead>
              <tbody>
                {chargeabilityData.map(d => (
                  <tr key={d.department}>
                    <td style={{ fontWeight: 500 }}>{d.department}</td>
                    <td style={{ fontWeight: 600 }}>{d.current}%</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{d.previous}%</td>
                    <td>
                      <TrendIcon $direction={d.current >= d.previous ? 'up' : 'down'}>
                        {d.current >= d.previous ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        <span style={{ marginLeft: 4, fontSize: 12 }}>{d.current >= d.previous ? '+' : ''}{d.current - d.previous}%</span>
                      </TrendIcon>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {kpiModal?.title === 'Avg Compliance' && (
          <Section>
            <SectionTitle>Compliance by Service Line</SectionTitle>
            <ModalTable>
              <thead><tr><th>Service Line</th><th>Current %</th><th>Previous %</th><th>Trend</th></tr></thead>
              <tbody>
                {complianceData.map(d => (
                  <tr key={d.department}>
                    <td style={{ fontWeight: 500 }}>{d.department}</td>
                    <td style={{ fontWeight: 600 }}>{d.current}%</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{d.previous}%</td>
                    <td>
                      <TrendIcon $direction={d.current >= d.previous ? 'up' : 'down'}>
                        {d.current >= d.previous ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        <span style={{ marginLeft: 4, fontSize: 12 }}>{d.current >= d.previous ? '+' : ''}{d.current - d.previous}%</span>
                      </TrendIcon>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {kpiModal?.title === 'Timesheet Gaps' && (
          <Section>
            <SectionTitle>About Timesheet Gaps</SectionTitle>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              Timesheet gaps are counted for employees whose compliance percentage is <strong>0%</strong> — i.e. they have not filled any timesheet for the period.
            </p>
          </Section>
        )}
      </Modal>

      {/* Service Line Breakdown Modal */}
      <Modal
        open={modalType === 'service-line'}
        onClose={() => setModalType(null)}
        title="Capacity vs Forecast by Service Line"
        subtitle="Detailed breakdown by service line and sub-service lines"
        size="lg"
      >
        {capacityByServiceLineData.map(sl => (
          <Section key={sl.serviceLine}>
            <SectionTitle>{sl.serviceLine}</SectionTitle>
            <DetailGrid $cols={4}>
              <DetailItem><label>Capacity</label><span>{sl.capacity} FTEs</span></DetailItem>
              <DetailItem><label>Forecast</label><span>{sl.forecast} FTEs</span></DetailItem>
              <DetailItem><label>Actual</label><span>{sl.actual} FTEs</span></DetailItem>
              <DetailItem><label>Variance</label><span>{(sl.capacity - sl.forecast).toFixed(1)} FTEs</span></DetailItem>
            </DetailGrid>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Sub-service lines: {sl.subServiceLines.join(', ')}
            </div>
          </Section>
        ))}
      </Modal>

      {/* Location Breakdown Modal */}
      <Modal
        open={modalType === 'location'}
        onClose={() => setModalType(null)}
        title="Capacity vs Forecast by Location"
        subtitle="Detailed breakdown by office location"
        size="lg"
      >
        <ModalTable>
          <thead>
            <tr>
              <th>Location</th>
              <th>Capacity</th>
              <th>Forecast</th>
              <th>Actual</th>
              <th>Utilization</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {capacityByLocationData.map(loc => (
              <tr key={loc.location}>
                <td style={{ fontWeight: 500 }}>{loc.location}</td>
                <td>{loc.capacity}</td>
                <td>{loc.forecast}</td>
                <td>{loc.actual}</td>
                <td>{loc.capacity > 0 ? `${((loc.actual / loc.capacity) * 100).toFixed(0)}%` : '—'}</td>
                <td style={{ color: loc.capacity - loc.forecast > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {(loc.capacity - loc.forecast).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </ModalTable>
      </Modal>

      {/* Utilization Trend Modal */}
      <Modal
        open={modalType === 'utilization'}
        onClose={() => setModalType(null)}
        title="Utilization Trend"
        subtitle="Month-over-month utilization comparison"
        size="md"
      >
        <ModalTable>
          <thead>
            <tr><th>Month</th><th>Forecast</th><th>Actual</th><th>Gap</th></tr>
          </thead>
          <tbody>
            {utilizationData.map(m => (
              <tr key={m.month}>
                <td style={{ fontWeight: 500 }}>{m.month}</td>
                <td>{m.forecast}%</td>
                <td>{m.actual !== null ? `${m.actual}%` : '—'}</td>
                <td style={{ color: m.actual !== null ? (m.actual >= m.forecast ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-muted)' }}>
                  {m.actual !== null ? `${(m.actual - m.forecast).toFixed(0)}%` : 'Pending'}
                </td>
              </tr>
            ))}
          </tbody>
        </ModalTable>
      </Modal>

      {/* Employee Detail Modal */}
      <Modal
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        title={selectedEmployee?.name ?? ''}
        subtitle={`${selectedEmployee?.designation} • ${selectedEmployee?.department}`}
        size="md"
      >
        {selectedEmployee && (
          <Section>
            <SectionTitle>Employee Information</SectionTitle>
            <DetailGrid>
              <DetailItem><label>Employee ID</label><span>{selectedEmployee.empId}</span></DetailItem>
              <DetailItem><label>Email</label><span>{selectedEmployee.email}</span></DetailItem>
              <DetailItem><label>Department</label><span>{selectedEmployee.department}</span></DetailItem>
              <DetailItem><label>Sub-Function</label><span>{selectedEmployee.subFunction}</span></DetailItem>
              <DetailItem><label>Designation</label><span>{selectedEmployee.designation}</span></DetailItem>
              <DetailItem><label>Location</label><span>{selectedEmployee.location}</span></DetailItem>
              <DetailItem><label>Date of Joining</label><span>{selectedEmployee.dateOfJoining}</span></DetailItem>
              <DetailItem>
                <label>Status</label>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <StatusDot $color={selectedEmployee.status === 'green' ? 'var(--color-success)' : 'var(--color-danger)'} />
                  {selectedEmployee.status === 'green' ? 'Active' : 'Attention Required'}
                </span>
              </DetailItem>
              <DetailItem>
                <label>Chargeability</label>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  {(() => {
                    const dept = chargeabilityData.find(d => selectedEmployee.department.toLowerCase().includes(d.department.toLowerCase().split(' ')[0]))
                    return dept ? `${dept.current}%` : '—'
                  })()}
                </span>
              </DetailItem>
              <DetailItem>
                <label>Compliance</label>
                <span style={{ fontWeight: 600, color: 'var(--color-success)' }}>
                  {(() => {
                    const dept = complianceData.find(d => selectedEmployee.department.toLowerCase().includes(d.department.toLowerCase().split(' ')[0]))
                    return dept ? `${dept.current}%` : '—'
                  })()}
                </span>
              </DetailItem>
            </DetailGrid>
          </Section>
        )}
      </Modal>

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={handleImportComplete}
      />
    </div>
  )
}
