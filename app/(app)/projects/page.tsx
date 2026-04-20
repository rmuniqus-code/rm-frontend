'use client'

import { useState, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import DataTable from '@/components/shared/data-table'
import type { DataTableColumn } from '@/components/shared/data-table'
import FilterBar from '@/components/shared/filter-bar'
import ToggleView from '@/components/shared/toggle-view'
import TimelineView from '@/components/shared/timeline-view'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import { mockProjects, weeks, type Project, type ProjectRole } from '@/data/mock-data'
import { FolderKanban, Plus, RefreshCw, Loader2 } from 'lucide-react'
import BookingForm from '@/components/booking/booking-form'
import { useToast } from '@/components/shared/toast'

/* ─── Live project type ──────────────────────────────── */
interface LiveProject {
  id: string
  name: string
  projectCode: string
  client: string
  engagementManager: string
  projectType: string
  status: string
  subTeam: string
  totalTeamMembers: number
  activeWeeks: number
  firstWeek: string | null
  lastWeek: string | null
  teamMembers: { empCode: string; name: string; designation: string; location: string; allocPct: number }[]
}

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
`

const PageTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  h1 {
    font-size: 22px;
    font-weight: 700;
  }
`

const TitleIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--border-radius);
  background: var(--color-primary-light);
  color: var(--color-primary);
`

const Controls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`

const NewBookingBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: var(--border-radius);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-primary-hover);
  }
`

const LoaderWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  gap: 12px;

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`

const LoaderText = styled.p`
  font-size: 14px;
  color: var(--color-text-muted);
`

const StatusDot = styled.span<{ $status: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${p =>
    p.$status === 'active' ? 'var(--color-success)' :
    p.$status === 'pipeline' ? 'var(--color-warning)' :
    'var(--color-text-muted)'};
  margin-right: 6px;
`

const RoleExpandContent = styled.div`
  padding: 12px 20px 12px 60px;
`

const RoleGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
`

const RoleCard = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 12px 16px;

  h4 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }
`

const RoleDetail = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: var(--color-text-secondary);

  span {
    display: flex;
    gap: 4px;
  }

  strong {
    color: var(--color-text);
    font-weight: 500;
  }
`

const RoleStatus = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: ${p =>
    p.$status === 'filled' ? 'var(--color-success-light)' :
    p.$status === 'open' ? 'var(--color-warning-light)' :
    'var(--color-info-light)'};
  color: ${p =>
    p.$status === 'filled' ? '#15803d' :
    p.$status === 'open' ? '#b45309' :
    '#1d4ed8'};
`

const WeekHours = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 8px;
`

const WeekCell = styled.span<{ $value: number }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 24px;
  border-radius: var(--border-radius-sm);
  font-size: 10px;
  font-weight: 500;
  background: ${p => p.$value > 0 ? 'var(--color-primary-light)' : 'var(--color-border-light)'};
  color: ${p => p.$value > 0 ? 'var(--color-primary-dark)' : 'var(--color-text-muted)'};
`

const ModalRolesTable = styled.table`
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

const columns: DataTableColumn<Project>[] = [
  {
    key: 'name',
    header: 'Project',
    render: (row) => (
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{row.projectCode}</div>
      </div>
    ),
  },
  { key: 'client', header: 'Client' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <StatusDot $status={row.status} />
        {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
      </span>
    ),
  },
  {
    key: 'totalFte',
    header: 'FTE',
    align: 'center',
    render: (row) => <span style={{ fontWeight: 500 }}>{row.totalFte.toFixed(1)}</span>,
  },
  { key: 'serviceLine', header: 'Service Line' },
  { key: 'location', header: 'Location' },
  { key: 'sector', header: 'Sector' },
  { key: 'engagementManager', header: 'EM' },
]

