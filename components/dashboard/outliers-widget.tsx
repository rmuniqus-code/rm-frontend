'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import styled from 'styled-components'
import { AlertTriangle, Clock, TrendingDown, Users, ChevronRight, X, RefreshCw, ChevronDown, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts'
import { apiRaw } from '@/lib/api'

/* ─── Types ──────────────────────────────────────────── */

interface OutlierProject {
  name: string
  allocation_pct: number
  status: string
}

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
  projects?: OutlierProject[]
  chargeability?: {
    weekly: number | null
    mtd: number | null
    ytd: number | null
  }
  missedTimesheet?: {
    last4: number
    last8: number
  }
  peerUtilization?: number | null
}

interface OutlierSummary {
  total: number
  missed_timesheet: number
  low_utilization_am: number
  low_utilization_ad: number
  over_allocated: number
}

interface AggregationEntry {
  name: string
  count: number
  missed_timesheet: number
  low_utilization: number
  over_allocated: number
}

interface OutliersData {
  summary: OutlierSummary
  outliers: OutlierEntry[]
  dateRange: { from: string; to: string }
  period: 'weekly' | 'monthly' | 'yearly'
  aggregations: {
    byRegion: AggregationEntry[]
    byServiceLine: AggregationEntry[]
    byDepartment: AggregationEntry[]
  }
}

type OutlierPeriod = 'weekly' | 'monthly' | 'yearly'

/** Drilldown levels: overview → region → serviceLine → employees */
type DrillLevel = 'overview' | 'region' | 'serviceLine' | 'employees'

interface DrillState {
  level: DrillLevel
  region?: string
  serviceLine?: string
}

/* ─── Styled Components ──────────────────────────────── */

const Widget = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
`

const WidgetHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
`

const WidgetTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  h3 {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-text);
  }
`

const TitleIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius);
  background: var(--color-warning-light);
  color: #b45309;
`

const TotalBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 12px;
  background: var(--color-danger);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 0 8px;
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const SmallBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  color: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-text-muted)'};
  background: ${p => p.$active ? 'var(--color-primary-light)' : 'transparent'};
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
    color: var(--color-primary);
  }
`

const CategoryTabs = styled.div`
  display: flex;
  padding: 0 20px;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
`

const CategoryTab = styled.button<{ $active: boolean; $color: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 500;
  color: ${p => p.$active ? p.$color : 'var(--color-text-secondary)'};
  border-bottom: 2px solid ${p => p.$active ? p.$color : 'transparent'};
  white-space: nowrap;
  transition: all var(--transition-fast);

  &:hover {
    color: ${p => p.$color};
  }
`

const TabCount = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: ${p => p.$color}20;
  color: ${p => p.$color};
  font-size: 11px;
  font-weight: 700;
  padding: 0 6px;
`

/* ─── Breadcrumbs ───────────────────────────────────── */

const Breadcrumbs = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--color-border-light);
  font-size: 12px;
  color: var(--color-text-secondary);
`

const BreadcrumbLink = styled.button`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  padding: 0;
  background: none;
  border: none;

  &:hover {
    text-decoration: underline;
  }
`

const BreadcrumbCurrent = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
`

const BreadcrumbSep = styled.span`
  color: var(--color-text-muted);
  font-size: 10px;
`

/* ─── Chart area ────────────────────────────────────── */

const ChartArea = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
`

const ChartTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

/* ─── Drill list (aggregated groups) ───────────────── */

const DrillList = styled.div`
  max-height: 360px;
  overflow-y: auto;
`

const DrillItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border-light);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
  }

  &:last-child {
    border-bottom: none;
  }
`

const DrillItemInfo = styled.div`
  flex: 1;
  min-width: 0;

  .name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }

  .meta {
    display: flex;
    gap: 10px;
    margin-top: 3px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }
`

const DrillCountBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  border-radius: 14px;
  background: var(--color-warning-light);
  color: #b45309;
  font-size: 13px;
  font-weight: 700;
  padding: 0 8px;
`

/* ─── Employee list (final level) ──────────────────── */

const OutlierList = styled.div`
  max-height: 360px;
  overflow-y: auto;
`

const OutlierItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border-light);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
  }

  &:last-child {
    border-bottom: none;
  }
