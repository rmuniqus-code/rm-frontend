'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { type ResourceRequest, type ShortlistedResource } from '@/data/request-data'
import { apiRaw } from '@/lib/api'

export interface AllocationDetails {
  allocatedEmployee?: string
  hoursPerDay?: number
  totalHours?: number
}

interface RequestsContextValue {
  requests: ResourceRequest[]
  updateStatus: (id: number, status: ResourceRequest['approvalStatus'], allocation?: AllocationDetails) => Promise<void>
  deleteRequest: (id: number) => Promise<void>
  refresh: () => void
  loading: boolean
  hasLiveData: boolean
  shortlistResources: (requestUUID: string, resources: Array<{
    employee_id?: string
    employee_name: string
    grade?: string
    service_line?: string
    sub_service_line?: string
    location?: string
    utilization_pct?: number
    fit_score?: number
  }>) => Promise<void>
  getShortlistedResources: (requestUUID: string) => Promise<ShortlistedResource[]>
  emApprove: (requestUUID: string, shortlistedResourceId: string, notes?: string) => Promise<void>
}

const RequestsContext = createContext<RequestsContextValue | null>(null)

function formatTimestamp(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.split('T')[0]
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const day = d.getDate()
  const mon = months[d.getMonth()]
  const year = d.getFullYear()
  let hours = d.getHours()
  const mins = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${day} ${mon} ${year}, ${hours}:${mins} ${ampm}`
}

function mapApiRequest(r: any): ResourceRequest {
  const fmtDate = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
  }

  const statusMap: Record<string, ResourceRequest['approvalStatus']> = {
    pending:     'todo',
    shortlisted: 'shortlisted',
    em_approved: 'em_approved',
    approved:    'approved',
    rejected:    'blocked',
    blocked:     'blocked',
  }

  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444']
  const projectName = r.project?.name ?? r.project_name ?? 'Unknown Project'
  let hash = 0
  for (let i = 0; i < projectName.length; i++) hash = projectName.charCodeAt(i) + ((hash << 5) - hash)

  return {
    id: typeof r.request_number === 'number' ? r.request_number : Math.floor(Math.random() * 100000),
    resourceRequested: r.resource_requested ?? r.role_needed ?? 'TBD',
    durationStart: fmtDate(r.start_date),
    durationEnd: fmtDate(r.end_date),
    hoursPerDay: r.hours_per_day ? `${r.hours_per_day}h` : '8h',
    approvalStatus: statusMap[r.approval_status] ?? 'todo',
    requestType: (r.request_type ?? 'New team member') as ResourceRequest['requestType'],
    bookingType: (r.booking_type === 'confirmed' ? 'Confirmed' : 'Unconfirmed') as ResourceRequest['bookingType'],
    projectName,
    projectColor: colors[Math.abs(hash) % colors.length],
    hours: r.total_hours ? `${r.total_hours}h` : `${(r.hours_per_day ?? 8)}h`,
    requestedBy: r.requester?.name ?? r.em_ep_name ?? '—',
    requestedDate: r.created_at ? formatTimestamp(r.created_at) : '',
    role: r.role_needed ?? undefined,
    grade: r.grade_needed ?? undefined,
    primarySkill: r.primary_skill ?? undefined,
    sector: r.project?.client ?? undefined,
    opportunityId: r.opportunity_id ?? undefined,
    emEpName: r.em_ep_name ?? undefined,
    skillSet: r.skill_set ?? undefined,
    travelRequirements: r.travel_requirements ?? undefined,
    projectStatus: r.project_status ?? undefined,
    loadingPct: r.loading_pct != null ? Number(r.loading_pct) : undefined,
    notes: r.notes ?? undefined,
    startDateISO: r.start_date ?? undefined,
    endDateISO: r.end_date ?? undefined,
    uuid: r.id ?? undefined,
    serviceLine: r.service_line ?? undefined,
    subServiceLine: r.sub_service_line ?? undefined,
    emApprovedResourceId: r.em_approved_resource_id ?? undefined,
    emApprovalNotes: r.em_approval_notes ?? undefined,
  }
}

export function RequestsProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<ResourceRequest[]>([])
  const [hasLiveData, setHasLiveData] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiRaw('/api/resource-requests?limit=100')
      if (res.ok) {
        const body = await res.json()
        if (body.data && body.data.length > 0) {
          setRequests(body.data.map(mapApiRequest))
          setHasLiveData(true)
        } else {
          setRequests([])
        }
      }
    } catch {
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const handleReset = () => {
      setRequests([])
      setHasLiveData(false)
      refresh()
    }
    window.addEventListener('db-reset', handleReset)
    return () => window.removeEventListener('db-reset', handleReset)
  }, [refresh])

  const updateStatus = useCallback(async (id: number, status: ResourceRequest['approvalStatus'], allocation?: AllocationDetails) => {
    setRequests(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, approvalStatus: status }
      if (allocation?.allocatedEmployee) updated.resourceRequested = allocation.allocatedEmployee
      return updated
    }))

    if (hasLiveData) {
      const decision = status === 'approved' ? 'approved' : status === 'blocked' ? 'rejected' : 'pending'
      try {
        const target = requests.find(r => r.id === id)
        let uuid = target?.uuid

        if (!uuid) {
          const searchRes = await apiRaw('/api/resource-requests?limit=200')
          if (searchRes.ok) {
            const body = await searchRes.json()
            const match = body.data?.find((r: any) => r.request_number === id)
            uuid = match?.id
          }
        }

        if (!uuid) throw new Error(`Request #${id} not found in system — cannot complete approval.`)

        const payload: Record<string, unknown> = { decision }
        if (allocation?.allocatedEmployee) payload.allocated_employee = allocation.allocatedEmployee
        if (allocation?.hoursPerDay != null) payload.hours_per_day = allocation.hoursPerDay
        if (allocation?.totalHours != null) payload.total_hours = allocation.totalHours

        const approveRes = await apiRaw(`/api/resource-requests/${uuid}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!approveRes.ok) {
          const errBody = await approveRes.json().catch(() => ({}))
          throw new Error(errBody.error ?? `Approval failed (${approveRes.status})`)
        }

        if (decision === 'approved') {
          window.dispatchEvent(new Event('allocation-created'))
        }
      } catch (err) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, approvalStatus: 'todo' } : r))
        throw err
      }
    }
  }, [hasLiveData, requests])

  const deleteRequest = useCallback(async (id: number) => {
    setRequests(prev => prev.filter(r => r.id !== id))

    if (hasLiveData) {
      const target = requests.find(r => r.id === id)
      if (target?.uuid) {
        try {
          await apiRaw(`/api/resource-requests/${target.uuid}`, { method: 'DELETE' })
        } catch { /* already removed from UI */ }
      }
    }
  }, [hasLiveData, requests])

  const shortlistResources = useCallback(async (
    requestUUID: string,
    resources: Array<{
      employee_id?: string
      employee_name: string
      grade?: string
      service_line?: string
      sub_service_line?: string
      location?: string
      utilization_pct?: number
      fit_score?: number
    }>
  ) => {
    const res = await apiRaw(`/api/resource-requests/${requestUUID}/shortlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resources }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'Shortlisting failed')
    }
    // Update local state
    setRequests(prev => prev.map(r =>
      r.uuid === requestUUID ? { ...r, approvalStatus: 'shortlisted' } : r
    ))
  }, [])

  const getShortlistedResources = useCallback(async (requestUUID: string): Promise<ShortlistedResource[]> => {
    const res = await apiRaw(`/api/resource-requests/${requestUUID}/shortlisted-resources`)
    if (!res.ok) return []
    const body = await res.json()
    return body.data ?? []
  }, [])

  const emApprove = useCallback(async (requestUUID: string, shortlistedResourceId: string, notes?: string) => {
    const res = await apiRaw(`/api/resource-requests/${requestUUID}/em-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shortlisted_resource_id: shortlistedResourceId, notes }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'EM approval failed')
    }
    const body = await res.json()
    setRequests(prev => prev.map(r =>
      r.uuid === requestUUID
        ? { ...r, approvalStatus: 'em_approved', resourceRequested: body.selectedResource?.employee_name ?? r.resourceRequested }
        : r
    ))
  }, [])

  return (
    <RequestsContext.Provider value={{
      requests, updateStatus, deleteRequest, refresh, loading, hasLiveData,
      shortlistResources, getShortlistedResources, emApprove,
    }}>
      {children}
    </RequestsContext.Provider>
  )
}

export function useRequests() {
  const ctx = useContext(RequestsContext)
  if (!ctx) throw new Error('useRequests must be used inside RequestsProvider')
  return ctx
}