function renderExpandContent(project: Project) {
  return (
    <RoleExpandContent>
      <RoleGrid>
        {project.roles.map((role: ProjectRole) => (
          <RoleCard key={role.id}>
            <h4>
              {role.role} — <RoleStatus $status={role.status}>{role.status}</RoleStatus>
            </h4>
            <RoleDetail>
              <span>Grade: <strong>{role.grade}</strong></span>
              <span>FTE: <strong>{role.requiredFte}</strong></span>
              <span>Skill: <strong>{role.primarySkill}</strong></span>
              <span>Assigned: <strong>{role.assignedResource || '—'}</strong></span>
            </RoleDetail>
            <WeekHours>
              {weeks.slice(0, 6).map(w => (
                <WeekCell key={w} $value={role.weeklyLoading[w] ?? 0}>
                  {role.weeklyLoading[w] ?? 0}
                </WeekCell>
              ))}
            </WeekHours>
          </RoleCard>
        ))}
      </RoleGrid>
    </RoleExpandContent>
  )
}

function buildProjectTimelineRows(projectsData: Project[] = mockProjects) {
  return projectsData.map(p => ({
    id: p.id,
    name: p.name,
    subtitle: `${p.client} • ${p.status}`,
    totalFte: p.totalFte,
    allocations: p.roles.map(r => ({
      id: r.id,
      label: r.assignedResource || r.role,
      status: r.status === 'filled' ? 'confirmed' as const : r.status === 'proposed' ? 'proposed' as const : 'bench' as const,
      startWeek: weeks.findIndex(w => (r.weeklyLoading[w] ?? 0) > 0),
      endWeek: (() => {
        let last = 0
        weeks.forEach((w, i) => { if ((r.weeklyLoading[w] ?? 0) > 0) last = i })
        return last
      })(),
      hours: Math.round(Object.values(r.weeklyLoading).reduce((s, v) => s + (v ?? 0), 0) / weeks.length),
    })),
  }))
}

