'use client'

import React, { useState, useMemo, useEffect } from 'react'
import styled from 'styled-components'
import StatCard from '@/components/shared/stat-card'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import { SelectFilter } from '@/components/shared/filter-bar'
import MultiSelect from '@/components/shared/multi-select'
import { useToast } from '@/components/shared/toast'
import {
  chargeabilityData,
  complianceData,
  timesheetNotFilledData,
  chargeabilityTrendData,
  arcAllTeamsData,
} from '@/data/resource-data'
import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'
import SmartAllocationModal from '@/components/shared/smart-allocation-modal'
import RoleGuard from '@/components/shared/role-guard'
import { useDashboardData } from '@/hooks/use-dashboard-data'
import { kpiData as mockKpiData, forecastByRole, forecastMonths } from '@/data/mock-data'
import type { ForecastEntry } from '@/data/mock-data'
import { PageLoader } from '@/components/shared/page-loader'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
  LineChart, Line,
} from 'recharts'

const PageHeader = styled.div`
  margin-bottom: 24px;

  h1 {
    font-size: 22px;
    font-weight: 700;
  }

  p {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-top: 4px;
  }
`

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`

const SectionGrid = styled.div`
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
    margin-bottom: 16px;
  }
`

const TrendIcon = styled.span<{ $direction: string }>`
  display: inline-flex;
  align-items: center;
  color: ${p => p.$direction === 'up' ? 'var(--color-trend-up)' : 'var(--color-trend-down)'};
`

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
`

const FilterLabel = styled.span`
  font-size: 13px;
  color: var(--color-text-secondary);
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
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  transition: all var(--transition-fast);

  &:hover {
    background: ${p => p.$active ? 'var(--color-primary-hover)' : 'var(--color-border-light)'};
  }
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

  h4 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  p {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
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

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

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
  padding-left: ${(p: { $level: number }) => 12 + p.$level * 20}px;
`

const FTdValue = styled.td<{ $value: number | null }>`
  padding: 8px 12px;
  text-align: center;
  border-bottom: 1px solid var(--color-border-light);
  font-weight: 500;
  color: ${(p: { $value: number | null }) =>
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
  background: ${(p: { $color: string }) => p.$color};
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

const SmartAllocBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary), #6366f1);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
  transition: all 0.15s;
  &:hover { box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35); transform: translateY(-1px); }
`

