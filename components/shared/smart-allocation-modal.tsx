'use client'

import { useState, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import Modal from '@/components/shared/modal'
import { Sparkles, ChevronLeft, MapPin, Users, Zap, Loader2, AlertCircle } from 'lucide-react'
import type { ResourceRequest } from '@/data/request-data'

/* ─── Types ──────────────────────────────────────── */
interface Candidate {
  id: string
  name: string
  grade: string
  serviceLine: string
  subServiceLine: string
  location: string
  region: string
  primarySkill: string
  utilization: number
  fitScore: number
  matchBreakdown: { skill: number; availability: number; grade: number }
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

/* ─── Styled Components ────────────────────────────── */
const StepBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
`

const StepBtn = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  border: 1.5px solid ${p => p.$active ? 'var(--color-primary)' : 'var(--color-border)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  cursor: pointer;
  transition: all 0.2s;
`

const StepArrow = styled.span`
  color: var(--color-text-muted);
  font-size: 16px;
`

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const FormLabel = styled.label`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;

  svg { color: var(--color-text-secondary); }
`

const FormSelect = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface, var(--color-bg-card));
  outline: none;
  cursor: pointer;
  &:focus { border-color: var(--color-primary); }
`

const FormInput = styled.input`
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface, var(--color-bg-card));
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: var(--color-primary); }
  &::placeholder { color: var(--color-text-muted); }
`

const HelpText = styled.span`
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
`

const PreviewBox = styled.div`
  margin-top: 20px;
  padding: 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  border-left: 3px solid var(--color-primary);
`

const PreviewTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  svg { color: var(--color-primary); }
`

const PreviewStats = styled.div`
  display: flex;
  gap: 16px;
  font-size: 12px;
`

const PreviewStat = styled.span<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 4px;
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${p => p.$color};
  }
`

const PreviewHint = styled.div`
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
`

const ActionRow = styled.div`
  display: flex;
  gap: 10px;
  margin-top: 24px;
`

const PrimaryBtn = styled.button`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;
  &:hover { opacity: 0.9; }
`

const SecondaryBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 20px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  &:hover { background: var(--color-border-light); }
`

const ResetBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 20px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  &:hover { background: var(--color-border-light); }
`

/* ── Step 2: Results ── */
const FiltersTag = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
`

const TagPill = styled.span`
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  color: var(--color-text);
`

const CandidateList = styled.div`
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
`

const CandidateCard = styled.div<{ $selected?: boolean }>`
  padding: 16px;
  border: 1.5px solid ${p => p.$selected ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 10px;
  background: ${p => p.$selected ? 'var(--color-primary-light)' : 'var(--color-bg-card)'};
  cursor: pointer;
  transition: all 0.2s;
  &:hover { border-color: var(--color-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
`

const CandidateHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
`

const CandidateName = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
`

const RankBadge = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
`

const MatchBadge = styled.span<{ $type: 'strong' | 'weak' | 'perfect' }>`
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  background: ${p => p.$type === 'perfect' ? '#dcfce7' : p.$type === 'strong' ? '#dbeafe' : '#fef9c3'};
  color: ${p => p.$type === 'perfect' ? '#15803d' : p.$type === 'strong' ? '#1d4ed8' : '#a16207'};
`

const ScoreArea = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
`

const ScoreValue = styled.span`
  font-size: 22px;
  font-weight: 800;
  color: var(--color-primary);
`

const ScoreLabel = styled.span`
  font-size: 11px;
  color: var(--color-text-muted);
`

const MatchBar = styled.div`
  width: 80px;
  height: 6px;
  border-radius: 3px;
  background: var(--color-border-light);
  overflow: hidden;
`

const MatchBarFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${p => p.$pct}%;
  border-radius: 3px;
  background: var(--color-primary);
`

const CandidateMeta = styled.div`
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  span { display: flex; align-items: center; gap: 3px; }
`

const Dot = styled.span`
  color: var(--color-text-muted);
`

const MatchTags = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
`

const MatchTag = styled.span<{ $matched: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => p.$matched ? '#dcfce7' : 'var(--color-border-light)'};
  color: ${p => p.$matched ? '#15803d' : 'var(--color-text-muted)'};
