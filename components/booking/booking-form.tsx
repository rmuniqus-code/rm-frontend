'use client'

import { useState, useMemo } from 'react'
import styled from 'styled-components'
import { X, Search, AlertCircle, CheckCircle2 } from 'lucide-react'
import { mockResources, mockProjects } from '@/data/mock-data'

/* ─── Types ────────────────────────────── */
interface BookingFormData {
  projectCode: string
  opportunityId: string
  resourceSearch: string
  selectedResource: string | null
  primarySkill: string
  sector: string
  startDate: string
  endDate: string
  allocation: number
  notes: string
}

interface BookingFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: BookingFormData) => void
}

/* ─── Styled Components ───────────────── */
const Overlay = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9999;
  display: ${p => (p.$open ? 'flex' : 'none')};
  align-items: center;
  justify-content: center;
  padding: 20px;
`

const Panel = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--color-border);

  h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text-primary);
  }
`

const CloseBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius);
  color: var(--color-text-secondary);

  &:hover {
    background: var(--color-border-light);
    color: var(--color-text-primary);
  }
`

const Body = styled.div`
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`

const Label = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);

  .required {
    color: var(--color-danger);
    margin-left: 2px;
  }
`

const Input = styled.input<{ $error?: boolean }>`
  padding: 10px 14px;
  border: 1px solid ${p => (p.$error ? 'var(--color-danger)' : 'var(--color-border-strong)')};
  border-radius: var(--border-radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: var(--focus-ring);
  }

  &::placeholder {
    color: var(--color-text-muted);
  }
`

const Select = styled.select<{ $error?: boolean }>`
  padding: 10px 14px;
  border: 1px solid ${p => (p.$error ? 'var(--color-danger)' : 'var(--color-border-strong)')};
  border-radius: var(--border-radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: var(--focus-ring);
  }
`

const TextArea = styled.textarea`
  padding: 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  resize: vertical;
  min-height: 60px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: var(--focus-ring);
  }
`

const ErrorMsg = styled.span`
  font-size: 11px;
  color: var(--color-danger);
  display: flex;
  align-items: center;
  gap: 4px;
`

const SearchWrap = styled.div`
  position: relative;
`

const SearchIcon = styled.div`
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
`

const SearchInput = styled(Input)`
  padding-left: 34px;
`

const Suggestions = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  max-height: 160px;
  overflow-y: auto;
  z-index: 10;
  box-shadow: var(--shadow-md);
`

const SuggestionItem = styled.li`
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;

  &:hover {
    background: var(--color-primary-light);
  }

  span:last-child {
    font-size: 11px;
    color: var(--color-text-muted);
  }
`

const SelectedChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  margin-top: 4px;

  button {
    display: flex;
    align-items: center;
    color: var(--color-primary);
    &:hover {
      color: var(--color-danger);
    }
  }
`

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
`

const Btn = styled.button<{ $variant?: 'primary' | 'ghost' }>`
  padding: 10px 20px;
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 600;
  transition: all var(--transition-fast);

  ${p =>
    p.$variant === 'primary'
      ? `
    background: var(--color-primary);
    color: #fff;
    &:hover:not(:disabled) { background: var(--color-primary-hover); }
    &:focus-visible { outline: none; box-shadow: var(--focus-ring); }
    &:disabled { background: #F2F4F7; border: 1px solid #EAECF0; color: #98A2B3; cursor: not-allowed; }
  `
      : `
    background: #fff;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-strong);
    &:hover { background: var(--color-border-light); }
    &:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  `}
`

const SliderWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const Slider = styled.input`
  flex: 1;
  accent-color: var(--color-primary);
`

const SliderValue = styled.span`
  font-size: 14px;
  font-weight: 700;
  min-width: 40px;
  color: var(--color-primary);
