'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import type { ResourceRequest } from '@/data/request-data'
import { Search, UserPlus, X, Loader2 } from 'lucide-react'
import { apiRaw } from '@/lib/api'

interface AvailableResource {
  id: string
  name: string
  grade: string
  serviceLine: string
  subServiceLine: string
  location: string
  region: string
  primarySkill: string
  totalFte: number
}

interface FindAvailabilityModalProps {
  open: boolean
  request: ResourceRequest | null
  onClose: () => void
  onAssign: (request: ResourceRequest, resourceName: string) => void
}

const ResultsList = styled.div`
  max-height: 360px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
`

const ResultCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  transition: border-color var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
  }
`

const ResultLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const Avatar = styled.div<{ $color: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: ${p => p.$color};
  flex-shrink: 0;
`

const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const Name = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const Meta = styled.span`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const AssignButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-primary);
  background: var(--color-brand-tint-light);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-primary);
    color: #fff;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
`

const CapBadge = styled.span<{ $level: 'high' | 'mid' | 'low' }>`
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  margin-right: 8px;
  background: ${p =>
    p.$level === 'high' ? 'rgba(34,197,94,0.12)' :
    p.$level === 'mid' ? 'rgba(245,158,11,0.12)' :
    'rgba(239,68,68,0.12)'};
  color: ${p =>
    p.$level === 'high' ? '#15803d' :
    p.$level === 'mid' ? '#92400e' :
    '#b91c1c'};
`

const EmptyMsg = styled.p`
  text-align: center;
  padding: 24px;
  color: var(--color-text-muted);
  font-size: 13px;
`

const SpinnerWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-muted);
  font-size: 13px;

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  svg { animation: spin 1s linear infinite; }
`

const SearchBox = styled.div`
  position: relative;
  margin-top: 12px;

  svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    width: 16px;
    height: 16px;
  }

  input {
    width: 100%;
    padding: 8px 12px 8px 34px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--border-radius);
    background: var(--color-bg-card);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    &:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
  }
`

const CountLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-top: 16px;
`

/* ─── Active filter chips ──────────────────────── */

const FilterChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  margin-bottom: 4px;
`

const FilterChip = styled.div<{ $color?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => p.$color ? `${p.$color}18` : 'var(--color-primary-light)'};
  border: 1.5px solid ${p => p.$color ?? 'var(--color-primary)'};
  color: ${p => p.$color ?? 'var(--color-primary)'};
`

const ChipLabel = styled.span`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.7;
  margin-right: 2px;
`

const ChipRemove = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  opacity: 0.7;
  margin-left: 2px;
  &:hover { opacity: 1; }
