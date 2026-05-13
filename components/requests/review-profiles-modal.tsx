'use client'

import { useState, useEffect } from 'react'
import styled from 'styled-components'
import Modal from '@/components/shared/modal'
import { MapPin, Check, Loader2, AlertCircle, ThumbsUp, Users } from 'lucide-react'
import type { ResourceRequest, ShortlistedResource } from '@/data/request-data'

/* ── Styled Components ── */
const Grid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 440px;
  overflow-y: auto;
  padding-right: 4px;
`

const ProfileCard = styled.div<{ $selected?: boolean }>`
  padding: 16px;
  border: 2px solid ${p => p.$selected ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 10px;
  background: ${p => p.$selected ? 'var(--color-primary-light)' : 'var(--color-bg-card)'};
  cursor: pointer;
  transition: all 0.18s;

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
`

const ProfileHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
`

const ProfileNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const ProfileName = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
`

const SelectedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--color-primary);
  color: #fff;
`

const FitScore = styled.div<{ $score: number }>`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;

  span:first-child {
    font-size: 20px;
    font-weight: 800;
    color: ${p => p.$score >= 85 ? '#15803d' : p.$score >= 65 ? 'var(--color-primary)' : '#a16207'};
  }

  span:last-child {
    font-size: 10px;
    color: var(--color-text-muted);
  }
`

const ProfileMeta = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
`

const Dot = styled.span`
  color: var(--color-text-muted);
`

const TagRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

const Tag = styled.span<{ $variant?: 'util-good' | 'util-mid' | 'util-bad' | 'skill' | 'grade' }>`
  display: inline-flex;
  padding: 2px 9px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => {
    if (p.$variant === 'util-good') return '#dcfce7'
    if (p.$variant === 'util-mid')  return '#fef9c3'
    if (p.$variant === 'util-bad')  return '#fee2e2'
    if (p.$variant === 'skill')     return '#dbeafe'
    if (p.$variant === 'grade')     return 'var(--color-border-light)'
    return 'var(--color-border-light)'
  }};
  color: ${p => {
    if (p.$variant === 'util-good') return '#15803d'
    if (p.$variant === 'util-mid')  return '#a16207'
    if (p.$variant === 'util-bad')  return '#dc2626'
    if (p.$variant === 'skill')     return '#1d4ed8'
    return 'var(--color-text-secondary)'
  }};
`

const SelectBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1.5px solid ${p => p.$active ? 'var(--color-primary)' : 'var(--color-border)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  transition: all 0.15s;
  &:hover {
    border-color: var(--color-primary);
    background: ${p => p.$active ? 'var(--color-primary-hover)' : 'var(--color-primary-light)'};
    color: ${p => p.$active ? '#fff' : 'var(--color-primary)'};
  }
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
  background: var(--color-success);
  transition: background var(--transition-fast);
  &:hover { background: #16a34a; }
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

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 32px 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
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

const InfoBox = styled.div`
  padding: 10px 14px;
  background: #fef9c3;
  border: 1px solid #fde68a;
  border-radius: 8px;
  font-size: 12px;
  color: #a16207;
  margin-bottom: 12px;