`

const OutlierIcon = styled.div<{ $type: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${p =>
    p.$type === 'missed_timesheet' ? 'var(--color-danger-light)' :
    p.$type === 'over_allocated' ? 'var(--color-warning-light)' :
    'var(--color-info-light)'};
  color: ${p =>
    p.$type === 'missed_timesheet' ? '#b91c1c' :
    p.$type === 'over_allocated' ? '#b45309' :
    '#1d4ed8'};
`

const OutlierInfo = styled.div`
  flex: 1;
  min-width: 0;

  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .meta {
    font-size: 11px;
    color: var(--color-text-secondary);
    margin-top: 1px;
  }
`

const MetricBadge = styled.span<{ $severity: 'high' | 'medium' | 'low' }>`
  display: inline-flex;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  background: ${p =>
    p.$severity === 'high' ? 'var(--color-danger-light)' :
    p.$severity === 'medium' ? 'var(--color-warning-light)' :
    'var(--color-info-light)'};
  color: ${p =>
    p.$severity === 'high' ? '#b91c1c' :
    p.$severity === 'medium' ? '#b45309' :
    '#1d4ed8'};
`

const ExpandBtn = styled.div`
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
`

/* ─── Detail Panel (slide-in) ─────────────────────────── */

const DetailOverlay = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.18);
  z-index: 49;
  opacity: ${p => p.$open ? 1 : 0};
  pointer-events: ${p => p.$open ? 'auto' : 'none'};
  transition: opacity 0.25s ease;
`

const DetailPanel = styled.div<{ $open: boolean }>`
  position: fixed;
  right: 0;
  top: 0;
  height: 100%;
  width: 420px;
  background: var(--color-bg-card);
  box-shadow: -4px 0 24px rgba(0,0,0,0.12);
  border-left: 1px solid var(--color-border);
  z-index: 50;
  overflow-y: auto;
  transform: translateX(${p => p.$open ? '0' : '100%'});
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
`

const DetailHeader = styled.div`
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
`

const DetailTitle = styled.h3`
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
`

const DetailSub = styled.p`
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 2px;
`

const CloseBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
  &:hover { background: var(--color-border-light); color: var(--color-text); }
`

const DetailSection = styled.div`
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border-light);
`

const DetailLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
`

const DetailValue = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
`

const BreakdownRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border-light);
  &:last-child { border-bottom: none; }
`

const BreakdownLabel = styled.span`
  font-weight: 500;
  color: var(--color-text);
`

const EmptyState = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
`

const ProjectBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: var(--border-radius);
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
  margin-bottom: 6px;

  &:last-child { margin-bottom: 0; }
`

const ProjectName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
`

const ProjectPct = styled.span<{ $over?: boolean }>`
  font-size: 12px;
  font-weight: 600;
  color: ${p => p.$over ? '#b91c1c' : 'var(--color-text-secondary)'};
`

/* ─── Helpers ──────────────────────────────────────────── */

function getOutlierIcon(type: string) {
  switch (type) {
    case 'missed_timesheet': return <Clock size={16} />
    case 'over_allocated': return <AlertTriangle size={16} />
    case 'low_utilization_am':
    case 'low_utilization_ad': return <TrendingDown size={16} />
    default: return <AlertTriangle size={16} />
  }
}

function getOutlierLabel(type: string) {
  switch (type) {
    case 'missed_timesheet': return 'Missed Timesheet'
    case 'over_allocated': return 'Over-Allocated'
    case 'low_utilization_am': return 'Low Utilization (AM & Below)'
    case 'low_utilization_ad': return 'Low Utilization (AD)'
    default: return type
  }
}

function getSeverity(entry: OutlierEntry): 'high' | 'medium' | 'low' {
  if (entry.outlier_type === 'over_allocated' && entry.metric_value > 120) return 'high'
  if (entry.outlier_type === 'missed_timesheet') return 'high'
  if (entry.outlier_type === 'over_allocated') return 'medium'
  if (entry.metric_value < 50) return 'high'
  return 'medium'
}

function formatMetric(entry: OutlierEntry): string {
  if (entry.outlier_type === 'missed_timesheet') return `${entry.metric_value}h`
  return `${Math.round(entry.metric_value)}%`
}