`

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getColor(name: string) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

export default function FindAvailabilityModal({ open, request, onClose, onAssign }: FindAvailabilityModalProps) {
  const [search, setSearch] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterServiceLine, setFilterServiceLine] = useState('')
  const [filterSkill, setFilterSkill] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // Live resources fetched from the DB
  const [liveResources, setLiveResources] = useState<AvailableResource[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Sync pre-filled filters whenever the request changes
  useEffect(() => {
    if (request) {
      setFilterGrade(request.grade ?? '')
      setFilterServiceLine(request.serviceLine ?? '')
      setFilterSkill(request.primarySkill ?? '')
      setFilterDateFrom(request.startDateISO ?? '')
      setFilterDateTo(request.endDateISO ?? '')
    }
  }, [request])

  // Fetch live resource data from the API whenever the modal opens
  const fetchResources = useCallback(async () => {
    if (!request) return
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams()
      if (request.startDateISO) params.set('startDate', request.startDateISO)
      if (request.endDateISO)   params.set('endDate',   request.endDateISO)

      const res = await apiRaw(`/api/find-availability?${params.toString()}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const json = await res.json()
      setLiveResources(json.resources ?? [])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load resources')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    if (open) fetchResources()
    else setLiveResources([])
  }, [open, fetchResources])

  const matchingResources = useMemo(() => {
    // Compute a fit score matching the smart-allocate priority order:
    // skill (40pts) → availability (35pts) → service line (15pts) → grade (10pts)
    const score = (r: AvailableResource) => {
      let s = 0
      if (filterSkill && r.primarySkill) {
        const req = filterSkill.toLowerCase()
        const res = r.primarySkill.toLowerCase()
        if (res === req) s += 40
        else if (res.includes(req) || req.includes(res)) s += 20
      }
      const avail = Math.max(0, 1 - r.totalFte)
      s += Math.round(avail * 35)
      if (filterServiceLine && r.serviceLine === filterServiceLine) s += 15
      if (filterGrade && r.grade.toLowerCase() === filterGrade.toLowerCase()) s += 10
      return s
    }

    return liveResources.filter(r => {
      // Hard filters — only applied when the chip is active
      if (filterServiceLine && r.serviceLine !== filterServiceLine) return false
      if (filterGrade && r.grade.toLowerCase() !== filterGrade.toLowerCase()) return false
      if (filterSkill && r.primarySkill) {
        const req = filterSkill.toLowerCase()
        const res = r.primarySkill.toLowerCase()
        if (!res.includes(req) && !req.includes(res)) return false
      }

      // Search bar
      if (search) {
        const q = search.toLowerCase()
        if (
          !r.name.toLowerCase().includes(q) &&
          !r.grade.toLowerCase().includes(q) &&
          !r.location.toLowerCase().includes(q) &&
          !r.serviceLine.toLowerCase().includes(q) &&
          !r.subServiceLine.toLowerCase().includes(q) &&
          !r.primarySkill.toLowerCase().includes(q)
        ) return false
      }

      return true
    }).sort((a, b) => score(b) - score(a))
  }, [liveResources, search, filterGrade, filterServiceLine, filterSkill])

  if (!request) return null

  const availableCapacity = (r: AvailableResource) => Math.max(0, Math.round((1 - r.totalFte) * 100))
  const hasActiveFilters = !!(filterServiceLine || filterSkill || filterGrade || filterDateFrom || filterDateTo)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Find Availability"
      subtitle={`Request #${request.id} — ${request.projectName}`}
      size="md"
    >
      {/* Active filter chips — pre-filled from the request, each removable */}
      <FilterChipsRow>
        {filterServiceLine && (
          <FilterChip $color="#0070C0">
            <ChipLabel>Service Line</ChipLabel>{filterServiceLine}
            <ChipRemove onClick={() => setFilterServiceLine('')}><X size={10} /></ChipRemove>
          </FilterChip>
        )}
        {filterGrade && (
          <FilterChip $color="#8b5cf6">
            <ChipLabel>Grade</ChipLabel>{filterGrade}
            <ChipRemove onClick={() => setFilterGrade('')}><X size={10} /></ChipRemove>
          </FilterChip>
        )}
        {filterSkill && (
          <FilterChip $color="#22c55e">
            <ChipLabel>Skill</ChipLabel>{filterSkill}
            <ChipRemove onClick={() => setFilterSkill('')}><X size={10} /></ChipRemove>
          </FilterChip>
        )}
        {(filterDateFrom || filterDateTo) && (
          <FilterChip $color="#f59e0b">
            <ChipLabel>Duration</ChipLabel>
            {request.durationStart}{request.durationEnd ? ` – ${request.durationEnd}` : ''}
            <ChipRemove onClick={() => { setFilterDateFrom(''); setFilterDateTo('') }}><X size={10} /></ChipRemove>
          </FilterChip>
        )}
      </FilterChipsRow>

      <Section>
        <SectionTitle>Request Details</SectionTitle>
        <DetailGrid $cols={3}>
          <DetailItem><label>Role</label><span>{request.role || '—'}</span></DetailItem>
          <DetailItem><label>Grade</label><span>{request.grade || '—'}</span></DetailItem>
          <DetailItem><label>Skill</label><span>{request.primarySkill || '—'}</span></DetailItem>
          <DetailItem><label>Project</label><span>{request.projectName}</span></DetailItem>
          <DetailItem><label>Duration</label><span>{request.durationStart} – {request.durationEnd}</span></DetailItem>
          <DetailItem><label>Hours/Day</label><span>{request.hoursPerDay}</span></DetailItem>
        </DetailGrid>
      </Section>

      <SearchBox>
        <Search />
        <input
          placeholder="Search by name, grade, location, service line…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </SearchBox>

      {loading ? (
        <SpinnerWrapper>
          <Loader2 size={16} /> Loading resources…
        </SpinnerWrapper>
      ) : fetchError ? (
        <EmptyMsg style={{ color: 'var(--color-error)' }}>
          {fetchError}{' '}
          <button style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 12 }} onClick={fetchResources}>
            Retry
          </button>
        </EmptyMsg>
      ) : (
        <>
          <CountLabel>{matchingResources.length} available resource{matchingResources.length !== 1 ? 's' : ''} found</CountLabel>

          {matchingResources.length === 0 ? (
            <EmptyMsg>
              No available resources match the active filters.{' '}
              {hasActiveFilters && (
                <button
                  style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 12 }}
                  onClick={() => { setFilterServiceLine(''); setFilterSkill(''); setFilterGrade(''); setFilterDateFrom(''); setFilterDateTo('') }}
                >
                  Clear all filters
                </button>
              )}
            </EmptyMsg>
          ) : (
            <ResultsList>
              {matchingResources.map(r => {
                const cap = availableCapacity(r)
                const capLevel: 'high' | 'mid' | 'low' = cap >= 50 ? 'high' : cap >= 20 ? 'mid' : 'low'
                return (
                  <ResultCard key={r.id}>
                    <ResultLeft>
                      <Avatar $color={getColor(r.name)}>{getInitials(r.name)}</Avatar>
                      <Info>
                        <Name>{r.name}</Name>
                        <Meta>{r.grade} · {r.location}{r.region ? ` · ${r.region}` : ''}</Meta>
                        <Meta style={{ fontSize: 11 }}>{r.serviceLine}{r.subServiceLine ? ` / ${r.subServiceLine}` : ''}</Meta>
                        {r.primarySkill && (
                          <Meta style={{
                            fontSize: 11,
                            color: filterSkill && r.primarySkill.toLowerCase().includes(filterSkill.toLowerCase())
                              ? 'var(--color-primary)'
                              : 'var(--color-text-muted)',
                            fontWeight: filterSkill && r.primarySkill.toLowerCase().includes(filterSkill.toLowerCase()) ? 600 : 400,
                          }}>
                            {r.primarySkill}
                          </Meta>
                        )}
                      </Info>
                    </ResultLeft>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <CapBadge $level={capLevel}>{cap}% free</CapBadge>
                      <AssignButton onClick={() => onAssign(request, r.name)}>
                        <UserPlus size={12} /> Assign
                      </AssignButton>
                    </div>
                  </ResultCard>
                )
              })}
            </ResultsList>
          )}
        </>
      )}
    </Modal>
  )
}