export default function ProjectsPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode, setViewMode] = useState('Table')
  const [search, setSearch] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [showBooking, setShowBooking] = useState(false)
  const { addToast } = useToast()

  // ── Live data from API ────────────────────────────────
  const [liveProjects, setLiveProjects] = useState<LiveProject[]>([])
  const [hasLiveData, setHasLiveData] = useState(false)
  const [liveLoading, setLiveLoading] = useState(true)

  const fetchProjects = useCallback(async () => {
    setLiveLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const body = await res.json()
        if (body.projects && body.projects.length > 0) {
          setLiveProjects(body.projects)
          setHasLiveData(true)
        }
      }
    } catch {
      // Fall back to mock data
    } finally {
      setLiveLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // Convert live projects into the Project shape the table expects
  const liveProjectsAsTableData: Project[] = liveProjects.map(lp => {
    // Calculate total FTE from team members' allocation percentages
    const totalFte = lp.teamMembers.reduce((sum, tm) => sum + (tm.allocPct / 100), 0)
    // Derive a location from the most common team member location
    const locationCounts = new Map<string, number>()
    for (const tm of lp.teamMembers) {
      if (tm.location) locationCounts.set(tm.location, (locationCounts.get(tm.location) ?? 0) + 1)
    }
    const topLocation = [...locationCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

    return {
      id: lp.id,
      name: lp.name,
      projectCode: lp.projectCode || '—',
      client: lp.client || '—',
      serviceLine: lp.subTeam || lp.projectType || '—',
      subServiceLine: lp.subTeam || '',
      location: topLocation,
      startDate: lp.firstWeek ?? '',
      endDate: lp.lastWeek ?? '',
      totalFte: Math.round(totalFte * 10) / 10,
      status: lp.status as 'active' | 'pipeline' | 'completed',
      engagementManager: lp.engagementManager || '—',
      sector: lp.projectType || '',
      roles: lp.teamMembers.map((tm, i) => ({
        id: `${lp.id}-r${i}`,
        role: tm.designation || 'Team Member',
        grade: tm.designation || '',
        requiredFte: Math.round(tm.allocPct) / 100,
        primarySkill: '',
        assignedResource: tm.name,
        status: 'filled' as const,
        weeklyLoading: {},
      })),
    }
  })

  const allProjects = hasLiveData ? liveProjectsAsTableData : mockProjects

  const filtered = allProjects.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.client.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleTimelineRowClick = (row: { id: string }) => {
    const project = allProjects.find(p => p.id === row.id)
    if (project) setSelectedProject(project)
  }

  return (
    <div>
      <PageHeader>
        <PageTitle>
          <TitleIcon><FolderKanban size={18} /></TitleIcon>
          <h1>Projects</h1>
        </PageTitle>
        <Controls>
          <NewBookingBtn onClick={() => setShowBooking(true)}>
            <Plus size={14} /> New Booking
          </NewBookingBtn>
          <ToggleView
            options={['All', 'Active', 'Pipeline', 'Completed']}
            value={statusFilter === 'all' ? 'All' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
            onChange={v => setStatusFilter(v.toLowerCase())}
          />
          <ToggleView
            options={['Table', 'Timeline']}
            value={viewMode}
            onChange={setViewMode}
          />
        </Controls>
      </PageHeader>

      <FilterBar searchPlaceholder="Search projects..." onSearch={setSearch} />

      {liveLoading ? (
        <LoaderWrap>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-primary)' }} />
          <LoaderText>Loading projects…</LoaderText>
        </LoaderWrap>
      ) : viewMode === 'Table' ? (
        <DataTable<Project>
          columns={columns}
          data={filtered}
          expandable
          getExpandContent={(row) => renderExpandContent(row)}
          onRowClick={(row) => setSelectedProject(row)}
          emptyMessage="No projects found"
        />
      ) : (
        <TimelineView
          rows={buildProjectTimelineRows(allProjects)}
          weekLabels={weeks}
          onRowClick={handleTimelineRowClick}
        />
      )}

      <Modal
        open={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        title={selectedProject?.name ?? ''}
        subtitle={`${selectedProject?.projectCode} • ${selectedProject?.client}`}
        size="lg"
      >
        {selectedProject && (
          <>
            <Section>
              <SectionTitle>Project Details</SectionTitle>
              <DetailGrid $cols={3}>
                <DetailItem><label>Client</label><span>{selectedProject.client}</span></DetailItem>
                <DetailItem><label>Status</label><span style={{ display: 'flex', alignItems: 'center' }}><StatusDot $status={selectedProject.status} />{selectedProject.status}</span></DetailItem>
                <DetailItem><label>Total FTE</label><span>{selectedProject.totalFte.toFixed(1)}</span></DetailItem>
                <DetailItem><label>Service Line</label><span>{selectedProject.serviceLine}</span></DetailItem>
                <DetailItem><label>Sub-Service Line</label><span>{selectedProject.subServiceLine}</span></DetailItem>
                <DetailItem><label>Location</label><span>{selectedProject.location}</span></DetailItem>
                <DetailItem><label>Sector</label><span>{selectedProject.sector}</span></DetailItem>
                <DetailItem><label>Engagement Manager</label><span>{selectedProject.engagementManager}</span></DetailItem>
                <DetailItem><label>Duration</label><span>{selectedProject.startDate} — {selectedProject.endDate}</span></DetailItem>
              </DetailGrid>
            </Section>
            <Section>
              <SectionTitle>Roles ({selectedProject.roles.length})</SectionTitle>
              <ModalRolesTable>
                <thead>
                  <tr><th>Role</th><th>Grade</th><th>FTE</th><th>Skill</th><th>Assigned</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {selectedProject.roles.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.role}</td>
                      <td>{r.grade}</td>
                      <td>{r.requiredFte}</td>
                      <td>{r.primarySkill}</td>
                      <td>{r.assignedResource || '—'}</td>
                      <td><RoleStatus $status={r.status}>{r.status}</RoleStatus></td>
                    </tr>
                  ))}
                </tbody>
              </ModalRolesTable>
            </Section>
          </>
        )}
      </Modal>

      <BookingForm
        open={showBooking}
        onClose={() => setShowBooking(false)}
        onSubmit={(data) => {
          setShowBooking(false)
          addToast(`Booking submitted for ${data.projectCode} — ${data.primarySkill}${data.selectedResource ? ` (${data.selectedResource})` : ''}`, 'success')
        }}
      />
    </div>
  )
}