`

/* ─── Component ───────────────────────── */
const skills = ['React', 'Node.js', 'Python', 'Java', 'SAP', 'Data Analytics', 'Cloud Architecture', 'Cybersecurity', 'Financial Modeling', 'Tax Advisory', 'Audit', 'Project Management']
const sectors = ['', 'Banking & Finance', 'Healthcare', 'Technology', 'Manufacturing', 'Retail', 'Energy', 'Government', 'Telecom']

const initialForm: BookingFormData = {
  projectCode: '',
  opportunityId: '',
  resourceSearch: '',
  selectedResource: null,
  primarySkill: '',
  sector: '',
  startDate: '',
  endDate: '',
  allocation: 100,
  notes: '',
}

export default function BookingForm({ open, onClose, onSubmit }: BookingFormProps) {
  const [form, setForm] = useState<BookingFormData>(initialForm)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showSuggestions, setShowSuggestions] = useState(false)

  const set = (key: keyof BookingFormData, value: string | number | null) =>
    setForm(prev => ({ ...prev, [key]: value }))
  const touch = (key: string) => setTouched(prev => ({ ...prev, [key]: true }))

  const filteredResources = useMemo(() => {
    if (!form.resourceSearch.trim()) return []
    const q = form.resourceSearch.toLowerCase()
    return mockResources
      .filter(r => r.name.toLowerCase().includes(q) || r.grade.toLowerCase().includes(q))
      .slice(0, 8)
  }, [form.resourceSearch])

  const errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (!form.projectCode.trim()) e.projectCode = 'Project Code is required'
    if (!form.opportunityId.trim()) e.opportunityId = 'Opportunity ID is required'
    if (!form.primarySkill) e.primarySkill = 'Primary Skill is required'
    if (!form.startDate) e.startDate = 'Start date is required'
    if (!form.endDate) e.endDate = 'End date is required'
    if (form.startDate && form.endDate && form.startDate > form.endDate) e.endDate = 'End date must be after start date'
    return e
  }, [form])

  const isValid = Object.keys(errors).length === 0

  const handleSubmit = () => {
    setTouched({ projectCode: true, opportunityId: true, primarySkill: true, startDate: true, endDate: true })
    if (!isValid) return
    onSubmit(form)
    setForm(initialForm)
    setTouched({})
  }

  const handleClose = () => {
    setForm(initialForm)
    setTouched({})
    onClose()
  }

  const selectResource = (name: string) => {
    set('selectedResource', name)
    set('resourceSearch', '')
    setShowSuggestions(false)
  }

  return (
    <Overlay $open={open} onClick={handleClose}>
      <Panel onClick={e => e.stopPropagation()}>
        <Header>
          <h2>New Booking Request</h2>
          <CloseBtn onClick={handleClose}><X size={18} /></CloseBtn>
        </Header>

        <Body>
          <Row>
            <Field>
              <Label>Project Code <span className="required">*</span></Label>
              <Select
                $error={touched.projectCode && !!errors.projectCode}
                value={form.projectCode}
                onChange={e => set('projectCode', e.target.value)}
                onBlur={() => touch('projectCode')}
              >
                <option value="">Select project...</option>
                {mockProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
                ))}
              </Select>
              {touched.projectCode && errors.projectCode && (
                <ErrorMsg><AlertCircle size={12} />{errors.projectCode}</ErrorMsg>
              )}
            </Field>

            <Field>
              <Label>Opportunity ID <span className="required">*</span></Label>
              <Input
                $error={touched.opportunityId && !!errors.opportunityId}
                placeholder="e.g. OPP-2024-001"
                value={form.opportunityId}
                onChange={e => set('opportunityId', e.target.value)}
                onBlur={() => touch('opportunityId')}
              />
              {touched.opportunityId && errors.opportunityId && (
                <ErrorMsg><AlertCircle size={12} />{errors.opportunityId}</ErrorMsg>
              )}
            </Field>
          </Row>

          <Field>
            <Label>Resource (typeahead search)</Label>
            {form.selectedResource ? (
              <SelectedChip>
                <CheckCircle2 size={14} />
                {form.selectedResource}
                <button onClick={() => set('selectedResource', null)}><X size={14} /></button>
              </SelectedChip>
            ) : (
              <SearchWrap>
                <SearchIcon><Search size={14} /></SearchIcon>
                <SearchInput
                  placeholder="Search by name or role..."
                  value={form.resourceSearch}
                  onChange={e => { set('resourceSearch', e.target.value); setShowSuggestions(true) }}
                  onFocus={() => form.resourceSearch && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {showSuggestions && filteredResources.length > 0 && (
                  <Suggestions>
                    {filteredResources.map(r => (
                      <SuggestionItem key={r.id} onMouseDown={() => selectResource(r.name)}>
                        <span>{r.name}</span>
                        <span>{r.grade}</span>
                      </SuggestionItem>
                    ))}
                  </Suggestions>
                )}
              </SearchWrap>
            )}
          </Field>

          <Row>
            <Field>
              <Label>Primary Skill <span className="required">*</span></Label>
              <Select
                $error={touched.primarySkill && !!errors.primarySkill}
                value={form.primarySkill}
                onChange={e => set('primarySkill', e.target.value)}
                onBlur={() => touch('primarySkill')}
              >
                <option value="">Select skill...</option>
                {skills.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
              {touched.primarySkill && errors.primarySkill && (
                <ErrorMsg><AlertCircle size={12} />{errors.primarySkill}</ErrorMsg>
              )}
            </Field>

            <Field>
              <Label>Sector</Label>
              <Select value={form.sector} onChange={e => set('sector', e.target.value)}>
                <option value="">Optional...</option>
                {sectors.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>

          <Row>
            <Field>
              <Label>Start Date <span className="required">*</span></Label>
              <Input
                type="date"
                $error={touched.startDate && !!errors.startDate}
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                onBlur={() => touch('startDate')}
              />
              {touched.startDate && errors.startDate && (
                <ErrorMsg><AlertCircle size={12} />{errors.startDate}</ErrorMsg>
              )}
            </Field>

            <Field>
              <Label>End Date <span className="required">*</span></Label>
              <Input
                type="date"
                $error={touched.endDate && !!errors.endDate}
                value={form.endDate}
                onChange={e => set('endDate', e.target.value)}
                onBlur={() => touch('endDate')}
              />
              {touched.endDate && errors.endDate && (
                <ErrorMsg><AlertCircle size={12} />{errors.endDate}</ErrorMsg>
              )}
            </Field>
          </Row>

          <Field>
            <Label>Allocation %</Label>
            <SliderWrap>
              <Slider
                type="range"
                min={10}
                max={100}
                step={10}
                value={form.allocation}
                onChange={e => set('allocation', Number(e.target.value))}
              />
              <SliderValue>{form.allocation}%</SliderValue>
            </SliderWrap>
          </Field>

          <Field>
            <Label>Notes</Label>
            <TextArea
              placeholder="Additional context for this booking..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
            />
          </Field>
        </Body>

        <Footer>
          <Btn onClick={handleClose}>Cancel</Btn>
          <Btn $variant="primary" disabled={!isValid} onClick={handleSubmit}>
            Submit Booking
          </Btn>
        </Footer>
      </Panel>
    </Overlay>
  )
}