`

/* ── Component ── */
interface Props {
  open: boolean
  onClose: () => void
  request: ResourceRequest | null
  onApprove: (shortlistedResourceId: string, resourceName: string, notes?: string) => Promise<void>
  loadResources: (requestUUID: string) => Promise<ShortlistedResource[]>
}

export default function ReviewProfilesModal({ open, onClose, request, onApprove, loadResources }: Props) {
  const [resources, setResources] = useState<ShortlistedResource[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open && request?.uuid) {
      setSelectedId(null)
      setNotes('')
      setLoading(true)
      loadResources(request.uuid).then(data => {
        setResources(data)
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [open, request, loadResources])

  const handleApprove = async () => {
    if (!selectedId) return
    const resource = resources.find(r => r.id === selectedId)
    if (!resource || !request?.uuid) return
    setSubmitting(true)
    try {
      await onApprove(selectedId, resource.employee_name, notes || undefined)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const utilVariant = (pct: number | null): 'util-good' | 'util-mid' | 'util-bad' => {
    if (pct == null) return 'util-mid'
    return pct <= 50 ? 'util-good' : pct <= 80 ? 'util-mid' : 'util-bad'
  }

  const selectedResource = resources.find(r => r.id === selectedId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review Shortlisted Profiles"
      subtitle={request ? `Request #${request.id} — ${request.projectName}` : ''}
      size="lg"
      footer={
        <ActionRow>
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <PrimaryBtn onClick={handleApprove} disabled={!selectedId || submitting}>
            {submitting
              ? <><Spinner><Loader2 size={14} /></Spinner> Approving…</>
              : <><ThumbsUp size={14} /> Approve {selectedResource ? selectedResource.employee_name : 'Selected Resource'}</>
            }
          </PrimaryBtn>
        </ActionRow>
      }
    >
      <InfoBox>
        The RM team has shortlisted these candidates for your request. Select your preferred resource and approve to move to final allocation.
      </InfoBox>

      {loading && (
        <LoadingState>
          <Spinner><Loader2 size={16} /></Spinner> Loading shortlisted profiles…
        </LoadingState>
      )}

      {!loading && resources.length === 0 && (
        <EmptyState>
          <AlertCircle size={20} />
          <div>No shortlisted profiles yet. The RM team will add candidates shortly.</div>
        </EmptyState>
      )}

      {!loading && resources.length > 0 && (
        <>
          <Grid>
            {resources.map(r => {
              const isSelected = selectedId === r.id
              const util = r.utilization_pct
              return (
                <ProfileCard key={r.id} $selected={isSelected} onClick={() => setSelectedId(isSelected ? null : r.id)}>
                  <ProfileHeader>
                    <ProfileNameRow>
                      <ProfileName>{r.employee_name}</ProfileName>
                      {isSelected && <SelectedBadge><Check size={10} /> Selected</SelectedBadge>}
                      {r.status === 'em_selected' && !isSelected && (
                        <SelectedBadge style={{ background: '#15803d' }}><Check size={10} /> Previously Selected</SelectedBadge>
                      )}
                    </ProfileNameRow>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.fit_score != null && (
                        <FitScore $score={r.fit_score}>
                          <span>{r.fit_score}%</span>
                          <span>fit score</span>
                        </FitScore>
                      )}
                      <SelectBtn $active={isSelected} onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : r.id) }}>
                        {isSelected ? <><Check size={12} /> Selected</> : <><Users size={12} /> Select</>}
                      </SelectBtn>
                    </div>
                  </ProfileHeader>

                  <ProfileMeta>
                    {r.grade && <span>{r.grade}</span>}
                    {r.location && <><Dot>·</Dot><span><MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {r.location}</span></>}
                    {r.service_line && <><Dot>·</Dot><span>{r.service_line}{r.sub_service_line ? ` / ${r.sub_service_line}` : ''}</span></>}
                    {r.shortlisted_by && <><Dot>·</Dot><span>Shortlisted by {r.shortlisted_by}</span></>}
                  </ProfileMeta>

                  <TagRow>
                    {util != null && (
                      <Tag $variant={utilVariant(util)}>{util}% utilised — {Math.max(0, 100 - util)}% free</Tag>
                    )}
                    {r.grade && <Tag $variant="grade">{r.grade}</Tag>}
                    {r.service_line && <Tag $variant="skill">{r.service_line}</Tag>}
                  </TagRow>

                  {r.notes && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                      Note: {r.notes}
                    </div>
                  )}
                </ProfileCard>
              )
            })}
          </Grid>

          {selectedId && (
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: 6 }}>
                Notes for RM (optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any specific instructions or context for the final allocation…"
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: 8,
                  fontSize: 13,
                  color: 'var(--color-text)',
                  background: 'var(--color-bg-card)',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