export default function ForecastingPage() {
  const { addToast } = useToast()
  const { data: liveData, hasLiveData, loading: liveLoading } = useDashboardData()
  const kpiData = hasLiveData && liveData.kpi ? liveData.kpi : mockKpiData
  const [chartModal, setChartModal] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState('6m')
  const [deptFilter, setDeptFilter] = useState<string[]>([])
  const [locationFilter, setLocationFilter] = useState<string[]>([])
  const [subServiceLine, setSubServiceLine] = useState<string[]>([])
  const [gradeFilter, setGradeFilter] = useState<string[]>([])
  const [demandChartType, setDemandChartType] = useState<'bar' | 'line'>('bar')
  const [skillChartType, setSkillChartType] = useState<'bar' | 'line'>('bar')
  const [regionFilter, setRegionFilter] = useState<string[]>([])
  const [showSmartAlloc, setShowSmartAlloc] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Build region → locations from live employee data
  const allForecastRegions = useMemo(() =>
    Array.from(new Set(liveData.employees.map(e => e.region).filter(Boolean))).sort(),
    [liveData.employees]
  )
  const allForecastLocations = useMemo(() =>
    Array.from(new Set(liveData.employees.map(e => e.location).filter(Boolean))).sort(),
    [liveData.employees]
  )
  const regionToLocations = useMemo(() => {
    const map = new Map<string, Set<string>>()
    liveData.employees.forEach(e => {
      if (!e.region || !e.location) return
      if (!map.has(e.region)) map.set(e.region, new Set())
      map.get(e.region)!.add(e.location)
    })
    return map
  }, [liveData.employees])

  const filteredForecastLocations = useMemo(() => {
    if (regionFilter.length === 0) return allForecastLocations
    const inRegions = new Set(regionFilter.flatMap(r => [...(regionToLocations.get(r) ?? [])]))
    return allForecastLocations.filter(l => inRegions.has(l))
  }, [regionFilter, allForecastLocations, regionToLocations])

  useEffect(() => {
    setLocationFilter(prev => prev.filter(l => filteredForecastLocations.includes(l)))
  }, [filteredForecastLocations])

  // Service lines, sub-service lines, and grades from live data
  const allForecastServiceLines = useMemo(() =>
    Array.from(new Set(liveData.employees.map(e => e.department).filter(Boolean))).sort(),
    [liveData.employees]
  )
  const allForecastSubSLs = useMemo(() =>
    Array.from(new Set(liveData.employees.map(e => e.subFunction).filter(Boolean))).sort(),
    [liveData.employees]
  )
  const allForecastGrades = useMemo(() =>
    Array.from(new Set(liveData.employees.map(e => e.designation).filter(Boolean))).sort(),
    [liveData.employees]
  )

  // Service line → sub-service line cascade
  const forecastDeptToSubSLs = useMemo(() => {
    const map = new Map<string, Set<string>>()
    liveData.employees.forEach(e => {
      if (!e.department || !e.subFunction) return
      if (!map.has(e.department)) map.set(e.department, new Set())
      map.get(e.department)!.add(e.subFunction)
    })
    return map
  }, [liveData.employees])

  const filteredForecastSubSLs = useMemo(() => {
    if (deptFilter.length === 0) return allForecastSubSLs
    const inDepts = new Set(deptFilter.flatMap(d => [...(forecastDeptToSubSLs.get(d) ?? [])]))
    return allForecastSubSLs.filter(s => inDepts.has(s))
  }, [deptFilter, allForecastSubSLs, forecastDeptToSubSLs])

  useEffect(() => {
    setSubServiceLine(prev => prev.filter(s => filteredForecastSubSLs.includes(s)))
  }, [filteredForecastSubSLs])

  const demandForecastData = useMemo(() => {
    // Use live utilization trend from dashboard API when available
    if (hasLiveData && liveData.utilizationTrend && liveData.utilizationTrend.length > 0) {
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const count = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12
      return liveData.utilizationTrend.slice(-count).map((t: any) => {
        const d = new Date(t.week + 'T00:00:00')
        return { month: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, demand: t.actual, supply: t.forecast }
      })
    }
    // Fallback to mock
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
  }, [timeRange, hasLiveData, liveData])

  const gapBySkill = [
    { skill: 'Data Analytics', gap: 3 },
    { skill: 'Cloud Architecture', gap: 2 },
    { skill: 'M&A', gap: 1 },
    { skill: 'Transfer Pricing', gap: 2 },
    { skill: 'Project Management', gap: 1 },
  ]

  const allWeeks = forecastMonths.flatMap(m => m.weeks.map(w => ({ month: m.month, week: w })))

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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

  if (liveLoading && !hasLiveData) return <PageLoader message="Loading forecasting data…" />

  return (
    <div>
      <PageHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h1>Forecasting & Analytics</h1>
            <p>AI-powered predictions and resource analytics</p>
          </div>
        </div>
      </PageHeader>

      <KpiGrid>
        <StatCard title="Total Capacity" value={kpiData.totalCapacity} subtitle="FTEs" change={2.5} onClick={() => setChartModal('demand')} />
        <StatCard title="Forecasted" value={kpiData.forecastedFte} subtitle="FTEs" change={-1.2} onClick={() => setChartModal('demand')} />
        <StatCard title="Utilization" value={`${kpiData.utilization}%`} change={3.1} onClick={() => setChartModal('chargeability')} />
        <StatCard title="On Bench" value={kpiData.benchCount} change={-50} onClick={() => setChartModal('headcount')} />
        <StatCard title="Over-Allocated" value={kpiData.overAllocated} change={100} onClick={() => setChartModal('headcount')} />
        <StatCard title="Variance" value={`${kpiData.variance}%`} change={kpiData.variance} onClick={() => setChartModal('demand')} />
      </KpiGrid>

          <FilterRow>
            <FilterLabel>Time Range:</FilterLabel>
            <SelectFilter value={timeRange} onChange={e => { setTimeRange(e.target.value); addToast(`Forecast range: ${e.target.value === '3m' ? '3' : e.target.value === '6m' ? '6' : '12'} months`, 'info') }}>
              <option value="3m">3 Months</option>
              <option value="6m">6 Months</option>
              <option value="12m">12 Months</option>
            </SelectFilter>
            <FilterLabel>Service Line:</FilterLabel>
            <MultiSelect options={allForecastServiceLines} values={deptFilter} onChange={setDeptFilter} placeholder="All Service Lines" />
            <FilterLabel>Sub-Service Line:</FilterLabel>
            <MultiSelect options={filteredForecastSubSLs} values={subServiceLine} onChange={setSubServiceLine} placeholder="All Sub-SLs" />
            <FilterLabel>Region:</FilterLabel>
            <MultiSelect options={allForecastRegions} values={regionFilter} onChange={setRegionFilter} placeholder="All Regions" />
            <FilterLabel>Location:</FilterLabel>
            <MultiSelect options={filteredForecastLocations} values={locationFilter} onChange={setLocationFilter} placeholder="All Locations" />
            <FilterLabel>Grade:</FilterLabel>
            <MultiSelect options={allForecastGrades} values={gradeFilter} onChange={setGradeFilter} placeholder="All Grades" />
          </FilterRow>

          <SectionGrid>
            <ChartCard $clickable onClick={() => setChartModal('demand')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Future Demand vs Supply (AI Forecast)</h3>
                <ChartToggle>
                  <ChartToggleBtn $active={demandChartType === 'bar'} onClick={(e) => { e.stopPropagation(); setDemandChartType('bar') }}>Bar</ChartToggleBtn>
                  <ChartToggleBtn $active={demandChartType === 'line'} onClick={(e) => { e.stopPropagation(); setDemandChartType('line') }}>Line</ChartToggleBtn>
                </ChartToggle>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                {demandChartType === 'bar' ? (
                  <BarChart data={demandForecastData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="month" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                    <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="demand" fill="var(--color-danger)" name="Demand (FTEs)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="supply" fill="var(--color-success)" name="Supply (FTEs)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <LineChart data={demandForecastData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="month" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                    <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="demand" stroke="var(--color-danger)" name="Demand (FTEs)" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="supply" stroke="var(--color-success)" name="Supply (FTEs)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard $clickable onClick={() => setChartModal('skill-gap')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Resource Gaps by Skill</h3>
                <ChartToggle>
                  <ChartToggleBtn $active={skillChartType === 'bar'} onClick={(e) => { e.stopPropagation(); setSkillChartType('bar') }}>Bar</ChartToggleBtn>
                  <ChartToggleBtn $active={skillChartType === 'line'} onClick={(e) => { e.stopPropagation(); setSkillChartType('line') }}>Line</ChartToggleBtn>
                </ChartToggle>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                {skillChartType === 'bar' ? (
                  <BarChart data={gapBySkill} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                    <YAxis type="category" dataKey="skill" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} width={120} />
                    <Tooltip />
                    <Bar dataKey="gap" fill="var(--color-warning)" name="Gap (FTEs)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={gapBySkill} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis type="number" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                    <YAxis type="category" dataKey="skill" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} width={120} />
                    <Tooltip />
                    <Bar dataKey="gap" fill="var(--color-warning)" name="Gap (FTEs)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </ChartCard>
          </SectionGrid>

          <InsightCards>
            <InsightCard>
              <h4>Demand Spike Predicted</h4>
              <p>Jul 2026 shows 55 FTE demand — 9 above current supply. Plan hiring or reallocation.</p>
            </InsightCard>
            <InsightCard>
              <h4>Data Analytics Gap</h4>
              <p>3 FTE gap in Data Analytics skill. Consider upskilling bench resources.</p>
            </InsightCard>
            <InsightCard>
              <h4>Chargeability Alert</h4>
              <p>GRC department chargeability unchanged at 62%. Review project pipeline.</p>
            </InsightCard>
          </InsightCards>

          <ForecastSection>
            <ForecastGrid>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Forecast by Role</h3>
              </div>
              <ForecastTable>
                <FTable>
                  <thead>
                    <tr>
                      <FThMonth style={{ position: 'sticky', left: 0, background: 'var(--color-bg)', zIndex: 2, minWidth: 200 }}>
                        Role / Resource
                      </FThMonth>
                      {forecastMonths.map(m => (
                        <FThMonth key={m.month} colSpan={m.weeks.length}>
                          {m.month}
                        </FThMonth>
                      ))}
                    </tr>
                    <tr>
                      <FTh style={{ position: 'sticky', left: 0, background: 'var(--color-bg)', zIndex: 2 }} />
                      {allWeeks.map(({ month, week }) => (
                        <FTh key={`${month}|${week}`}>{week}</FTh>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {renderForecastRows(forecastByRole, 0)}
                  </tbody>
                </FTable>
              </ForecastTable>
            </ForecastGrid>
          </ForecastSection>
      {/* KPI Chargeability Modal */}
      <Modal
        open={chartModal === 'chargeability'}
        onClose={() => setChartModal(null)}
        title="Chargeability Breakdown"
        subtitle="Detailed chargeability analysis by department"
        size="lg"
      >
        <Section>
          <SectionTitle>By Department</SectionTitle>
          <ModalTable>
            <thead><tr><th>Department</th><th>Current</th><th>Previous</th><th>Change</th></tr></thead>
            <tbody>
              {chargeabilityData.map(d => (
                <tr key={d.department}>
                  <td style={{ fontWeight: 500 }}>{d.department}</td>
                  <td style={{ fontWeight: 600 }}>{d.current}%</td>
                  <td>{d.previous}%</td>
                  <td style={{ color: d.current >= d.previous ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {d.current >= d.previous ? '+' : ''}{d.current - d.previous}%
                  </td>
                </tr>
              ))}
            </tbody>
          </ModalTable>
        </Section>
        <Section>
          <SectionTitle>Chargeability Trend by Designation</SectionTitle>
          <ModalTable>
            <thead><tr><th>Department</th><th>Designation</th><th>WC 1</th><th>WC 8</th><th>Trend</th></tr></thead>
            <tbody>
              {chargeabilityTrendData.map((d, i) => (
                <tr key={i}>
                  <td>{d.department}</td>
                  <td>{d.designation}</td>
                  <td>{d.wc1}%</td>
                  <td>{d.wc8}%</td>
                  <td>
                    <TrendIcon $direction={d.trend}>
                      {d.trend === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    </TrendIcon>
                  </td>
                </tr>
              ))}
            </tbody>
          </ModalTable>
        </Section>
      </Modal>

      {/* Demand Forecast Modal */}
      <Modal
        open={chartModal === 'demand'}
        onClose={() => setChartModal(null)}
        title="Future Demand vs Supply Forecast"
        subtitle="AI-predicted resource demand for upcoming months"
        size="md"
      >
        <Section>
          <ModalTable>
            <thead><tr><th>Month</th><th>Demand (FTEs)</th><th>Supply (FTEs)</th><th>Gap</th></tr></thead>
            <tbody>
              {demandForecastData.map(m => (
                <tr key={m.month}>
                  <td style={{ fontWeight: 500 }}>{m.month} 2026</td>
                  <td>{m.demand}</td>
                  <td>{m.supply}</td>
                  <td style={{ color: m.demand > m.supply ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 600 }}>
                    {m.supply - m.demand}
                  </td>
                </tr>
              ))}
            </tbody>
          </ModalTable>
        </Section>
      </Modal>

      {/* Skill Gap Modal */}
      <Modal
        open={chartModal === 'skill-gap'}
        onClose={() => setChartModal(null)}
        title="Resource Gaps by Skill"
        subtitle="Skills with insufficient resource coverage"
        size="md"
      >
        <Section>
          <ModalTable>
            <thead><tr><th>Skill</th><th>Gap (FTEs)</th><th>Priority</th></tr></thead>
            <tbody>
              {gapBySkill.map(s => (
                <tr key={s.skill}>
                  <td style={{ fontWeight: 500 }}>{s.skill}</td>
                  <td style={{ fontWeight: 600, color: 'var(--color-warning)' }}>{s.gap}</td>
                  <td>{s.gap >= 3 ? 'High' : s.gap >= 2 ? 'Medium' : 'Low'}</td>
                </tr>
              ))}
            </tbody>
          </ModalTable>
        </Section>
      </Modal>

      {/* Other KPI Modals */}
      <Modal
        open={chartModal === 'compliance' || chartModal === 'headcount' || chartModal === 'gaps'}
        onClose={() => setChartModal(null)}
        title={chartModal === 'compliance' ? 'Compliance Details' : chartModal === 'headcount' ? 'Headcount Breakdown' : 'Timesheet Gap Details'}
        size="md"
      >
        {chartModal === 'compliance' && (
          <Section>
            <ModalTable>
              <thead><tr><th>Department</th><th>Current</th><th>Previous</th></tr></thead>
              <tbody>
                {complianceData.map(d => (
                  <tr key={d.department}>
                    <td style={{ fontWeight: 500 }}>{d.department}</td>
                    <td style={{ fontWeight: 600 }}>{d.current}%</td>
                    <td>{d.previous}%</td>
                  </tr>
                ))}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {chartModal === 'headcount' && (
          <Section>
            <SectionTitle>By Location</SectionTitle>
            <ModalTable>
              <thead><tr><th>Location</th><th>Region</th><th>Total</th></tr></thead>
              <tbody>
                {arcAllTeamsData.map(d => (
                  <tr key={d.location}>
                    <td style={{ fontWeight: 500 }}>{d.location}</td>
                    <td>{d.region}</td>
                    <td style={{ fontWeight: 600 }}>{d.total}</td>
                  </tr>
                ))}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {chartModal === 'gaps' && (
          <Section>
            <SectionTitle>Timesheet Not Filled Summary</SectionTitle>
            <ModalTable>
              <thead><tr><th>Department</th><th>Designation</th><th>WC 1 Dec</th><th>WC 8 Dec</th></tr></thead>
              <tbody>
                {timesheetNotFilledData.slice(0, 10).map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: d.department ? 500 : 400 }}>{d.department}</td>
                    <td>{d.designation}</td>
                    <td>{d.wc1 ?? '—'}</td>
                    <td>{d.wc8 ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </ModalTable>
          </Section>
        )}
      </Modal>

      {/* Smart Allocation Modal removed — now per-request only */}
    </div>
  )
}
