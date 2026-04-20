'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import StatusBadge from '@/components/shared/status-badge'
import type { ResourceRequest } from '@/data/request-data'
import { Search, UserPlus, Clock, Calendar, Calculator, Check, ChevronDown, AlertTriangle } from 'lucide-react'
import {
  countWorkingDays,
  parseHoursString as sharedParseHoursString,
  parseDisplayDateToISO,
  computeTotalHours,
  STANDARD_HOURS_PER_DAY,
} from '@/lib/hours-calc'

/* ─── Employee shape ─── */
interface Employee {
  id: string          // emp_code from DB
  name: string
  grade: string       // designation
  location: string
  role: string        // sub_function
  currentLoading: number  // avg allocation_pct across visible weeks
}

/* ─── Helpers ─── */

/** Parse display date like "18 Nov 25" → Date object */
function parseDisplayDate(str: string): Date | null {
  if (!str) return null
  const iso = parseDisplayDateToISO(str)
  if (!iso) return null
  return new Date(iso + 'T00:00:00')
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getAvatarColor(name: string) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

/* ─── Styled Components ─── */

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const RequestSummary = styled.div`
  padding: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
`

const RequestInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const RequestTitle = styled.span`
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
`

const RequestMeta = styled.span`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const ProjectDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${p => p.$color};
  margin-right: 6px;
`

const AllocationSection = styled.div`
  padding: 20px;
  background: var(--color-bg-card);
  border: 1.5px solid var(--color-border);
  border-radius: 12px;
`

const AllocationSectionTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 16px;

  svg { color: var(--color-primary); }
`

const SearchBox = styled.div`
  position: relative;
  margin-bottom: 12px;
`

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 12px 10px 36px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface, var(--color-bg));
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: var(--color-primary); }
  &::placeholder { color: var(--color-text-muted); }
`

const SearchIcon = styled.div`
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  display: flex;
`

const EmployeeList = styled.div`
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 4px;
`

const EmployeeCard = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1.5px solid ${p => p.$selected ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 8px;
  background: ${p => p.$selected ? 'var(--color-primary-light)' : 'var(--color-bg-card)'};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
`

const EmployeeLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const Avatar = styled.div<{ $color: string }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: ${p => p.$color};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
`

const EmployeeName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const EmployeeMeta = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const EmployeeRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const LoadingBadge = styled.span<{ $level: 'low' | 'mid' | 'high' | 'over' }>`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  background: ${p =>
    p.$level === 'over' ? '#fecaca' :
    p.$level === 'high' ? '#fef3c7' :
    p.$level === 'mid' ? '#dbeafe' :
    '#dcfce7'};
  color: ${p =>
    p.$level === 'over' ? '#b91c1c' :
    p.$level === 'high' ? '#92400e' :
    p.$level === 'mid' ? '#1d4ed8' :
    '#15803d'};
`

const SelectedBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
`

const HoursGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
`

const HoursCard = styled.div<{ $editable?: boolean; $highlight?: boolean }>`
  padding: 16px;
  background: ${p => p.$highlight ? 'var(--color-primary-light)' : 'var(--color-bg)'};
  border: 1.5px solid ${p => p.$highlight ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s;
`

const HoursLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;

  svg { width: 14px; height: 14px; }
`

const HoursValue = styled.div`
  font-size: 24px;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1.2;
`

const HoursUnit = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  margin-left: 4px;
`

const EditableInput = styled.input`
  width: 100%;
  padding: 8px 10px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text);
  background: var(--color-bg-card);
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: var(--color-primary); }
`

const EditHint = styled.span`
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
`

const WarningBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 13px;
  color: #92400e;

  svg { flex-shrink: 0; margin-top: 1px; }
`

const EmptyMsg = styled.div`
  padding: 24px 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
`

const FooterRow = styled.div`
  display: flex;
  gap: 8px;
`

const ConfirmBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: var(--border-radius);
  background: var(--color-success);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  transition: background var(--transition-fast);
  border: none;
  cursor: pointer;
  &:hover { background: #16a34a; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const CancelBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  &:hover { background: var(--color-border-light); }
`

const AllocationPercentRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
`

const AllocationPctValue = styled.span<{ $over: boolean }>`
  font-size: 14px;
  font-weight: 700;
  color: ${p => p.$over ? 'var(--color-danger)' : 'var(--color-success)'};
`

const AllocationBar = styled.div`
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--color-border-light);
  overflow: hidden;
`

const AllocationBarFill = styled.div<{ $pct: number; $over: boolean }>`
  height: 100%;
  width: ${p => Math.min(p.$pct, 100)}%;
  border-radius: 4px;
  background: ${p => p.$over ? 'var(--color-danger)' : 'var(--color-success)'};
  transition: width 0.2s;
`

/* ─── Component ─── */

export interface AllocationResult {
  employeeId: string
  employeeName: string
  hoursPerDay: number
  totalHours: number
}

interface AllocateResourceModalProps {
  open: boolean
  request: ResourceRequest | null
  onClose: () => void
  onConfirm: (requestId: number, allocation: AllocationResult) => void
}

export default function AllocateResourceModal({ open, request, onClose, onConfirm }: AllocateResourceModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [customHoursPerDay, setCustomHoursPerDay] = useState<string>('')
  const [customTotalHours, setCustomTotalHours] = useState<string>('')
  const [editMode, setEditMode] = useState<'perDay' | 'total' | null>(null)

  // Fetch live employee list from the allocation view (single source of truth)
  useEffect(() => {
    if (!open) return
    setEmployeesLoading(true)
    fetch('/api/resources-data')
      .then(r => r.json())
      .then((body: { rows?: Array<{ emp_code: string; employee_name: string; designation: string | null; sub_function: string | null; location: string | null; allocation_pct: number }> }) => {
        if (!body.rows?.length) return
        const empMap = new Map<string, { name: string; grade: string; location: string; role: string; totalPct: number; count: number }>()
        for (const row of body.rows) {
          const key = row.emp_code
          const ex = empMap.get(key)
          if (!ex) {
            empMap.set(key, { name: row.employee_name, grade: row.designation ?? '', location: row.location ?? '', role: row.sub_function ?? '', totalPct: row.allocation_pct, count: 1 })
          } else {
            ex.totalPct += row.allocation_pct
            ex.count++
          }
        }
        setEmployees(Array.from(empMap.entries()).map(([id, v]) => ({
          id,
          name: v.name,
          grade: v.grade,
          location: v.location,
          role: v.role,
          currentLoading: Math.round(v.totalPct / v.count),
        })))
      })
      .catch(() => { /* leave employees empty — user sees "no data" */ })
      .finally(() => setEmployeesLoading(false))
  }, [open])

  const resetState = useCallback(() => {
    setEmployeeSearch('')
    setSelectedEmployeeId(null)
    setCustomHoursPerDay('')
    setCustomTotalHours('')
    setEditMode(null)
  }, [])

  const handleClose = () => {
    resetState()
    onClose()
  }

  // Parse dates and compute working days
  const startDate = useMemo(() => {
    if (!request) return null
    return parseDisplayDate(request.startDateISO ?? request.durationStart)
  }, [request])

  const endDate = useMemo(() => {
    if (!request) return null
    return parseDisplayDate(request.endDateISO ?? request.durationEnd)
  }, [request])

  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return 0
    return countWorkingDays(startDate, endDate)
  }, [startDate, endDate])

  // Base hours per day from request
  const baseHoursPerDay = useMemo(() => {
    if (!request) return 8
    return sharedParseHoursString(request.hoursPerDay)
  }, [request])

  // Effective values (customized or default)
  const effectiveHoursPerDay = useMemo(() => {
    if (editMode === 'perDay' && customHoursPerDay !== '') {
      const v = parseFloat(customHoursPerDay)
      return isNaN(v) ? baseHoursPerDay : v
    }
    if (editMode === 'total' && customTotalHours !== '' && workingDays > 0) {
      const total = parseFloat(customTotalHours)
      return isNaN(total) ? baseHoursPerDay : total / workingDays
    }
    return baseHoursPerDay
  }, [editMode, customHoursPerDay, customTotalHours, baseHoursPerDay, workingDays])

  const effectiveTotalHours = useMemo(() => {
    if (editMode === 'total' && customTotalHours !== '') {
      const v = parseFloat(customTotalHours)
      return isNaN(v) ? workingDays * baseHoursPerDay : v
    }
    return Math.round(workingDays * effectiveHoursPerDay * 100) / 100
  }, [editMode, customTotalHours, workingDays, effectiveHoursPerDay, baseHoursPerDay])

  const allocationPct = Math.round((effectiveHoursPerDay / 8) * 100)

  // Filter employees
  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.toLowerCase()
    if (!q) return employees
    return employees.filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.grade.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q)
    )
  }, [employeeSearch, employees])

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId)

  const handleConfirm = () => {
    if (!request || !selectedEmployee) return
    onConfirm(request.id, {
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      hoursPerDay: effectiveHoursPerDay,
      totalHours: effectiveTotalHours,
    })
    resetState()
  }

  const newLoading = selectedEmployee
    ? selectedEmployee.currentLoading + allocationPct
    : 0

  if (!request) return null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Allocate Resource"
      subtitle={`Request #${request.id} — ${request.projectName}`}
      size="lg"
      zIndex={110}
      footer={
        <FooterRow>
          <CancelBtn onClick={handleClose}>Cancel</CancelBtn>
          <ConfirmBtn onClick={handleConfirm} disabled={!selectedEmployeeId}>
            <Check size={16} /> Confirm Allocation
          </ConfirmBtn>
        </FooterRow>
      }
    >
      <ModalContent>
        {/* Request summary card */}
        <RequestSummary>
          <RequestInfo>
            <RequestTitle>
              <ProjectDot $color={request.projectColor} />
              {request.projectName}
            </RequestTitle>
            <RequestMeta>
              {request.requestType} &middot; {request.role || 'Any Role'} &middot; {request.grade || 'Any Grade'}
            </RequestMeta>
          </RequestInfo>
          <StatusBadge status={request.approvalStatus} />
        </RequestSummary>

        {/* Hours calculation section */}
        <AllocationSection>
          <AllocationSectionTitle>
            <Calculator size={16} /> Hours Calculation
          </AllocationSectionTitle>

          <HoursGrid>
            <HoursCard>
              <HoursLabel><Calendar size={14} /> Working Days</HoursLabel>
              <HoursValue>{workingDays}<HoursUnit>days</HoursUnit></HoursValue>
              <EditHint>{request.durationStart} — {request.durationEnd}</EditHint>
            </HoursCard>

            <HoursCard $editable $highlight={editMode === 'perDay'}>
              <HoursLabel><Clock size={14} /> Hours / Day</HoursLabel>
              {editMode === 'perDay' ? (
                <EditableInput
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={customHoursPerDay}
                  onChange={e => { setCustomHoursPerDay(e.target.value); setCustomTotalHours('') }}
                  autoFocus
                  placeholder={String(baseHoursPerDay)}
                />
              ) : (
                <HoursValue
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setEditMode('perDay'); setCustomHoursPerDay(String(Math.round(effectiveHoursPerDay * 100) / 100)) }}
                  title="Click to edit"
                >
                  {Math.round(effectiveHoursPerDay * 100) / 100}<HoursUnit>hrs</HoursUnit>
                </HoursValue>
              )}
              <EditHint>
                {editMode === 'perDay'
                  ? 'Total will recalculate automatically'
                  : 'Click to edit'}
              </EditHint>
            </HoursCard>

            <HoursCard $editable $highlight={editMode === 'total'}>
              <HoursLabel><Calculator size={14} /> Total Hours</HoursLabel>
              {editMode === 'total' ? (
                <EditableInput
                  type="number"
                  min={0}
                  step={1}
                  value={customTotalHours}
                  onChange={e => { setCustomTotalHours(e.target.value); setCustomHoursPerDay('') }}
                  autoFocus
                  placeholder={String(Math.round(workingDays * baseHoursPerDay))}
                />
              ) : (
                <HoursValue
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setEditMode('total'); setCustomTotalHours(String(Math.round(effectiveTotalHours * 100) / 100)) }}
                  title="Click to edit"
                >
                  {Math.round(effectiveTotalHours * 100) / 100}<HoursUnit>hrs</HoursUnit>
                </HoursValue>
              )}
              <EditHint>
                {editMode === 'total'
                  ? 'Hours/day will recalculate automatically'
                  : 'Click to edit'}
              </EditHint>
            </HoursCard>
          </HoursGrid>

          <AllocationPercentRow>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Allocation:</span>
            <AllocationBar>
              <AllocationBarFill $pct={allocationPct} $over={allocationPct > 100} />
            </AllocationBar>
            <AllocationPctValue $over={allocationPct > 100}>{allocationPct}%</AllocationPctValue>
          </AllocationPercentRow>
        </AllocationSection>

        {/* Employee selection section */}
        <AllocationSection>
          <AllocationSectionTitle>
            <UserPlus size={16} /> Assign Employee
          </AllocationSectionTitle>

          <SearchBox>
            <SearchIcon><Search size={16} /></SearchIcon>
            <SearchInput
              placeholder="Search by name, grade, location, or role..."
              value={employeeSearch}
              onChange={e => setEmployeeSearch(e.target.value)}
            />
          </SearchBox>

          <EmployeeList>
            {employeesLoading ? (
              <EmptyMsg>Loading resources…</EmptyMsg>
            ) : filteredEmployees.length === 0 ? (
              <EmptyMsg>
                {employees.length === 0
                  ? 'No resource data — upload a forecast sheet first'
                  : 'No employees match your search'}
              </EmptyMsg>
            ) : (
              filteredEmployees.map(emp => {
              const isSelected = emp.id === selectedEmployeeId
              const loadingLevel: 'low' | 'mid' | 'high' | 'over' =
                emp.currentLoading > 100 ? 'over' :
                emp.currentLoading > 80 ? 'high' :
                emp.currentLoading > 50 ? 'mid' : 'low'

              return (
                <EmployeeCard
                  key={emp.id}
                  $selected={isSelected}
                  onClick={() => setSelectedEmployeeId(isSelected ? null : emp.id)}
                >
                  <EmployeeLeft>
                    <Avatar $color={getAvatarColor(emp.name)}>
                      {getInitials(emp.name)}
                    </Avatar>
                    <div>
                      <EmployeeName>{emp.name}</EmployeeName>
                      <EmployeeMeta>{emp.role} &middot; {emp.grade} &middot; {emp.location}</EmployeeMeta>
                    </div>
                  </EmployeeLeft>
                  <EmployeeRight>
                    <LoadingBadge $level={loadingLevel}>{emp.currentLoading}% loaded</LoadingBadge>
                    {isSelected && (
                      <SelectedBadge><Check size={13} /></SelectedBadge>
                    )}
                  </EmployeeRight>
                </EmployeeCard>
              )
            }))}
          </EmployeeList>
        </AllocationSection>

        {/* Warning if over-allocation */}
        {selectedEmployee && newLoading > 100 && (
          <WarningBox>
            <AlertTriangle size={16} />
            <div>
              <strong>{selectedEmployee.name}</strong> will be at <strong>{newLoading}%</strong> loading after this allocation.
              This exceeds the 100% threshold. Consider adjusting hours or selecting a different resource.
            </div>
          </WarningBox>
        )}
      </ModalContent>
    </Modal>
  )
}
