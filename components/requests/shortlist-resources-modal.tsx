'use client'

import { useState, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import Modal from '@/components/shared/modal'
import { Sparkles, Plus, X, MapPin, Loader2, AlertCircle, CheckSquare, Square, Send, Briefcase, Star, FileText } from 'lucide-react'
import type { ResourceRequest } from '@/data/request-data'
import { apiRaw } from '@/lib/api'

/* ── Types ── */
interface Candidate {
  id: string
  empCode: string
  name: string
  grade: string
  serviceLine: string
  subServiceLine: string
  location: string
  region: string
  primarySkill: string
  yearsExperience: number | null
  certifications: string | null
  languages: string | null
  employeeNote: string | null
  utilization: number
  fitScore: number
  matchBreakdown: { skill: number; availability: number; grade: number }
}

interface SelectedResource {
  employee_id?: string
  employee_name: string
  grade?: string
  service_line?: string
  sub_service_line?: string
  location?: string
  utilization_pct?: number
  fit_score?: number
}

function parseDisplayDateToISO(d: string): string {
  if (!d) return ''
  const months: Record<string, string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' }
  const parts = d.trim().split(/\s+/)
  if (parts.length < 3) return ''
  const day = parts[0].padStart(2, '0')
  const mon = months[parts[1]] ?? '01'
  const yr = parts[2].length === 2 ? `20${parts[2]}` : parts[2]
  return `${yr}-${mon}-${day}`
}

/* ── Styled Components ── */
const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 20px;
  align-items: start;
`

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const PanelTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
  svg { color: var(--color-primary); }
`

const CandidateList = styled.div`
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
  min-height: 0;
`

const CandidateCard = styled.div<{ $selected?: boolean }>`
  border: 1.5px solid ${p => p.$selected ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 10px;
  background: ${p => p.$selected ? 'var(--color-primary-light)' : 'var(--color-bg-card)'};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  &:hover { border-color: var(--color-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
`

const CardTop = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px 8px;
  flex: 1;
  min-height: 0;
`

const CheckCol = styled.div<{ $checked: boolean }>`
  color: ${p => p.$checked ? 'var(--color-primary)' : 'var(--color-border)'};
  flex-shrink: 0;
  margin-top: 2px;
`

const CardBody = styled.div`
  flex: 1;
  min-width: 0;
`

const CardNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
`

const CandidateName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
`

const FitBadge = styled.span<{ $score: number }>`
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: ${p => p.$score >= 85 ? '#dcfce7' : p.$score >= 65 ? '#dbeafe' : '#fef9c3'};
  color: ${p => p.$score >= 85 ? '#15803d' : p.$score >= 65 ? '#1d4ed8' : '#a16207'};
`

const UtilBadge = styled.span<{ $pct: number }>`
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: ${p => p.$pct > 80 ? '#fee2e2' : p.$pct > 50 ? '#fef9c3' : '#dcfce7'};
  color: ${p => p.$pct > 80 ? '#dc2626' : p.$pct > 50 ? '#a16207' : '#15803d'};
`

const MetaRow = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
`

const MetaDot = styled.span`
  color: var(--color-text-muted);
`

const TagRow = styled.div`
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
`

const Tag = styled.span<{ $color?: string }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => p.$color ?? 'var(--color-border-light)'};
  color: ${p => p.$color ? undefined : 'var(--color-text-secondary)'};
`

const ScoreBar = styled.div`
  display: flex;
  gap: 8px;
  padding: 8px 14px;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-secondary);
`

const ScoreItem = styled.span<{ $matched: boolean }>`
  display: flex;
  align-items: center;
  gap: 3px;
  font-weight: 600;
  color: ${p => p.$matched ? '#15803d' : 'var(--color-text-muted)'};
`

const NoteBox = styled.div`
  padding: 8px 14px;
  background: #fef9c3;
  border-top: 1px solid #fde68a;
  font-size: 11px;
  color: #78350f;
  display: flex;
  align-items: flex-start;
  gap: 5px;
  svg { flex-shrink: 0; margin-top: 1px; }
`

/* Right panel — selected shortlist */
const SelectedPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
`

const SelectedCard = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-primary-light);
  border: 1.5px solid var(--color-primary);
  border-radius: 8px;
`

const SelectedName = styled.div`
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
`

const SelectedMeta = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
`

const RemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: var(--color-text-muted);
  &:hover { background: var(--color-danger-light); color: var(--color-danger); }
`

const ManualRow = styled.div`
  display: flex;
  gap: 8px;