`

const LoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: 24px;
  font-size: 12px;
  color: var(--color-text-secondary);
`

const LoadingLabel = styled.span<{ $color: string }>`
  font-weight: 600;
  color: ${p => p.$color};
`

const OverAllocBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-danger);
`

const TopBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: var(--color-primary);
  color: #fff;
`

const CapBadge = styled.span<{ $level: 'high' | 'mid' | 'low' }>`
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  background: ${p => p.$level === 'high' ? '#dcfce7' : p.$level === 'mid' ? '#fef9c3' : '#fee2e2'};
  color: ${p => p.$level === 'high' ? '#15803d' : p.$level === 'mid' ? '#a16207' : '#dc2626'};
`

const Spinner = styled.span`
  display: inline-flex;
  animation: spin 1s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 20px;
  color: var(--color-text-muted);
  text-align: center;
  font-size: 14px;
`

/* ─── Component ────────────────────────────────────── */
export interface SmartAllocationResult {
  candidateId: string
  candidateName: string
  grade: string
  location: string
}

interface SmartAllocationModalProps {
  open: boolean
  onClose: () => void
  request?: ResourceRequest | null
  onSelect?: (result: SmartAllocationResult) => void
}

export default function SmartAllocationModal({ open, onClose, request, onSelect }: SmartAllocationModalProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null)

  const fetchCandidates = useCallback(async () => {
    if (!request?.primarySkill) {
      setError('This request has no primary skill specified — Smart Allocate requires it.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('primarySkill', request.primarySkill)
      if (request.grade) params.set('grade', request.grade)
      const startISO = request.startDateISO ?? parseDisplayDateToISO(request.durationStart)
      const endISO = request.endDateISO ?? parseDisplayDateToISO(request.durationEnd)
      if (startISO) params.set('startDate', startISO)
      if (endISO) params.set('endDate', endISO)

      const res = await fetch(`/api/smart-allocate?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setCandidates(body.data?.candidates ?? body.candidates ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch candidates')
    } finally {
      setLoading(false)
    }
  }, [request])

  // Auto-fetch when modal opens
  useEffect(() => {
    if (open && request) {
      setCandidates([])
      setSelectedCandidate(null)
      fetchCandidates()
    }
  }, [open, request, fetchCandidates])

  const handleClose = () => {
    setCandidates([])
    setSelectedCandidate(null)
    setError(null)
    onClose()
  }

  const perfectCount = candidates.filter(c => c.fitScore >= 85).length
  const strongCount  = candidates.filter(c => c.fitScore >= 65 && c.fitScore < 85).length
  const otherCount   = candidates.filter(c => c.fitScore < 65).length
  const getMatchType = (score: number): 'perfect' | 'strong' | 'weak' =>
    score >= 85 ? 'perfect' : score >= 65 ? 'strong' : 'weak'

  const requestTitle = request
    ? `Request #${request.id} — ${request.projectName}`
    : 'Smart Allocate'

  const criteriaLabels = [
    request?.primarySkill ? `Skill: ${request.primarySkill}` : null,
    request?.grade ? `Grade: ${request.grade}` : null,
    request?.durationStart ? `${request.durationStart} – ${request.durationEnd}` : null,
  ].filter(Boolean) as string[]

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Smart Resource Allocation"
      subtitle={requestTitle}
      size="lg"
      footer={
        <ActionRow>
          <SecondaryBtn onClick={handleClose}>
            <ChevronLeft size={14} /> Cancel
          </SecondaryBtn>
          <PrimaryBtn
            onClick={() => {
              if (selectedCandidate && onSelect) {
                const chosen = candidates.find(c => c.id === selectedCandidate)
                if (chosen) {
                  onSelect({
                    candidateId: chosen.id,
                    candidateName: chosen.name,
                    grade: chosen.grade,
                    location: chosen.location,
                  })
                }
              }
              handleClose()
            }}
            style={{ opacity: selectedCandidate ? 1 : 0.5 }}
          >
            <Users size={14} /> {selectedCandidate ? 'Allocate & Approve' : 'Select a Resource'}
          </PrimaryBtn>
        </ActionRow>
      }
    >
      {/* ── Request summary ── */}
      <PreviewBox>
        <PreviewTitle><Sparkles size={14} /> Matching Criteria (from request)</PreviewTitle>
        <FiltersTag>
          {criteriaLabels.map((l, i) => <TagPill key={i}>{l}</TagPill>)}
        </FiltersTag>
        {loading ? (
          <PreviewStats><Spinner><Loader2 size={14} /></Spinner> Scanning resources…</PreviewStats>
        ) : error ? (
          <PreviewStats style={{ color: 'var(--color-danger)' }}><AlertCircle size={14} /> {error}</PreviewStats>
        ) : (
          <PreviewStats>
            <PreviewStat $color="#22c55e">{perfectCount} Perfect</PreviewStat>
            <PreviewStat $color="#3b82f6">{strongCount} Strong</PreviewStat>
            <PreviewStat $color="#9ca3af">{otherCount} Other</PreviewStat>
          </PreviewStats>
        )}
      </PreviewBox>

      {/* ── Results ── */}
      {!loading && !error && candidates.length > 0 && (
        <CandidateList>
          {candidates.map((c, idx) => {
            const matchType = getMatchType(c.fitScore)
            const avail = Math.max(0, 100 - c.utilization)
            const capLevel = avail >= 50 ? 'high' : avail >= 20 ? 'mid' : 'low'

            return (
              <CandidateCard
                key={c.id}
                $selected={selectedCandidate === c.id}
                onClick={() => setSelectedCandidate(c.id === selectedCandidate ? null : c.id)}
                style={idx === 0 ? { borderLeft: '3px solid var(--color-primary)' } : undefined}
              >
                <CandidateHeader>
                  <CandidateName>
                    <RankBadge>#{idx + 1}</RankBadge>
                    {c.name}
                    <MatchBadge $type={matchType}>
                      {matchType === 'perfect' ? 'Perfect Match' : matchType === 'strong' ? 'Strong Match' : 'Weak Match'}
                    </MatchBadge>
                    {idx === 0 && <TopBadge><Zap size={10} /> Best Fit</TopBadge>}
                  </CandidateName>
                  <ScoreArea>
                    <ScoreValue>{c.fitScore}%</ScoreValue>
                    <ScoreLabel>fit score</ScoreLabel>
                    <MatchBar><MatchBarFill $pct={c.fitScore} /></MatchBar>
                  </ScoreArea>
                </CandidateHeader>

                <CandidateMeta>
                  <span>{c.grade}</span>
                  <Dot>·</Dot>
                  <span><MapPin size={12} /> {c.location}{c.region ? `, ${c.region}` : ''}</span>
                  <Dot>·</Dot>
                  <span>{c.serviceLine}{c.subServiceLine ? ` / ${c.subServiceLine}` : ''}</span>
                </CandidateMeta>

                <MatchTags>
                  <MatchTag $matched={c.matchBreakdown.skill > 0}>{c.matchBreakdown.skill > 0 ? '✓' : '✗'} Skill +{c.matchBreakdown.skill}</MatchTag>
                  <MatchTag $matched={c.matchBreakdown.availability >= 20}>{c.matchBreakdown.availability >= 20 ? '✓' : '~'} Avail +{c.matchBreakdown.availability}</MatchTag>
                  <MatchTag $matched={c.matchBreakdown.grade > 0}>{c.matchBreakdown.grade > 0 ? '✓' : '✗'} Grade +{c.matchBreakdown.grade}</MatchTag>
                </MatchTags>

                <LoadingRow>
                  <span>Utilization: <LoadingLabel $color={c.utilization > 80 ? 'var(--color-warning)' : 'var(--color-success)'}>{c.utilization}%</LoadingLabel></span>
                  <CapBadge $level={capLevel}>{avail}% free</CapBadge>
                </LoadingRow>
              </CandidateCard>
            )
          })}
        </CandidateList>
      )}

      {!loading && !error && candidates.length === 0 && request?.primarySkill && (
        <EmptyState>
          <AlertCircle size={20} />
          <div>No matching resources found for skill &quot;{request.primarySkill}&quot; in the request window.</div>
        </EmptyState>
      )}
    </Modal>
  )
}
