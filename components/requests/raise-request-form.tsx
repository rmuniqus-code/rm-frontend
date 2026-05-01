'use client'

/**
 * Raise Resource Request Form
 *
 * Based on the Resource Request Form specification:
 *   - Project/Client Name
 *   - Opportunity ID (Zoho)
 *   - EM/EP Name
 *   - Role Description
 *   - Resource Grade
 *   - Project Start/End Date
 *   - Loading %
 *   - Skill Set Needed
 *   - Travel / Onsite Requirements
 *   - Project Status
 */

import { useState, useEffect, useMemo } from 'react'
import styled from 'styled-components'
import { X, Send } from 'lucide-react'
import {
  STANDARD_HOURS_PER_DAY,
  loadingToHoursPerDay,
  hoursPerDayToLoading,
  countWorkingDaysISO,
  computeTotalHours,
  formatTotalHours,
} from '@/lib/hours-calc'
import { serviceLines, subServiceLines, skillsByServiceLine, mockResources } from '@/data/mock-data'
import { useDashboardData } from '@/hooks/use-dashboard-data'

interface RaiseRequestFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: RequestFormData) => void
  /** Pre-fill for edit mode */
  initialData?: Partial<RequestFormData>
  mode?: 'create' | 'edit'
}

export interface RequestFormData {
  project_name: string
  opportunity_id: string
  em_ep_name: string
  role_needed: string
  grade_needed: string
  start_date: string
  end_date: string
  loading_pct: number
  hours_per_day: number
  skill_set: string
  travel_requirements: string
  project_status: string
  primary_skill: string
  notes: string
  request_type: string
  booking_type: string
  resource_requested: string
  service_line: string
  sub_service_line: string
}

const Overlay = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.25);
  z-index: 99;
  opacity: ${p => p.$open ? 1 : 0};
  pointer-events: ${p => p.$open ? 'auto' : 'none'};
  transition: opacity 0.2s ease;
`

const Panel = styled.div<{ $open: boolean }>`
  position: fixed;
  right: 0;
  top: 0;
  height: 100%;
  width: 520px;
  max-width: 95vw;
  background: var(--color-bg-card);
  box-shadow: -4px 0 24px rgba(0,0,0,0.12);
  border-left: 1px solid var(--color-border);
  z-index: 100;
  overflow-y: auto;
  transform: translateX(${p => p.$open ? '0' : '100%'});
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
`

const Title = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
`

const CloseBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-muted);
  &:hover { background: var(--color-border-light); color: var(--color-text); }
`

const FormBody = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--color-border-light);
  margin-top: 4px;
`

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
`

const Field = styled.div<{ $full?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 5px;
  ${p => p.$full ? 'grid-column: 1 / -1;' : ''}
`

const Label = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
`

const Input = styled.input`
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  font-size: 14px;
  color: var(--color-text);
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  &:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
  &::placeholder { color: var(--color-text-muted); }
`

const Select = styled.select`
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  font-size: 14px;
  color: var(--color-text);
  outline: none;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  &:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
`

const Textarea = styled.textarea`
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  font-size: 14px;
  color: var(--color-text);
  outline: none;
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  &:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
`

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
`

const CancelBtn = styled.button`
  padding: 10px 20px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: #fff;
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
  &:hover { background: var(--color-border-light); }
  &:focus-visible { outline: none; box-shadow: var(--focus-ring); }
`

const SubmitBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
  &:hover { background: var(--color-primary-hover); }
  &:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  &:disabled { background: #F2F4F7; border: 1px solid #EAECF0; color: #98A2B3; cursor: not-allowed; }
`

const HelperText = styled.span`
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
`

const SkillTabRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
`

const SkillTab = styled.button<{ $active: boolean }>`
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1.5px solid ${p => p.$active ? 'var(--color-primary)' : 'var(--color-border)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-bg)'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  &:hover {
    border-color: var(--color-primary);
    color: ${p => p.$active ? '#fff' : 'var(--color-primary)'};
  }
`

const InputModeToggle = styled.div`
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
  margin-bottom: 2px;
`

const InputModeBtn = styled.button<{ $active: boolean }>`
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { background: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-border-light)'}; }
`

const GRADES = [
  'Analyst', 'Associate Consultant', 'Consultant',
  'Assistant Manager', 'Manager', 'Associate Director', 'Director',
]

const REQUEST_TYPES = ['New Staff', 'Extension', 'Reallocation', 'Release']
const BOOKING_TYPES = ['Confirmed', 'Unconfirmed']
const PROJECT_STATUSES = ['Active', 'Pipeline', 'On Hold', 'Completed']

const EMPTY_FORM: RequestFormData = {
  project_name: '',
  opportunity_id: '',
  em_ep_name: '',
  role_needed: '',
  grade_needed: '',
  start_date: '',
  end_date: '',
  loading_pct: 100,
  hours_per_day: STANDARD_HOURS_PER_DAY,
  skill_set: '',
  travel_requirements: '',
  project_status: 'Active',
  primary_skill: '',
  notes: '',
  request_type: 'New Staff',
  booking_type: 'Unconfirmed',
  resource_requested: '',
  service_line: '',
  sub_service_line: '',
}

export default function RaiseRequestForm({ open, onClose, onSubmit, initialData, mode = 'create' }: RaiseRequestFormProps) {
  const [form, setForm] = useState<RequestFormData>({ ...EMPTY_FORM, ...initialData })
  const [submitting, setSubmitting] = useState(false)
  const [inputMode, setInputMode] = useState<'loading' | 'hours'>('loading')

  // Reset form whenever initialData or mode changes (e.g. opening edit for a different request)
  useEffect(() => {
    if (open) {
      const merged = { ...EMPTY_FORM, ...initialData }
      // Ensure hours_per_day is in sync with loading_pct on open
      if (!initialData?.hours_per_day && initialData?.loading_pct != null) {
        merged.hours_per_day = loadingToHoursPerDay(initialData.loading_pct)
      }
      setForm(merged)
    }
  }, [open, initialData, mode])

  const update = (field: keyof RequestFormData, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // When service_line changes, reset sub_service_line and resource_requested
  const handleServiceLineChange = (sl: string) => {
    setForm(prev => ({ ...prev, service_line: sl, sub_service_line: '', resource_requested: '' }))
  }

  // When sub_service_line changes, reset resource_requested
  const handleSubServiceLineChange = (ssl: string) => {
    setForm(prev => ({ ...prev, sub_service_line: ssl, resource_requested: '' }))
  }

  // Live employee data — falls back to mock if no live data
  const { data: liveData, hasLiveData } = useDashboardData()

  // Dynamic sub-service line options based on selected service line
  // When live data is available, derive options from actual employee sub-functions;
  // fall back to the static mock list.
  const subServiceLineOptions = useMemo(() => {
    if (!form.service_line) return []
    if (hasLiveData && liveData.employees.length > 0) {
      const live = Array.from(
        new Set(
          liveData.employees
            .filter(e => e.department === form.service_line && e.subFunction)
            .map(e => e.subFunction as string),
        ),
      ).sort()
      if (live.length > 0) return live
    }
    return subServiceLines[form.service_line] ?? []
  }, [form.service_line, hasLiveData, liveData])

  // Dynamic resource list filtered by service line + sub-service line
  const filteredResources = useMemo(() => {
    if (hasLiveData && liveData.employees.length > 0) {
      // Use live employees — map designation→grade, department→serviceLine, subFunction→subServiceLine
      let emps = liveData.employees
      if (form.service_line) {
        emps = emps.filter(e => e.department === form.service_line)
      }
      if (form.sub_service_line) {
        emps = emps.filter(e => e.subFunction === form.sub_service_line)
      }
      return emps.map(e => ({ id: e.empId, name: e.name, grade: e.designation }))
    }
    // Mock fallback
    let resources = mockResources
    if (form.service_line) {
      resources = resources.filter(r => r.serviceLine === form.service_line)
    }
    if (form.sub_service_line) {
      resources = resources.filter(r => r.subServiceLine === form.sub_service_line)
    }
    return resources.map(r => ({ id: r.id, name: r.name, grade: r.grade }))
  }, [form.service_line, form.sub_service_line, hasLiveData, liveData])

  // Bidirectional sync handlers
  const handleLoadingChange = (pct: number) => {
    const clamped = Math.max(0, Math.min(200, pct))
    setForm(prev => ({
      ...prev,
      loading_pct: clamped,
      hours_per_day: loadingToHoursPerDay(clamped),
    }))
  }

  const handleHoursPerDayChange = (hpd: number) => {
    const clamped = Math.max(0, Math.min(24, hpd))
    setForm(prev => ({
      ...prev,
      hours_per_day: clamped,
      loading_pct: hoursPerDayToLoading(clamped),
    }))
  }

  // Computed values for display
  const workingDays = useMemo(
    () => countWorkingDaysISO(form.start_date, form.end_date),
    [form.start_date, form.end_date]
  )
  const totalHours = useMemo(
    () => computeTotalHours(form.hours_per_day, workingDays),
    [form.hours_per_day, workingDays]
  )

  const handleSubmit = async () => {
    if (!form.project_name || !form.role_needed || !form.start_date || !form.end_date) return
    setSubmitting(true)
    try {
      onSubmit(form)
      if (mode === 'create') setForm({ ...EMPTY_FORM })
    } finally {
      setSubmitting(false)
    }
  }

  const isValid = form.project_name && form.role_needed && form.start_date && form.end_date

  return (
    <>
      <Overlay $open={open} onClick={onClose} />
      <Panel $open={open}>
        <Header>
          <Title>{mode === 'edit' ? 'Edit Request' : 'Raise Resource Request'}</Title>
          <CloseBtn onClick={onClose}><X size={16} /></CloseBtn>
        </Header>

        <FormBody>
          <SectionLabel>Engagement Information</SectionLabel>

          <FieldRow>
            <Field>
              <Label>Project / Client Name *</Label>
              <Input
                placeholder="Enter project name"
                value={form.project_name}
                onChange={e => update('project_name', e.target.value)}
              />
            </Field>
            <Field>
              <Label>Opportunity ID (Zoho)</Label>
              <Input
                placeholder="e.g. ZH-12345"
                value={form.opportunity_id}
                onChange={e => update('opportunity_id', e.target.value)}
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field>
              <Label>EM / EP Name</Label>
              <Input
                placeholder="Engagement Manager / Partner"
                value={form.em_ep_name}
                onChange={e => update('em_ep_name', e.target.value)}
              />
            </Field>
            <Field>
              <Label>Project Status</Label>
              <Select value={form.project_status} onChange={e => update('project_status', e.target.value)}>
                {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </FieldRow>

          <SectionLabel>Resource Requirements</SectionLabel>

          <FieldRow>
            <Field>
              <Label>Role Description *</Label>
              <Input
                placeholder="e.g. Senior Auditor"
                value={form.role_needed}
                onChange={e => update('role_needed', e.target.value)}
              />
            </Field>
            <Field>
              <Label>Resource Grade</Label>
              <Select value={form.grade_needed} onChange={e => update('grade_needed', e.target.value)}>
                <option value="">Select grade</option>
                {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field>
              <Label>Service Line</Label>
              <Select value={form.service_line} onChange={e => handleServiceLineChange(e.target.value)}>
                <option value="">All Service Lines</option>
                {serviceLines.map(sl => <option key={sl} value={sl}>{sl}</option>)}
              </Select>
            </Field>
            <Field>
              <Label>Sub-Service Line</Label>
              <Select
                value={form.sub_service_line}
                onChange={e => handleSubServiceLineChange(e.target.value)}
                disabled={!form.service_line}
              >
                <option value="">All Sub-Service Lines</option>
                {subServiceLineOptions.map(ssl => <option key={ssl} value={ssl}>{ssl}</option>)}
              </Select>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field>
              <Label>Resource Name</Label>
              <Select value={form.resource_requested} onChange={e => update('resource_requested', e.target.value)}>
                <option value="">Select resource (optional)</option>
                {filteredResources.map(r => (
                  <option key={r.id} value={r.name}>{r.name} — {r.grade}</option>
                ))}
              </Select>
              {form.service_line && (
                <HelperText>
                  Showing {filteredResources.length} resource{filteredResources.length !== 1 ? 's' : ''}
                  {form.sub_service_line ? ` in ${form.sub_service_line}` : ` in ${form.service_line}`}
                </HelperText>
              )}
            </Field>
          </FieldRow>

          <FieldRow>
            <Field>
              <Label>Start Date *</Label>
              <Input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)} />
            </Field>
            <Field>
              <Label>End Date *</Label>
              <Input type="date" value={form.end_date} onChange={e => update('end_date', e.target.value)} />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Label>{inputMode === 'loading' ? 'Loading %' : 'Hours / Day'}</Label>
                <InputModeToggle>
                  <InputModeBtn $active={inputMode === 'loading'} type="button" onClick={() => setInputMode('loading')}>Loading %</InputModeBtn>
                  <InputModeBtn $active={inputMode === 'hours'} type="button" onClick={() => setInputMode('hours')}>Hours/Day</InputModeBtn>
                </InputModeToggle>
              </div>
              {inputMode === 'loading' ? (
                <Input
                  type="number"
                  min={0} max={200} step={5}
                  value={form.loading_pct}
                  onChange={e => handleLoadingChange(Number(e.target.value))}
                />
              ) : (
                <Input
                  type="number"
                  min={0} max={24} step={0.5}
                  value={form.hours_per_day}
                  onChange={e => handleHoursPerDayChange(Number(e.target.value))}
                />
              )}
              <HelperText>
                {inputMode === 'loading'
                  ? `= ${form.hours_per_day}h/day`
                  : `= ${form.loading_pct}% loading`}
                {workingDays > 0 && ` · ${workingDays} working days · ${formatTotalHours(totalHours)} total`}
              </HelperText>
            </Field>
            <Field>
              <Label>Primary Skill</Label>
              {form.service_line && skillsByServiceLine[form.service_line]?.length > 0 && (
                <SkillTabRow>
                  {skillsByServiceLine[form.service_line].map(skill => (
                    <SkillTab
                      key={skill}
                      type="button"
                      $active={form.primary_skill === skill}
                      onClick={() => update('primary_skill', form.primary_skill === skill ? '' : skill)}
                    >
                      {skill}
                    </SkillTab>
                  ))}
                </SkillTabRow>
              )}
              <Input
                placeholder={form.service_line ? 'Or type a custom skill…' : 'e.g. IFRS, SOX, Internal Audit'}
                value={form.primary_skill}
                onChange={e => update('primary_skill', e.target.value)}
              />
            </Field>
          </FieldRow>

          <Field $full>
            <Label>Skill Set Needed</Label>
            <Textarea
              placeholder="Additional skills, certifications..."
              value={form.skill_set}
              onChange={e => update('skill_set', e.target.value)}
            />
          </Field>

          <FieldRow>
            <Field>
              <Label>Travel / Onsite Requirements</Label>
              <Select value={form.travel_requirements} onChange={e => update('travel_requirements', e.target.value)}>
                <option value="">None</option>
                <option value="Onsite">Onsite</option>
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Travel Required">Travel Required</option>
              </Select>
            </Field>
            <Field>
              <Label>Request Type</Label>
              <Select value={form.request_type} onChange={e => update('request_type', e.target.value)}>
                {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field>
              <Label>Booking Type</Label>
              <Select value={form.booking_type} onChange={e => update('booking_type', e.target.value)}>
                {BOOKING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </FieldRow>

          <Field $full>
            <Label>Additional Notes</Label>
            <Textarea
              placeholder="Any additional information..."
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
            />
          </Field>
        </FormBody>

        <Actions>
          <CancelBtn onClick={onClose}>Cancel</CancelBtn>
          <SubmitBtn onClick={handleSubmit} disabled={!isValid || submitting}>
            <Send size={14} />
            {submitting ? 'Submitting...' : mode === 'edit' ? 'Update Request' : 'Submit Request'}
          </SubmitBtn>
        </Actions>
      </Panel>
    </>
  )
}