`

const ManualInput = styled.input`
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-bg-card);
  outline: none;
  &:focus { border-color: var(--color-primary); }
  &::placeholder { color: var(--color-text-muted); }
`

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  white-space: nowrap;
  &:hover { border-color: var(--color-primary); color: var(--color-primary); }
`

const CountBadge = styled.span<{ $hasItems: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  background: ${p => p.$hasItems ? 'var(--color-primary)' : 'var(--color-border-light)'};
  color: ${p => p.$hasItems ? '#fff' : 'var(--color-text-secondary)'};
`

const EmptyHint = styled.div`
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 24px 12px;
  font-style: italic;
`

const Spinner = styled.span`
  display: inline-flex;
  animation: spin 1s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
`

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`

const PrimaryBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  transition: background var(--transition-fast);
  &:hover { background: var(--color-primary-hover); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const SecondaryBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  &:hover { background: var(--color-border-light); }
`

const InfoBox = styled.div`
  padding: 10px 14px;
  background: var(--color-primary-light);
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  font-size: 12px;
  color: #1d4ed8;
  margin-bottom: 4px;
`

/* ── Component ── */
export interface ShortlistSubmitPayload {
  resources: SelectedResource[]
}

interface Props {
  open: boolean
  onClose: () => void
  request: ResourceRequest | null
  onSubmit: (payload: ShortlistSubmitPayload) => Promise<void>
}

export default function ShortlistResourcesModal({ open, onClose, request, onSubmit }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedResource[]>([])
  const [manualName, setManualName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchCandidates = useCallback(async () => {
    if (!request) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (request.primarySkill) params.set('primarySkill', request.primarySkill)
      if (request.grade) params.set('grade', request.grade)
      const startISO = request.startDateISO ?? parseDisplayDateToISO(request.durationStart)
      const endISO = request.endDateISO ?? parseDisplayDateToISO(request.durationEnd)
      if (startISO) params.set('startDate', startISO)
      if (endISO) params.set('endDate', endISO)
      const res = await apiRaw(`/api/smart-allocate?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setCandidates(body.data?.candidates ?? body.candidates ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch candidates')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    if (open && request) {
      setCandidates([])
      setSelected([])
      setManualName('')
      setError(null)
      fetchCandidates()
    }
  }, [open, request, fetchCandidates])

  const toggleCandidate = (c: Candidate) => {
    setSelected(prev => {
      const exists = prev.some(r => r.employee_id === c.id)
      if (exists) return prev.filter(r => r.employee_id !== c.id)
      return [...prev, {
        employee_id: c.id,
        employee_name: c.name,
        grade: c.grade,
        service_line: c.serviceLine,
        sub_service_line: c.subServiceLine,
        location: c.location,
        utilization_pct: c.utilization,
        fit_score: c.fitScore,
      }]
    })
  }

  const addManual = () => {
    const name = manualName.trim()
    if (!name) return
    if (selected.some(r => r.employee_name.toLowerCase() === name.toLowerCase())) return
    setSelected(prev => [...prev, { employee_name: name }])
    setManualName('')
  }

  const removeSelected = (idx: number) => setSelected(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    if (selected.length === 0) return
    setSubmitting(true)
    try {
      await onSubmit({ resources: selected })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shortlist Resources for Review"
      subtitle={request ? `Request #${request.id} — ${request.projectName}` : ''}
      size="xl"
      footer={
        <ActionRow>
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={handleSubmit} disabled={selected.length === 0 || submitting}>
            {submitting
              ? <><Spinner><Loader2 size={14} /></Spinner> Sending…</>
              : <><Send size={14} /> Send {selected.length > 0 ? `${selected.length} Profile${selected.length > 1 ? 's' : ''}` : 'Profiles'} for Review</>
            }
          </PrimaryBtn>
        </ActionRow>
      }
    >
      <InfoBox>
        Select 1–5 candidates to share with the EM/EP for review. They will choose their preferred resource and give the first approval before final allocation.
      </InfoBox>

      <TwoCol>
        {/* Left — smart suggestions */}
        <Panel>
          <PanelTitle>
            <Sparkles size={14} /> Smart Suggestions
            {loading && <Spinner><Loader2 size={12} /></Spinner>}
          </PanelTitle>

          {loading && <LoadingState><Spinner><Loader2 size={14} /></Spinner> Scanning available resources…</LoadingState>}
          {error && !loading && (
            <LoadingState style={{ color: 'var(--color-danger)' }}>
              <AlertCircle size={14} /> {error}
            </LoadingState>
          )}
          {!loading && !error && candidates.length === 0 && (
            <EmptyHint>No suggestions — add candidates manually on the right.</EmptyHint>
          )}

          {!loading && !error && candidates.length > 0 && (
            <CandidateList>
              {candidates.slice(0, 50).map(c => {
                const isSelected = selected.some(r => r.employee_id === c.id)
                return (
                  <CandidateCard key={c.id} $selected={isSelected} onClick={() => toggleCandidate(c)}>
                    <CardTop>
                      <CheckCol $checked={isSelected}>
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </CheckCol>
                      <CardBody>
                        <CardNameRow>
                          <CandidateName>{c.name}</CandidateName>
                          <FitBadge $score={c.fitScore}>{c.fitScore}% fit</FitBadge>
                          <UtilBadge $pct={c.utilization}>{c.utilization}% util</UtilBadge>
                        </CardNameRow>

                        <MetaRow>
                          <span>{c.grade}</span>
                          {c.location && <><MetaDot>·</MetaDot><span><MapPin size={10} style={{ display:'inline', verticalAlign:'middle' }} /> {c.location}{c.region ? `, ${c.region}` : ''}</span></>}
                          {c.serviceLine && <><MetaDot>·</MetaDot><span>{c.serviceLine}{c.subServiceLine ? ` / ${c.subServiceLine}` : ''}</span></>}
                          {c.yearsExperience != null && <><MetaDot>·</MetaDot><span>{c.yearsExperience}y exp</span></>}
                        </MetaRow>

                        <TagRow>
                          {c.primarySkill && (
                            <Tag $color="#dbeafe" style={{ color: '#1d4ed8' }}>
                              <Briefcase size={10} /> {c.primarySkill}
                            </Tag>
                          )}
                          {c.certifications && c.certifications.split(',').slice(0, 2).map((cert, i) => (
                            <Tag key={i} $color="#f3e8ff" style={{ color: '#7c3aed' }}>
                              <Star size={10} /> {cert.trim()}
                            </Tag>
                          ))}
                          {c.languages && (
                            <Tag>{c.languages}</Tag>
                          )}
                        </TagRow>
                      </CardBody>
                    </CardTop>

                    <ScoreBar>
                      <ScoreItem $matched={c.matchBreakdown.skill > 0}>
                        {c.matchBreakdown.skill > 0 ? '✓' : '✗'} Skill +{c.matchBreakdown.skill}
                      </ScoreItem>
                      <ScoreItem $matched={c.matchBreakdown.availability >= 20}>
                        {c.matchBreakdown.availability >= 20 ? '✓' : '~'} Availability +{c.matchBreakdown.availability}
                      </ScoreItem>
                      <ScoreItem $matched={c.matchBreakdown.grade > 0}>
                        {c.matchBreakdown.grade > 0 ? '✓' : '✗'} Grade +{c.matchBreakdown.grade}
                      </ScoreItem>
                    </ScoreBar>

                    {c.employeeNote && (
                      <NoteBox>
                        <FileText size={11} />
                        <span><strong>Note:</strong> {c.employeeNote}</span>
                      </NoteBox>
                    )}
                  </CandidateCard>
                )
              })}
            </CandidateList>
          )}
        </Panel>

        {/* Right — selected shortlist */}
        <Panel>
          <PanelTitle>
            Selected Shortlist <CountBadge $hasItems={selected.length > 0}>{selected.length}</CountBadge>
          </PanelTitle>

          <ManualRow>
            <ManualInput
              placeholder="Add resource by name…"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addManual() } }}
            />
            <AddBtn onClick={addManual}><Plus size={14} /> Add</AddBtn>
          </ManualRow>

          <SelectedPanel>
            {selected.length === 0 && (
              <EmptyHint>Check candidates from the left panel or add manually above.</EmptyHint>
            )}
            {selected.map((r, idx) => (
              <SelectedCard key={idx}>
                <div style={{ flex: 1 }}>
                  <SelectedName>{r.employee_name}</SelectedName>
                  <SelectedMeta>
                    {[r.grade, r.service_line, r.utilization_pct != null ? `${r.utilization_pct}% util` : null]
                      .filter(Boolean).join(' · ')}
                  </SelectedMeta>
                </div>
                <RemoveBtn onClick={() => removeSelected(idx)}><X size={14} /></RemoveBtn>
              </SelectedCard>
            ))}
          </SelectedPanel>
        </Panel>
      </TwoCol>
    </Modal>
  )
}