const CATEGORIES = [
  { key: 'all', label: 'All', color: '#492079' },
  { key: 'missed_timesheet', label: 'Timesheet', color: '#b91c1c' },
  { key: 'low_utilization_am', label: 'Low Util (AM)', color: '#492079' },
  { key: 'low_utilization_ad', label: 'Low Util (AD)', color: '#b31e7c' },
]

const BAR_COLORS = ['#b91c1c', '#492079', '#b31e7c']

/* ─── Component ──────────────────────────────────────── */

export default function OutliersWidget() {
  const [data, setData] = useState<OutliersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [selectedEntry, setSelectedEntry] = useState<OutlierEntry | null>(null)
  const [showChart, setShowChart] = useState(true)
  const [drill, setDrill] = useState<DrillState>({ level: 'overview' })
  const [period, setPeriod] = useState<OutlierPeriod>('monthly')

  const fetchOutliers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (drill.region) params.set('region', drill.region)
      if (drill.serviceLine) params.set('serviceLine', drill.serviceLine)
      params.set('period', period)
      const qs = params.toString()
      const res = await apiRaw(`/api/outliers${qs ? '?' + qs : ''}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (err) {
      console.error('[OutliersWidget] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [drill.region, drill.serviceLine, period])

  useEffect(() => { fetchOutliers() }, [fetchOutliers])

  // Listen for db-reset events to clear stale data
  useEffect(() => {
    const handleReset = () => {
      setData(null)
      setDrill({ level: 'overview' })
      fetchOutliers()
    }
    window.addEventListener('db-reset', handleReset)
    return () => window.removeEventListener('db-reset', handleReset)
  }, [fetchOutliers])

  // Filter outliers by active tab — never show over_allocated (it's a per-week concern, not a global outlier)
  const filteredOutliers = useMemo(() => {
    return (data?.outliers ?? []).filter(o =>
      o.outlier_type !== 'over_allocated' &&
      (activeTab === 'all' || o.outlier_type === activeTab)
    )
  }, [data, activeTab])

  const getCount = (type: string) => {
    if (type === 'all') {
      const overAllocated = data?.summary.over_allocated ?? 0
      return Math.max(0, (data?.summary.total ?? 0) - overAllocated)
    }
    return data?.summary[type as keyof OutlierSummary] ?? 0
  }

  // Chart data based on drilldown level
  const chartData = useMemo(() => {
    if (!data?.aggregations) return []
    switch (drill.level) {
      case 'overview': return data.aggregations.byRegion
      case 'region': return data.aggregations.byServiceLine
      case 'serviceLine': return data.aggregations.byDepartment
      default: return []
    }
  }, [data, drill.level])

  const chartLabel = useMemo(() => {
    switch (drill.level) {
      case 'overview': return 'Outliers by Region'
      case 'region': return `Outliers by Service Line — ${drill.region}`
      case 'serviceLine': return `Outliers by Department — ${drill.serviceLine}`
      default: return ''
    }
  }, [drill])

  // Drill navigation handlers
  const handleDrillClick = (name: string) => {
    if (drill.level === 'overview') {
      setDrill({ level: 'region', region: name })
    } else if (drill.level === 'region') {
      setDrill({ level: 'serviceLine', region: drill.region, serviceLine: name })
    } else if (drill.level === 'serviceLine') {
      setDrill({ level: 'employees', region: drill.region, serviceLine: drill.serviceLine })
    }
  }

  const navigateTo = (level: DrillLevel) => {
    if (level === 'overview') {
      setDrill({ level: 'overview' })
    } else if (level === 'region') {
      setDrill({ level: 'region', region: drill.region })
    }
    // serviceLine keeps current state (no-op)
  }

  const showDrillList = drill.level !== 'employees' && chartData.length > 0
  const showEmployeeList = drill.level === 'employees' || (drill.level === 'overview' && (!data?.aggregations?.byRegion?.length))

  return (
    <>
      <Widget>
        <WidgetHeader>
          <WidgetTitle>
            <TitleIcon><AlertTriangle size={16} /></TitleIcon>
            <h3>Outliers</h3>
            {data && data.summary.total > 0 && (
              <TotalBadge>{data.summary.total}</TotalBadge>
            )}
          </WidgetTitle>
          <HeaderActions>
            <div style={{ display: 'inline-flex', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-sm)', overflow: 'hidden', marginRight: 4 }}>
              {(['weekly', 'monthly', 'yearly'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    color: period === p ? '#fff' : 'var(--color-text-secondary)',
                    background: period === p ? 'var(--color-primary)' : 'transparent',
                  }}
                >
                  {p[0].toUpperCase()}
                </button>
              ))}
            </div>
            <SmallBtn $active={showChart} onClick={() => setShowChart(v => !v)} title="Toggle chart">
              <BarChart3 size={14} />
            </SmallBtn>
            <SmallBtn onClick={fetchOutliers} title="Refresh outliers">
              <RefreshCw size={14} />
            </SmallBtn>
          </HeaderActions>
        </WidgetHeader>

        <CategoryTabs>
          {CATEGORIES.map(cat => (
            <CategoryTab
              key={cat.key}
              $active={activeTab === cat.key}
              $color={cat.color}
              onClick={() => setActiveTab(cat.key)}
            >
              {cat.label}
              <TabCount $color={cat.color}>{getCount(cat.key)}</TabCount>
            </CategoryTab>
          ))}
        </CategoryTabs>

        {/* Breadcrumbs — shown when drilled in */}
        {drill.level !== 'overview' && (
          <Breadcrumbs>
            <BreadcrumbLink onClick={() => navigateTo('overview')}>All Regions</BreadcrumbLink>
            {drill.region && (
              <>
                <BreadcrumbSep><ChevronRight size={10} /></BreadcrumbSep>
                {drill.level === 'region' ? (
                  <BreadcrumbCurrent>{drill.region}</BreadcrumbCurrent>
                ) : (
                  <BreadcrumbLink onClick={() => navigateTo('region')}>{drill.region}</BreadcrumbLink>
                )}
              </>
            )}
            {drill.serviceLine && (
              <>
                <BreadcrumbSep><ChevronRight size={10} /></BreadcrumbSep>
                {drill.level === 'serviceLine' ? (
                  <BreadcrumbCurrent>{drill.serviceLine}</BreadcrumbCurrent>
                ) : (
                  <BreadcrumbCurrent>{drill.serviceLine}</BreadcrumbCurrent>
                )}
              </>
            )}
            {drill.level === 'employees' && (
              <>
                <BreadcrumbSep><ChevronRight size={10} /></BreadcrumbSep>
                <BreadcrumbCurrent>Employees</BreadcrumbCurrent>
              </>
            )}
          </Breadcrumbs>
        )}

        {/* Chart — aggregated view */}
        {showChart && chartData.length > 0 && drill.level !== 'employees' && (
          <ChartArea>
            <ChartTitle>{chartLabel}</ChartTitle>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ left: 10, right: 20, top: 4, bottom: 4 }}>
                <XAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <YAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  width={28}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-border)' }}
                  formatter={(value: unknown, name: unknown) => [
                    Number(value ?? 0),
                    name === 'missed_timesheet' ? 'Timesheet' :
                    name === 'low_utilization' ? 'Low Util' :
                    String(name),
                  ]}
                />
                <Legend
                  iconSize={10}
                  formatter={(value) =>
                    value === 'missed_timesheet' ? 'Timesheet' :
                    value === 'low_utilization' ? 'Low Util' :
                    value
                  }
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="missed_timesheet" stackId="a" fill="#b91c1c" name="missed_timesheet" radius={[0, 0, 0, 0]} onClick={(d) => handleDrillClick((d as unknown as AggregationEntry).name)} cursor="pointer">
                  <LabelList dataKey="missed_timesheet" position="center" fill="#fff" fontSize={11} fontWeight={600} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')} />
                </Bar>
                <Bar dataKey="low_utilization"  stackId="a" fill="#492079" name="low_utilization"  radius={[4, 4, 0, 0]} onClick={(d) => handleDrillClick((d as unknown as AggregationEntry).name)} cursor="pointer">
                  <LabelList dataKey="low_utilization" position="center" fill="#fff" fontSize={11} fontWeight={600} formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')} />
                  <LabelList dataKey="count" position="top" fill="var(--color-text)" fontSize={11} fontWeight={700} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartArea>
        )}

        {/* Drill list — aggregated groups (region / service line / department) */}
        {showDrillList && !loading && (
          <DrillList>
            {chartData.map(group => (
              <DrillItem key={group.name} onClick={() => handleDrillClick(group.name)}>
                <DrillItemInfo>
                  <div className="name">{group.name}</div>
                  <div className="meta">
                    {group.missed_timesheet > 0 && <span>Timesheet: {group.missed_timesheet}</span>}
                    {group.low_utilization > 0 && <span>Low Util: {group.low_utilization}</span>}
                  </div>
                </DrillItemInfo>
                <DrillCountBadge>{group.count}</DrillCountBadge>
                <ExpandBtn><ChevronRight size={14} /></ExpandBtn>
              </DrillItem>
            ))}
          </DrillList>
        )}

        {/* Employee list — final drilldown level OR fallback when no aggregations */}
        {(showEmployeeList || (!showDrillList && !loading)) && (
          <OutlierList>
            {loading && <EmptyState>Loading outliers...</EmptyState>}
            {!loading && filteredOutliers.length === 0 && (
              <EmptyState>No outliers detected for this period</EmptyState>
            )}
            {!loading && filteredOutliers.map((entry, idx) => (
              <OutlierItem key={`${entry.employee_code}-${entry.outlier_type}-${idx}`} onClick={() => setSelectedEntry(entry)}>
                <OutlierIcon $type={entry.outlier_type}>
                  {getOutlierIcon(entry.outlier_type)}
                </OutlierIcon>
                <OutlierInfo>
                  <div className="name">{entry.employee_name}</div>
                  <div className="meta">
                    {entry.designation} &middot; {entry.department} &middot; {getOutlierLabel(entry.outlier_type)}
                  </div>
                </OutlierInfo>
                <MetricBadge $severity={getSeverity(entry)}>
                  {formatMetric(entry)}
                </MetricBadge>
                <ExpandBtn><ChevronRight size={14} /></ExpandBtn>
              </OutlierItem>
            ))}
          </OutlierList>
        )}
      </Widget>

      {/* Detail slide-in panel */}
      <DetailOverlay $open={!!selectedEntry} onClick={() => setSelectedEntry(null)} />
      <DetailPanel $open={!!selectedEntry}>
        {selectedEntry && (
          <>
            <DetailHeader>
              <div>
                <DetailTitle>{selectedEntry.employee_name}</DetailTitle>
                <DetailSub>{selectedEntry.designation} &middot; {selectedEntry.department}</DetailSub>
              </div>
              <CloseBtn onClick={() => setSelectedEntry(null)}>
                <X size={16} />
              </CloseBtn>
            </DetailHeader>

            <DetailSection>
              <DetailLabel>Outlier Type</DetailLabel>
              <DetailValue>{getOutlierLabel(selectedEntry.outlier_type)}</DetailValue>
            </DetailSection>

            <DetailSection>
              <DetailLabel>Employee Details</DetailLabel>
              <BreakdownRow>
                <span>Employee ID</span>
                <BreakdownLabel>{selectedEntry.employee_code}</BreakdownLabel>
              </BreakdownRow>
              <BreakdownRow>
                <span>Location</span>
                <BreakdownLabel>{selectedEntry.location || '—'}</BreakdownLabel>
              </BreakdownRow>
              <BreakdownRow>
                <span>Region</span>
                <BreakdownLabel>{selectedEntry.region || '—'}</BreakdownLabel>
              </BreakdownRow>
              <BreakdownRow>
                <span>Service Line</span>
                <BreakdownLabel>{selectedEntry.serviceLine || '—'}</BreakdownLabel>
              </BreakdownRow>
              {selectedEntry.week_start && (
                <BreakdownRow>
                  <span>Week</span>
                  <BreakdownLabel>{selectedEntry.week_start}</BreakdownLabel>
                </BreakdownRow>
              )}
            </DetailSection>

            <DetailSection>
              <DetailLabel>Calculation Breakdown</DetailLabel>
              <BreakdownRow>
                <span>Current Value</span>
                <BreakdownLabel>{formatMetric(selectedEntry)}</BreakdownLabel>
              </BreakdownRow>
              <BreakdownRow>
                <span>Threshold</span>
                <BreakdownLabel>
                  {selectedEntry.outlier_type === 'missed_timesheet'
                    ? '> 0 hours required'
                    : selectedEntry.outlier_type === 'over_allocated'
                    ? `≤ ${selectedEntry.threshold}%`
                    : `≥ ${selectedEntry.threshold}%`}
                </BreakdownLabel>
              </BreakdownRow>
              <BreakdownRow>
                <span>Variance</span>
                <BreakdownLabel style={{ color: '#b91c1c' }}>
                  {selectedEntry.outlier_type === 'over_allocated'
                    ? `+${Math.round(selectedEntry.metric_value - selectedEntry.threshold)}% over`
                    : selectedEntry.outlier_type === 'missed_timesheet'
                    ? 'No timesheet submitted'
                    : `${Math.round(selectedEntry.threshold - selectedEntry.metric_value)}% below threshold`}
                </BreakdownLabel>
              </BreakdownRow>
              {selectedEntry.peerUtilization != null && (selectedEntry.outlier_type === 'low_utilization_ad' || selectedEntry.outlier_type === 'low_utilization_am') && (
                <BreakdownRow>
                  <span>Peer Utilisation ({selectedEntry.designation})</span>
                  <BreakdownLabel>{selectedEntry.peerUtilization}%</BreakdownLabel>
                </BreakdownRow>
              )}
            </DetailSection>

            {selectedEntry.chargeability && (
              <DetailSection>
                <DetailLabel>Chargeability</DetailLabel>
                <BreakdownRow>
                  <span>Weekly (current)</span>
                  <BreakdownLabel>{selectedEntry.chargeability.weekly != null ? `${selectedEntry.chargeability.weekly}%` : '—'}</BreakdownLabel>
                </BreakdownRow>
                <BreakdownRow>
                  <span>MTD</span>
                  <BreakdownLabel>{selectedEntry.chargeability.mtd != null ? `${selectedEntry.chargeability.mtd}%` : '—'}</BreakdownLabel>
                </BreakdownRow>
                <BreakdownRow>
                  <span>YTD</span>
                  <BreakdownLabel>{selectedEntry.chargeability.ytd != null ? `${selectedEntry.chargeability.ytd}%` : '—'}</BreakdownLabel>
                </BreakdownRow>
              </DetailSection>
            )}

            {selectedEntry.outlier_type === 'missed_timesheet' && selectedEntry.missedTimesheet && (
              <DetailSection>
                <DetailLabel>Missed Timesheet Breakdown</DetailLabel>
                <BreakdownRow>
                  <span>Last 4 months</span>
                  <BreakdownLabel style={{ color: selectedEntry.missedTimesheet.last4 > 0 ? '#b91c1c' : 'var(--color-text)' }}>
                    {selectedEntry.missedTimesheet.last4} missed
                  </BreakdownLabel>
                </BreakdownRow>
                <BreakdownRow>
                  <span>Last 8 months</span>
                  <BreakdownLabel style={{ color: selectedEntry.missedTimesheet.last8 > 0 ? '#b91c1c' : 'var(--color-text)' }}>
                    {selectedEntry.missedTimesheet.last8} missed
                  </BreakdownLabel>
                </BreakdownRow>
              </DetailSection>
            )}

            <DetailSection>
              <DetailLabel>Explanation</DetailLabel>
              <DetailValue style={{ fontSize: 13, lineHeight: 1.5 }}>
                {selectedEntry.detail}
              </DetailValue>
            </DetailSection>

            {selectedEntry.projects && selectedEntry.projects.length > 0 && (
              <DetailSection>
                <DetailLabel>
                  Current Project Allocations
                  {selectedEntry.outlier_type === 'over_allocated' && (
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10, marginLeft: 6, color: '#b91c1c' }}>
                      (total: {selectedEntry.projects.reduce((s, p) => s + p.allocation_pct, 0)}%)
                    </span>
                  )}
                </DetailLabel>
                {selectedEntry.projects.map((proj, idx) => (
                  <ProjectBar key={idx}>
                    <ProjectName>{proj.name}</ProjectName>
                    <ProjectPct $over={selectedEntry.outlier_type === 'over_allocated'}>
                      {proj.allocation_pct}%
                    </ProjectPct>
                  </ProjectBar>
                ))}
              </DetailSection>
            )}

            {(!selectedEntry.projects || selectedEntry.projects.length === 0) && (
              <DetailSection>
                <DetailLabel>Current Project Allocations</DetailLabel>
                <DetailValue style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                  No active project allocations found
                </DetailValue>
              </DetailSection>
            )}
          </>
        )}
      </DetailPanel>
    </>
  )
}
