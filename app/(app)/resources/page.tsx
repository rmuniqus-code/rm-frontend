'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import styled, { keyframes } from 'styled-components'
import AllocationGrid from '@/components/shared/allocation-grid'
import type { DayAllocation, GridRow, AllocationCategory } from '@/components/shared/allocation-grid'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import { useToast } from '@/components/shared/toast'
import {
  buildResourceViewRows,
  buildProjectViewRows,
  buildBiWeeklyResourceRows,
  buildBiWeeklyProjectRows,
  buildMonthlyResourceRows,
  buildMonthlyProjectRows,
  weekDays,
  biWeeklyDays,
  monthlyColumns,
  gridStats,
  resources as mockResources,
  projects as mockProjects,
  allLocations as mockAllLocations,
  allGrades as mockAllGrades,
  allRoles as mockAllRoles,
  allSubServiceLines as mockAllSubServiceLines,
  allRegions as mockAllRegions,
  allSkills,
} from '@/data/allocation-data'
import { Search, ChevronLeft, ChevronRight, MapPin, Briefcase, UserCheck, Pencil, X, Upload, Download, RefreshCw, UserPlus, Calendar, Plus } from 'lucide-react'
import RoleGuard from '@/components/shared/role-guard'
import ImportModal, { type UploadResult } from '@/components/dashboard/import-modal'
import { useResourcesData, isoToWeekColumn } from '@/hooks/use-resources-data'
import { useRole } from '@/components/shared/role-context'
import AssignToRequestModal from '@/components/shared/assign-to-request-modal'
import type { ResourceRequest } from '@/data/request-data'
import { useRequests } from '@/components/shared/requests-context'
import MultiSelect from '@/components/shared/multi-select'
import { apiRaw, apiAuthHeader, allocations as allocationsApi, projects as projectsApi, employeeNotes as employeeNotesApi } from '@/lib/api'

/* ─── Styled Components ───────────────────────────────── */

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
`

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const Logo = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
`

const BrandText = styled.div`
  h1 {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
  }
  p {
    font-size: 12px;
    color: var(--color-text-muted);
  }
`

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const SearchBox = styled.div`
  position: relative;
  width: 200px;

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
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius);
    background: var(--color-bg-card);
    font-size: 13px;
    outline: none;

    &:focus {
      border-color: var(--color-primary);
    }

    &::placeholder {
      color: var(--color-text-muted);
    }
  }
`

const FindBtn = styled.button`
  padding: 8px 20px;
  border-radius: var(--border-radius);
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-primary-hover);
  }
`

/* ─── KPI Stats ─────────────────────────────────────── */

const StatsRow = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`

const Stat = styled.div`
  padding: 14px 24px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  min-width: 140px;
`

const StatLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const StatValue = styled.div<{ $color?: string }>`
  font-size: 28px;
  font-weight: 800;
  color: ${p => p.$color || 'var(--color-text)'};
  line-height: 1.3;
`

/* ─── Controls Row ──────────────────────────────────── */

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-bg);
  padding: 8px 0;
`

const LeftControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
  flex: 1;
`

const RightControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`

const PerspectiveToggle = styled.div`
  display: inline-flex;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
`

const PerspectiveBtn = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  background: ${p => p.$active ? 'var(--color-primary-light)' : 'transparent'};
  border-right: 1px solid var(--color-border);
  transition: all var(--transition-fast);

  &:last-child { border-right: none; }
  &:hover { background: ${p => p.$active ? 'var(--color-primary-light)' : 'var(--color-border-light)'}; }
`

const FilterPills = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

const Pill = styled.button<{ $active: boolean; $color: string }>`
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  transition: all var(--transition-fast);
  border: 1.5px solid ${p => p.$active ? p.$color : 'var(--color-border)'};
  background: ${p => p.$active ? p.$color : 'var(--color-bg-card)'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};

  &:hover {
    border-color: ${p => p.$color};
  }
`

const TimeToggle = styled.div`
  display: inline-flex;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
`

const TimeBtn = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  transition: all var(--transition-fast);

  &:hover {
    background: ${p => p.$active ? 'var(--color-primary-hover)' : 'var(--color-border-light)'};
  }
`

const DateNav = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const DateLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
`

const NavBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`

const GoToDateWrap = styled.div`
  position: relative;
  display: inline-flex;

  input[type="date"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
`

const FilterDropdownRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
`

const FilterSelect = styled.select`
  padding: 6px 28px 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  font-size: 12px;
  color: var(--color-text);
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 120px;
  cursor: pointer;

  &:focus {
    border-color: var(--color-primary);
  }
`

const FilterLabel = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const AvailBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--color-primary);
  border-radius: var(--border-radius);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 600;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-primary);
    color: #fff;
  }
`

const AvailTable = styled.table`
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

  tr.selected {
    background: var(--color-primary-light);
  }

  tr:hover {
    background: var(--color-border-light);
    cursor: pointer;
  }
`

const UtilBar = styled.div<{ $value: number }>`
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  width: 60px;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: ${p => Math.min(100, p.$value)}%;
    border-radius: 3px;
    background: ${p =>
      p.$value >= 80 ? 'var(--color-success)' :
      p.$value >= 50 ? 'var(--color-warning)' :
      'var(--color-danger)'};
  }
`

/* ─── Modal Details ─────────────────────────────────── */

const AllocModalTable = styled.table`
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

/* ─── Pagination ─────────────────────────────────────── */

const PaginationRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-top: none;
  border-radius: 0 0 var(--border-radius-lg) var(--border-radius-lg);
  font-size: 13px;
  color: var(--color-text-secondary);
`

const PagInfo = styled.span`
  font-size: 13px;
  color: var(--color-text-secondary);
`

const PagControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const PagBtn = styled.button<{ $active?: boolean }>`
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-bg-card)'};
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  font-size: 12px;
  font-weight: 500;
  transition: all var(--transition-fast);
  &:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
  &:disabled { opacity: 0.4; cursor: default; }
`

const PagSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
  &:focus { outline: none; border-color: var(--color-primary); }
`

const CatBadge = styled.span<{ $cat: AllocationCategory }>`
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${p =>
    p.$cat === 'client' ? '#dbeafe' :
    p.$cat === 'internal' ? 'var(--color-info-light)' :
    p.$cat === 'training' ? '#f3e8ff' :
    p.$cat === 'leaves' ? '#fce7f3' :
    p.$cat === 'proposed' ? '#f3f4f6' :
    'var(--color-border-light)'};
  color: ${p =>
    p.$cat === 'client' ? '#0070C0' :
    p.$cat === 'internal' ? '#1d4ed8' :
    p.$cat === 'training' ? '#7c3aed' :
    p.$cat === 'leaves' ? '#be185d' :
    p.$cat === 'proposed' ? '#4b5563' :
    'var(--color-text-secondary)'};
`

/* ─── Find Availability Form ────────────────────────── */

const AvailFormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`

const AvailFormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const AvailFormLabel = styled.label`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--color-text-secondary);
  text-transform: uppercase;
`

const AvailFormInput = styled.input`
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  box-sizing: border-box;
  &:focus {
    border-color: var(--color-primary);
  }
`

const AvailFormSelect = styled.select`
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  cursor: pointer;
  &:focus {
    border-color: var(--color-primary);
  }
`

const AvailFormActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 28px;
`

const AvailResetBtn = styled.button`
  padding: 9px 24px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  &:hover { background: var(--color-border-light); }
`

const AvailFindBtn = styled.button`
  padding: 9px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;
  &:hover { opacity: 0.88; }
`

const AvailResultsList = styled.div`
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
  padding-right: 4px;
`

const AvailResultCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
  transition: all 0.15s;
  &:hover { border-color: var(--color-primary); box-shadow: 0 1px 6px rgba(0,0,0,0.06); }
`

const AvailResultLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const AvailResultAvatar = styled.div<{ $color: string }>`
  width: 34px;
  height: 34px;
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

const AvailResultInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const AvailResultName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const AvailResultMeta = styled.span`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const AvailResultRight = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const AvailCapBadge = styled.span<{ $level: 'low' | 'mid' | 'high' }>`
  display: inline-flex;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  background: ${p => p.$level === 'high' ? '#dcfce7' : p.$level === 'mid' ? '#dbeafe' : '#fef3c7'};
  color: ${p => p.$level === 'high' ? '#15803d' : p.$level === 'mid' ? '#1d4ed8' : '#92400e'};
`

const AvailResultsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border);
`

const AvailResultsTitle = styled.span`
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
`

const AvailResultsCount = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
`

const AvailEmptyMsg = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
`

/* ─── Right-Side Detail Panel ───────────────────────── */

const DetailPanelOverlay = styled.div<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.18);
  z-index: 110;
  opacity: ${p => p.$open ? 1 : 0};
  pointer-events: ${p => p.$open ? 'auto' : 'none'};
  transition: opacity 0.25s ease;
`

const DetailPanel = styled.div<{ $open: boolean }>`
  position: fixed;
  right: 0;
  top: 0;
  height: 100%;
  width: 400px;
  background: var(--color-bg-card);
  box-shadow: -4px 0 24px rgba(0,0,0,0.12);
  border-left: 1px solid var(--color-border);
  z-index: 111;
  overflow-y: auto;
  transform: translateX(${p => p.$open ? '0' : '100%'});
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
`

const PanelHeader = styled.div`
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  position: relative;
`

const PanelCloseBtn = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
    color: var(--color-text);
  }
`

const PanelTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  padding-right: 32px;
`

const PanelSubtitle = styled.p`
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 2px;
`

const PanelBody = styled.div`
  padding: 0;
`

const PanelSection = styled.div`
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border-light);
`

const PanelSectionTitle = styled.h3`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-bottom: 10px;
`

/* ─── Resource Detail Panel ────────────────────────────── */

const ResourceDetailStats = styled.div`
  display: flex;
  gap: 28px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
`

const ResourceDetailStat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-muted);
  }
`

const ResourceDetailStatValue = styled.span<{ $color?: string }>`
  font-size: 16px;
  font-weight: 700;
  color: ${p => p.$color || 'var(--color-text)'};
`

const SkillsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const SkillPill = styled.span`
  padding: 4px 12px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-bg);
`

const ProjectCardList = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
`

const ProjectCardBand = styled.div<{ $color: string }>`
  background: ${p => p.$color};
  padding: 12px 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`

const ProjectCardBandLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const ProjectCardName = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #fff;
`

const ProjectCardDaysMeta = styled.div`
  font-size: 12px;
  color: rgba(255,255,255,0.80);
`

const ProjectCardCatBadge = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255,255,255,0.22);
  color: #fff;
  white-space: nowrap;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 1px;
`

const NoteRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--color-bg-card);
  border-top: 1px solid var(--color-border-light);

  span {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
`

const NoteEditBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
    color: var(--color-primary);
  }
`

const NoteTextarea = styled.textarea`
  width: 100%;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--color-text);
  background: var(--color-bg);
  border: none;
  border-top: 1px solid var(--color-primary);
  outline: none;
  resize: vertical;
  min-height: 56px;
  font-family: inherit;
  line-height: 1.5;

  &::placeholder { color: var(--color-text-muted); }
`

const EmpNoteBox = styled.div`
  margin-top: 4px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;

  textarea {
    width: 100%;
    padding: 10px 12px;
    font-size: 12px;
    color: var(--color-text);
    background: var(--color-bg);
    border: none;
    outline: none;
    resize: vertical;
    min-height: 72px;
    font-family: inherit;
    line-height: 1.6;
    box-sizing: border-box;
    &::placeholder { color: var(--color-text-muted); }
    &:focus { border-color: var(--color-primary); }
  }
`

const EmpNoteFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 10px;
  background: var(--color-bg);
  border-top: 1px solid var(--color-border-light);
  font-size: 10px;
  color: var(--color-text-muted);
`

const ConfidentialBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

/* ─── Assign Resource Button ───────────────────────── */

const AssignBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  border: 1.5px solid var(--color-primary);
  border-radius: var(--border-radius);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-top: 8px;

  &:hover {
    background: var(--color-primary);
    color: #fff;
  }
`

const InlineActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
`

const InlineActionBtn = styled.button<{ $danger?: boolean; $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--border-radius);
  border: 1px solid ${p => p.$danger ? 'var(--color-error, #d33)' : 'var(--color-border)'};
  background: ${p => p.$primary ? 'var(--color-primary)' : p.$danger ? 'transparent' : 'var(--color-bg)'};
  color: ${p => p.$primary ? '#fff' : p.$danger ? 'var(--color-error, #d33)' : 'var(--color-text)'};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition-fast);
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
`

const InlineForm = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
  padding: 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
`

const InlineFormLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-secondary);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const InlineInput = styled.input`
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 13px;
`

const InlineSelect = styled.select`
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 13px;
`

/* ─── Loading Skeleton ──────────────────────────────── */

const skeletonShimmer = keyframes`
  0%   { background-position: -400px 0 }
  100% { background-position: 400px 0 }
`

const LoadingSkeleton = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 0;
`

const SkeletonRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`

const SkeletonCell = styled.div<{ $w: number }>`
  width: ${p => p.$w}px;
  height: 36px;
  border-radius: var(--border-radius-sm);
  background: linear-gradient(90deg, var(--color-border-light) 25%, var(--color-bg-card) 50%, var(--color-border-light) 75%);
  background-size: 800px 100%;
  animation: ${skeletonShimmer} 1.4s ease-in-out infinite;
  flex-shrink: 0;
`

/* ─── Full-screen loader ───────────────────────────── */

const spin = keyframes`
  to { transform: rotate(360deg); }
`

const FullScreenLoader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 16px;
`

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
`

const LoadingText = styled.p`
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
`

/* ─── Filter Definitions ────────────────────────────── */

const CATEGORY_FILTERS: { key: string; label: string; color: string; cat?: AllocationCategory }[] = [
  { key: 'all',       label: 'All',           color: '#0070C0' },
  { key: 'leaves',    label: 'Leaves',        color: '#FF33CC', cat: 'leaves' },
  { key: 'internal',  label: 'Internal Work', color: '#3b82f6', cat: 'internal' },
  { key: 'client',    label: 'Client-Facing', color: '#0070C0', cat: 'client' },
  { key: 'training',  label: 'Training (L&D)',color: '#8b5cf6', cat: 'training' },
  { key: 'available', label: 'Available',     color: '#92D050', cat: 'available' },
  { key: 'proposed',  label: 'Proposed',      color: '#9ca3af', cat: 'proposed' },
]

/* ─── Helpers ───────────────────────────────────────── */

function toMondayISO(dateISO: string): string {
  const d = new Date(dateISO + 'T00:00:00')
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Every Monday–Friday (inclusive) between two ISO date strings. */
function dailyDatesBetween(fromISO: string, toISO: string): string[] {
  if (!fromISO || !toISO) return []
  const days: string[] = []
  const cursor = new Date(fromISO + 'T00:00:00')
  const end = new Date(toISO + 'T00:00:00')
  while (cursor <= end) {
    const dow = cursor.getDay()
    if (dow >= 1 && dow <= 5) {  // Mon–Fri
      const y = cursor.getFullYear()
      const m = String(cursor.getMonth() + 1).padStart(2, '0')
      const d = String(cursor.getDate()).padStart(2, '0')
      days.push(`${y}-${m}-${d}`)
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function weekStartsBetween(fromISO: string, toISO: string): string[] {
  if (!fromISO || !toISO) return []
  const weeks: string[] = []
  const cursor = new Date(toMondayISO(fromISO) + 'T00:00:00')
  const end = new Date(toISO + 'T00:00:00')
  while (cursor <= end) {
    weeks.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks.length > 0 ? weeks : [toMondayISO(fromISO)]
}

/* ─── Component ─────────────────────────────────────── */

export default function ResourcesPage() {
  const { addToast } = useToast()
  const { canEditBooking, canViewEmployeeNotes } = useRole()
  const { data: liveData, loading: liveLoading, hasLiveData, refresh: refreshLive } = useResourcesData()
  const { updateStatus } = useRequests()
  const [importOpen, setImportOpen] = useState(false)
  const [exportingResources, setExportingResources] = useState(false)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignResourceName, setAssignResourceName] = useState('')
  const [perspective, setPerspective] = useState<'resource' | 'project'>('resource')
  const [activeFilter, setActiveFilter] = useState<Set<string>>(new Set(['all']))
  const [timeRange, setTimeRange] = useState<'Weekly' | 'Bi-Weekly' | 'Monthly'>('Weekly')
  const [search, setSearch] = useState('')
  const [dateOffset, setDateOffset] = useState(0)
  const [selectedRow, setSelectedRow] = useState<GridRow | null>(null)
  // Separate state for the resource detail panel — used by both resource-row clicks
  // and employee-block clicks in project view
  const [resourcePanelRow, setResourcePanelRow] = useState<GridRow | null>(null)
  const [selectedAlloc, setSelectedAlloc] = useState<{ row: GridRow; dayKey: string; alloc: DayAllocation } | null>(null)
  // Inline allocation editor — drives action buttons inside the Allocation Detail modal.
  // 'edit' / 'extend' / 'assign' open a small inline form; null = action buttons only.
  const [allocAction, setAllocAction] = useState<null | 'edit' | 'extend' | 'assign' | 'delete'>(null)
  const [allocForm, setAllocForm] = useState<{ pct: string; status: string; weeks: string; project: string; startDate: string; endDate: string }>(
    { pct: '100', status: 'confirmed', weeks: '4', project: '', startDate: '', endDate: '' },
  )
  const [allocNote, setAllocNote] = useState('')
  const [allocNotesDirty, setAllocNotesDirty] = useState(false)
  const [allocNotesBusy, setAllocNotesBusy] = useState(false)
  const allocNoteRef = useRef('')  // always-fresh allocation note value
  allocNoteRef.current = allocNote
  const [allocCodeHint, setAllocCodeHint] = useState<string | null>(null)
  // Employee-level confidential notes (admin/rm/slh only)
  const [empNotesMap, setEmpNotesMap] = useState<Record<string, string>>({})
  const empNotesMapRef = useRef<Record<string, string>>({})  // always-fresh map for save
  empNotesMapRef.current = empNotesMap
  const [empNotesBusy, setEmpNotesBusy] = useState(false)
  const [empNotesLoadedFor, setEmpNotesLoadedFor] = useState<string | null>(null)
  const [empNotesDirty, setEmpNotesDirty] = useState(false)
  // All notes pre-fetched for the hover tooltip (only loaded when canViewEmployeeNotes)
  const [allEmpNotes, setAllEmpNotes] = useState<Record<string, string>>({})
  const [allocBusy, setAllocBusy] = useState(false)
  const [locationFilter, setLocationFilter] = useState<string[]>([])
  const [gradeFilter, setGradeFilter] = useState<string[]>([])
  const [roleFilter, setRoleFilter] = useState<string[]>([])
  const [projectFilter, setProjectFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [availFilter, setAvailFilter] = useState('all')
  const [showAvailability, setShowAvailability] = useState(false)
  const [selectedAvailResource, setSelectedAvailResource] = useState<string | null>(null)
  const [regionFilter, setRegionFilter] = useState<string[]>([])
  const [subServiceLineFilter, setSubServiceLineFilter] = useState<string[]>([])
  const [availDateFrom, setAvailDateFrom] = useState('2026-04-16')
  const [availDateTo, setAvailDateTo] = useState('2026-05-15')
  const [availCapacity, setAvailCapacity] = useState('4')
  const [availPrimarySkill, setAvailPrimarySkill] = useState('any')
  const [availSecondarySkill, setAvailSecondarySkill] = useState('any')
  const [availSubTeamFn, setAvailSubTeamFn] = useState('any')
  const [availLocation, setAvailLocation] = useState('any')
  const [availResults, setAvailResults] = useState<Array<{
    id: string; name: string; role: string; location: string; grade: string
    subServiceLine: string; primarySkill: string; skills: string[]
    utilization: number; totalHours: number; freeHours: number
    availableCapacity: number
  }>>([])
  const [availSearched, setAvailSearched] = useState(false)
  const [availFilterActive, setAvailFilterActive] = useState(false)
  const [availFilterIds, setAvailFilterIds] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [panelAllocAction, setPanelAllocAction] = useState<{ projectLabel: string; action: 'edit' | 'extend' | 'delete'; deleteFrom?: string; deleteTo?: string } | null>(null)
  const [panelAllocForm, setPanelAllocForm] = useState({ pct: '100', status: 'confirmed', weeks: '4' })
  const [panelAllocBusy, setPanelAllocBusy] = useState(false)
  const [panelAddProjectOpen, setPanelAddProjectOpen] = useState(false)
  const [panelAddProjectForm, setPanelAddProjectForm] = useState({ project: '', pct: '100', status: 'confirmed', startDate: '', endDate: '' })
  const [panelAddProjectBusy, setPanelAddProjectBusy] = useState(false)
  const [panelAddProjectCodeHint, setPanelAddProjectCodeHint] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState<50 | 100 | 200>(50)
  const [page, setPage] = useState(1)

  // ── Data source: live when available, mock fallback ──────────
  const allWeeks = hasLiveData ? liveData!.allWeeks : []

  // Track selected month for Monthly view (year-month offset from today)
  const [monthOffset, setMonthOffset] = useState(0)

  // Ref to hold the first visible week ISO before a view-mode switch,
  // so the new view centres on the same date rather than jumping to today.
  const anchorWeekRef = useRef<string | null>(null)

  // Ref for the hidden date input so we can reset its value after each pick,
  // allowing the same date to be selected again (onChange only fires on change).
  const dateInputRef = useRef<HTMLInputElement>(null)

  // Number of week columns to show per view mode
  // For Monthly: computed dynamically below based on how many weeks fall in the month
  const baseWeeksInView = timeRange === 'Bi-Weekly' ? 2 : 1

  // Compute the calendar month boundaries for Monthly view
  // Generates work-weeks (Mon-Fri) that fall within the month.
  // First week = the Monday on or after the 1st (or 1st itself if Monday).
  // Last week = the last Monday whose Friday (Mon+4) is still within the month.
  const monthlyInfo = useMemo(() => {
    if (timeRange !== 'Monthly') return null
    const now = new Date()
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const monthStart = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
    const monthEnd = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0)

    const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    // Find the first Monday on or after the 1st of the month
    const dayOfWeek = monthStart.getDay() // 0=Sun, 1=Mon, ...
    const firstMonday = new Date(monthStart)
    if (dayOfWeek === 0) {
      firstMonday.setDate(firstMonday.getDate() + 1) // Sun → next Mon
    } else if (dayOfWeek !== 1) {
      firstMonday.setDate(firstMonday.getDate() + (8 - dayOfWeek)) // e.g. Wed(3) → +5 = next Mon
    }

    // Generate every Monday from firstMonday whose Monday is still in the month
    // (Friday may spill into the next month — that's fine)
    const monthWeekKeys: string[] = []
    const cursor = new Date(firstMonday)
    while (cursor.getMonth() === targetMonth.getMonth() && cursor.getFullYear() === targetMonth.getFullYear()) {
      monthWeekKeys.push(fmtDate(cursor))
      cursor.setDate(cursor.getDate() + 7)
    }

    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    return {
      monthStart: fmtDate(monthStart),
      monthEnd: fmtDate(monthEnd),
      monthIndex: targetMonth.getMonth(),
      year: targetMonth.getFullYear(),
      label: `${MONTH_NAMES[targetMonth.getMonth()]} ${targetMonth.getFullYear()}`,
      weekKeys: monthWeekKeys,
    }
  }, [timeRange, monthOffset])

  const weeksInView = timeRange === 'Monthly'
    ? (monthlyInfo?.weekKeys.length ?? 4)
    : baseWeeksInView

  // Navigation step: move one full "page" of weeks per click (1 month for Monthly)
  const navStep = timeRange === 'Monthly' ? weeksInView : baseWeeksInView

  // Re-center the view when switching time-range mode.
  // If anchorWeekRef has a value (set by the TimeBtn click before switching),
  // navigate to that week; otherwise fall back to centering on today.
  useEffect(() => {
    if (!hasLiveData || allWeeks.length === 0) return

    const anchor = anchorWeekRef.current
    anchorWeekRef.current = null // consume it

    if (timeRange === 'Monthly') {
      if (anchor) {
        const d = new Date(anchor + 'T00:00:00')
        const now = new Date()
        const diff = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth())
        setMonthOffset(diff)
      } else {
        setMonthOffset(0)
      }
      return // Monthly uses monthOffset, not dateOffset
    }

    // Find the Monday of the anchor date (or today) to use as the target week
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dayOfWeek = today.getDay()
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + daysToMonday)
    const y = monday.getFullYear()
    const mo = String(monday.getMonth() + 1).padStart(2, '0')
    const d = String(monday.getDate()).padStart(2, '0')
    const todayISO = `${y}-${mo}-${d}`
    const targetISO = anchor ?? todayISO

    let bestIdx = 0
    for (let i = 0; i < allWeeks.length; i++) {
      if (allWeeks[i] <= targetISO) bestIdx = i
      else break
    }
    const centred = Math.max(0, bestIdx - Math.floor(weeksInView / 2))
    setDateOffset(centred)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLiveData, timeRange])  // fires on mount AND when view mode changes

  // Pre-fetch all employee notes once for the hover tooltip (role-gated)
  useEffect(() => {
    if (!canViewEmployeeNotes) return
    employeeNotesApi.getAll()
      .then(({ notes }) => {
        setAllEmpNotes(notes)
        setEmpNotesMap(prev => ({ ...notes, ...prev }))  // seed panel map too
      })
      .catch(() => { /* non-critical */ })
  }, [canViewEmployeeNotes])  // eslint-disable-line react-hooks/exhaustive-deps

  // Load confidential employee note when the detail panel opens for a resource
  useEffect(() => {
    if (!resourcePanelRow || !canViewEmployeeNotes) return
    const empCode = resourcePanelRow.id
    if (empNotesLoadedFor === empCode) return  // already loaded
    setEmpNotesLoadedFor(empCode)
    setEmpNotesDirty(false)
    employeeNotesApi.get(empCode)
      .then(({ note }) => {
        setEmpNotesMap(prev => ({ ...prev, [empCode]: note ?? '' }))
        setAllEmpNotes(prev => note ? { ...prev, [empCode]: note } : prev)
      })
      .catch(() => { /* non-critical */ })
  }, [resourcePanelRow, canViewEmployeeNotes])   // eslint-disable-line react-hooks/exhaustive-deps

  // Current week window based on dateOffset (can be negative to scroll before data range)
  const maxOffset = Math.max(0, allWeeks.length - weeksInView)

  const visibleWeekKeys = useMemo(() => {
    // Monthly mode: always use calendar-generated week keys so all weeks in the
    // month are displayed regardless of how far the DB data extends.
    if (timeRange === 'Monthly' && monthlyInfo) {
      return monthlyInfo.weekKeys
    }
    if (!hasLiveData || allWeeks.length === 0) return null

    // If dateOffset is negative, we need to generate weeks before the first data week
    if (dateOffset < 0) {
      const firstWeek = allWeeks[0]
      const weeks: string[] = []
      for (let i = 0; i < weeksInView; i++) {
        const d = new Date(firstWeek + 'T00:00:00')
        d.setDate(d.getDate() + (dateOffset + i) * 7)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        weeks.push(`${y}-${m}-${dd}`)
      }
      return weeks
    }

    if (dateOffset > maxOffset) {
      // Generate future weeks beyond the last data week so navigation is unbounded
      const lastWeek = allWeeks[allWeeks.length - 1]
      const weeks: string[] = []
      for (let i = 0; i < weeksInView; i++) {
        const d = new Date(lastWeek + 'T00:00:00')
        d.setDate(d.getDate() + (dateOffset - maxOffset + i) * 7)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        weeks.push(`${y}-${m}-${dd}`)
      }
      return weeks
    }

    const clamped = Math.min(dateOffset, maxOffset)
    return allWeeks.slice(clamped, clamped + weeksInView)
  }, [hasLiveData, allWeeks, dateOffset, maxOffset, weeksInView, timeRange, monthlyInfo])

  // Build live rows for the visible week window (Bi-Weekly / Monthly)
  // Map calendar week keys to closest DB week keys for Monthly view.
  // Calendar generates pure Mondays; DB week_start values may be offset by ±1 day
  // (e.g. Sunday dates from Excel timezone issues). This mapping ensures data
  // shows even when keys don't match exactly.
  const weekKeyLookup = useMemo(() => {
    if (timeRange !== 'Monthly' || !hasLiveData || allWeeks.length === 0 || !visibleWeekKeys) return null
    const map = new Map<string, string>() // calendarKey → closest DB key
    for (const calKey of visibleWeekKeys) {
      // Exact match first
      if (allWeeks.includes(calKey)) { map.set(calKey, calKey); continue }
      // Find closest DB key within ±3 days
      const calMs = new Date(calKey + 'T00:00:00').getTime()
      let best: string | null = null
      let bestDiff = Infinity
      for (const dbKey of allWeeks) {
        const diff = Math.abs(new Date(dbKey + 'T00:00:00').getTime() - calMs)
        if (diff < bestDiff && diff <= 3 * 86400000) { bestDiff = diff; best = dbKey }
      }
      if (best) map.set(calKey, best)
    }
    return map
  }, [timeRange, hasLiveData, allWeeks, visibleWeekKeys])

  const liveRows = useMemo(() => {
    if (!visibleWeekKeys) return null
    if (timeRange === 'Weekly') return null  // handled by expandedWeekly below
    if (!hasLiveData) {
      // Monthly can show empty grid columns while data loads
      if (timeRange === 'Monthly') return { resource: [], project: [] }
      return null
    }
    const { resourceRows, projectRows } = liveData!
    // Slice days to only the visible week keys.
    // For Monthly: map each calendar key to the closest DB key for data lookup.
    const sliceDays = (rows: GridRow[]) =>
      rows.map(row => ({
        ...row,
        days: Object.fromEntries(visibleWeekKeys.map(k => {
          const dbKey = weekKeyLookup?.get(k) ?? k
          return [k, row.days[dbKey] ?? []]
        })),
      }))
    return {
      resource: sliceDays(resourceRows),
      project: sliceDays(projectRows),
    }
  }, [hasLiveData, liveData, visibleWeekKeys, timeRange, weekKeyLookup])

  // For Weekly mode: expand a single week_start into 5 weekday columns (Mon-Fri only)
  const expandedWeekly = useMemo(() => {
    if (!hasLiveData || timeRange !== 'Weekly' || !visibleWeekKeys || visibleWeekKeys.length === 0) return null
    const weekKey = visibleWeekKeys[0]
    const monday = new Date(weekKey + 'T00:00:00')
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    const dayKeys: string[] = []
    const dayCols: { key: string; label: string; sublabel: string }[] = []
    // Only Mon-Fri (5 working days) — completely exclude Sat/Sun
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      dayKeys.push(iso)
      dayCols.push({ key: iso, label: DAY_NAMES[i], sublabel: `${d.getDate()} ${M[d.getMonth()]}` })
    }

    // Spread weekly hours evenly over 5 working days only
    const expand = (rows: GridRow[]) =>
      rows.map(row => {
        const weekAllocs = row.days[weekKey] ?? []
        const newDays: Record<string, DayAllocation[]> = {}
        for (let i = 0; i < 5; i++) {
          newDays[dayKeys[i]] = weekAllocs.map((alloc, idx) => ({
            ...alloc,
            id: `${alloc.id}-d${i}-${idx}`,
            hours: alloc.hours != null ? Math.round(alloc.hours / 5) : undefined,
            allocPct: alloc.allocPct,
          }))
        }
        return { ...row, days: newDays }
      })

    const { resourceRows, projectRows } = liveData!
    return {
      dayCols,
      resource: expand(resourceRows),
      project: expand(projectRows),
    }
  }, [hasLiveData, liveData, timeRange, visibleWeekKeys])

  // Build live date columns for the grid (Bi-Weekly / Monthly)
  const liveDayColumns = useMemo(() => {
    if (!visibleWeekKeys || timeRange === 'Weekly') return null
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    if (timeRange === 'Monthly' && monthlyInfo) {
      // Monthly: each column is a full Mon-Fri work week
      return visibleWeekKeys.map(k => {
        const mon = new Date(k + 'T00:00:00')
        const fri = new Date(mon)
        fri.setDate(fri.getDate() + 4)
        const label = `${mon.getDate()}-${fri.getDate()} ${M[mon.getMonth()]}`
        const sublabel = `${mon.getDate()} ${M[mon.getMonth()]} – ${fri.getDate()} ${M[fri.getMonth()]}`
        return { key: k, label, sublabel }
      })
    }
    return visibleWeekKeys.map(k => {
      const { label, sublabel } = isoToWeekColumn(k)
      return { key: k, label, sublabel }
    })
  }, [visibleWeekKeys, timeRange])

  // Date range label (live or mock)
  const dateRangeLabel = useMemo(() => {
    // Monthly view: show full month name (e.g. "April 2026")
    if (timeRange === 'Monthly' && monthlyInfo) {
      return monthlyInfo.label
    }
    if (hasLiveData && visibleWeekKeys && visibleWeekKeys.length > 0) {
      const firstIso = visibleWeekKeys[0]
      const lastIso = visibleWeekKeys[visibleWeekKeys.length - 1]
      const from = new Date(firstIso + 'T00:00:00')
      const toBase = new Date(lastIso + 'T00:00:00')
      const toEnd = new Date(toBase)
      toEnd.setDate(toEnd.getDate() + 4) // End on Friday, not Sunday
      const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      return `${M[from.getMonth()]} ${from.getDate()} – ${toEnd.getDate()} ${M[toEnd.getMonth()]}, ${toEnd.getFullYear()}`
    }
    // Mock fallback
    const base = new Date(2026, 2, 8)
    base.setDate(base.getDate() + dateOffset * 7)
    const end = new Date(base); end.setDate(end.getDate() + 4)
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${M[base.getMonth()]} ${base.getDate()} – ${end.getDate()}, ${base.getFullYear()}`
  }, [hasLiveData, visibleWeekKeys, dateOffset, timeRange, monthlyInfo])

  // Build time-appropriate columns (mock fallback — suppressed while initial load is in flight)
  const dayColumns = useMemo(() => {
    if (expandedWeekly) return expandedWeekly.dayCols
    if (liveDayColumns) return liveDayColumns
    if (liveLoading) return []  // no columns during initial fetch — avoids mock flash
    if (timeRange === 'Bi-Weekly') return biWeeklyDays
    if (timeRange === 'Monthly') return monthlyColumns
    return weekDays
  }, [expandedWeekly, liveDayColumns, liveLoading, timeRange])

  // Build rows based on perspective + time range (mock fallback — suppressed while initial load is in flight)
  const rawRowsBase = useMemo(() => {
    if (expandedWeekly) return perspective === 'resource' ? expandedWeekly.resource : expandedWeekly.project
    if (liveRows) return perspective === 'resource' ? liveRows.resource : liveRows.project
    if (liveLoading) return []  // no mock rows during initial fetch — avoids mock flash
    if (timeRange === 'Bi-Weekly') {
      return perspective === 'resource' ? buildBiWeeklyResourceRows() : buildBiWeeklyProjectRows()
    }
    if (timeRange === 'Monthly') {
      return perspective === 'resource' ? buildMonthlyResourceRows() : buildMonthlyProjectRows()
    }
    return perspective === 'resource' ? buildResourceViewRows() : buildProjectViewRows()
  }, [expandedWeekly, liveRows, liveLoading, perspective, timeRange])

  // Recompute utilization based on visible columns and inject "Available X%"
  // blocks for weeks where the total allocation is less than 100%.
  const rawRows = useMemo(() => {
    if (rawRowsBase.length === 0 || dayColumns.length === 0) return rawRowsBase

    // For weekly view, hours are spread across 5 day columns (Mon-Fri).
    // The underlying data has 1 week → so use dayColumns.length for
    // weekly & the number of visible week keys otherwise.
    const isWeekly = timeRange === 'Weekly'
    // Weekly: 1 week shown as 5 day cols; Bi-Weekly/Monthly: each column = 1 week
    const visibleWeekCount = isWeekly ? 1 : dayColumns.length
    const maxH = visibleWeekCount * 40

    return rawRowsBase.map(row => {
      // Sum charged hours from visible columns only
      let chargedH = 0
      const newDays: Record<string, DayAllocation[]> = {}

      for (const col of dayColumns) {
        const allocs = row.days[col.key] ?? []
        newDays[col.key] = [...allocs]

        // Sum non-available allocation % for this column to detect partial availability
        const totalPct = allocs
          .filter(a => a.category !== 'available')
          .reduce((sum, a) => sum + (a.allocPct ?? (a.hours != null ? Math.round((a.hours / (isWeekly ? 8 : 40)) * 100) : 0)), 0)

        // Inject "Available X%" block for resource perspective:
        // - fully empty column (totalPct === 0) → Available 100%
        // - partially allocated column (0 < totalPct < 100) → Available remainder%
        if (perspective === 'resource') {
          const availPct = Math.max(0, 100 - totalPct)
          const hasAvailBlock = allocs.some(a => a.category === 'available')
          if (availPct > 0 && !hasAvailBlock) {
            newDays[col.key].push({
              id: `${row.id}-${col.key}-avail-auto`,
              label: 'Available',
              category: 'available',
              hours: isWeekly ? Math.round((availPct / 100) * 8) : Math.round((availPct / 100) * 40),
              allocPct: availPct,
            })
          }
        }

        for (const a of allocs) {
          if (a.category !== 'available') {
            chargedH += a.hours ?? 0
          }
        }
      }

      const util = maxH > 0 ? Math.round((chargedH / maxH) * 100) : 0
      return { ...row, days: newDays, utilization: util }
    })
  }, [rawRowsBase, dayColumns, timeRange, perspective])

  // Filter option sources — live data when available, mock fallback
  const activeLocations   = hasLiveData ? liveData!.filterOptions.locations   : mockAllLocations
  const activeGrades      = hasLiveData ? liveData!.filterOptions.grades      : mockAllGrades
  const activeRoles       = hasLiveData ? liveData!.filterOptions.roles       : mockAllRoles
  const activeSSLs        = hasLiveData ? liveData!.filterOptions.subServiceLines : mockAllSubServiceLines
  const activeStatuses    = hasLiveData
    ? [...new Set([...liveData!.employeeMeta.values()].map(m => m.employeeStatus).filter(Boolean))].sort()
    : []
  const activeRegions     = hasLiveData ? liveData!.filterOptions.regions     : mockAllRegions
  const activeProjects    = hasLiveData
    ? liveData!.projectOptions
    : mockProjects.map(p => ({ id: p.id, name: p.name }))

  // Build region → locations map for cascading location filter
  const regionToLocations = useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (hasLiveData && liveData) {
      liveData.employeeMeta.forEach(meta => {
        if (!meta.region || !meta.location) return
        if (!map.has(meta.region)) map.set(meta.region, new Set())
        map.get(meta.region)!.add(meta.location)
      })
    }
    return map
  }, [hasLiveData, liveData])

  // Locations shown in the dropdown — filtered by selected region (multi-select)
  const filteredActiveLocations = useMemo(() => {
    if (regionFilter.length === 0) return activeLocations
    const inRegions = new Set(regionFilter.flatMap(r => [...(regionToLocations.get(r) ?? [])]))
    return activeLocations.filter(l => inRegions.has(l))
  }, [regionFilter, activeLocations, regionToLocations])

  // Reset location filter when region changes (keep only still-valid selections)
  useEffect(() => {
    setLocationFilter(prev => prev.filter(l => filteredActiveLocations.includes(l)))
  }, [filteredActiveLocations])

  // Build service line → sub-service line map for cascade
  const serviceLineToSubSLs = useMemo(() => {
    const map = new Map<string, Set<string>>()
    if (hasLiveData && liveData) {
      liveData.employeeMeta.forEach(meta => {
        if (!meta.subServiceLine || !meta.role) return
        if (!map.has(meta.subServiceLine)) map.set(meta.subServiceLine, new Set())
        map.get(meta.subServiceLine)!.add(meta.role)
      })
    }
    return map
  }, [hasLiveData, liveData])

  // Sub-service lines (roles) shown in dropdown — filtered by selected service line (multi-select)
  const filteredActiveRoles = useMemo(() => {
    if (subServiceLineFilter.length === 0) return activeRoles
    const inSLs = new Set(subServiceLineFilter.flatMap(sl => [...(serviceLineToSubSLs.get(sl) ?? [])]))
    return activeRoles.filter(r => inSLs.has(r))
  }, [subServiceLineFilter, activeRoles, serviceLineToSubSLs])

  // Reset sub-service line when service line changes
  useEffect(() => {
    setRoleFilter(prev => prev.filter(r => filteredActiveRoles.includes(r)))
  }, [filteredActiveRoles])

  // Apply search filter (supports comma-separated names for multi-resource search)
  const searchedRows = useMemo(() => {
    if (!search) return rawRows
    const terms = search.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    if (terms.length === 0) return rawRows
    return rawRows.filter(r =>
      terms.some(q =>
        r.name.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
      )
    )
  }, [rawRows, search])

  // Apply location/grade/role filters (resource perspective only) + project filter (both perspectives)
  const structFiltered = useMemo(() => {
    let rows = searchedRows

    if (perspective === 'resource') {
      // Use live meta map if available, else fall back to mock resource map
      const getLocation   = (id: string) => hasLiveData ? liveData!.employeeMeta.get(id)?.location   : mockResources.find(r => r.id === id)?.location
      const getRegion     = (id: string) => hasLiveData ? liveData!.employeeMeta.get(id)?.region     : (mockResources.find(r => r.id === id) as any)?.region
      const getSSL        = (id: string) => hasLiveData ? liveData!.employeeMeta.get(id)?.subServiceLine : (mockResources.find(r => r.id === id) as any)?.subServiceLine
      const getGrade      = (id: string) => hasLiveData ? liveData!.employeeMeta.get(id)?.grade      : mockResources.find(r => r.id === id)?.grade
      const getRole       = (id: string) => hasLiveData ? liveData!.employeeMeta.get(id)?.role       : mockResources.find(r => r.id === id)?.role
      const getStatus     = (id: string) => hasLiveData ? (liveData!.employeeMeta.get(id)?.employeeStatus || 'Active') : 'Active'

      if (locationFilter.length > 0)       rows = rows.filter(r => locationFilter.includes(getLocation(r.id) ?? ''))
      if (regionFilter.length > 0)         rows = rows.filter(r => regionFilter.includes(getRegion(r.id) ?? ''))
      if (subServiceLineFilter.length > 0) rows = rows.filter(r => subServiceLineFilter.includes(getSSL(r.id) ?? ''))
      if (gradeFilter.length > 0)          rows = rows.filter(r => gradeFilter.includes(getGrade(r.id) ?? ''))
      if (roleFilter.length > 0)           rows = rows.filter(r => roleFilter.includes(getRole(r.id) ?? ''))
      if (statusFilter.length > 0)         rows = rows.filter(r => statusFilter.includes(getStatus(r.id)))
    }

    if (projectFilter.length > 0) {
      const projSet = new Set(projectFilter)
      if (perspective === 'project') {
        // In project view each row represents a project — match by row.id directly
        rows = rows.filter(row => projSet.has(row.id))
      } else {
        // In resource view allocs carry projectId — filter allocations within each row
        rows = rows.map(row => {
          const filteredDays: Record<string, DayAllocation[]> = {}
          for (const [dayKey, allocs] of Object.entries(row.days)) {
            filteredDays[dayKey] = allocs.filter(a => (a.projectId != null && projSet.has(a.projectId)) || a.category === 'available')
          }
          return { ...row, days: filteredDays }
        }).filter(row => Object.values(row.days).some(d => d.some(a => a.category !== 'available')))
      }
    }
    if (availFilter === 'available') rows = rows.filter(r => (r.utilization || 0) < 80)
    else if (availFilter === 'full') rows = rows.filter(r => (r.utilization || 0) >= 80)
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedRows, perspective, locationFilter, regionFilter, subServiceLineFilter, gradeFilter, roleFilter, JSON.stringify(projectFilter), availFilter, statusFilter, hasLiveData, liveData])

  // Apply category filter
  // Apply availability filter (from "Find Availability" → "Apply as Filter")
  const availFiltered = useMemo(() => {
    if (!availFilterActive || availFilterIds.size === 0) return structFiltered
    return structFiltered.filter(row => availFilterIds.has(row.id))
  }, [structFiltered, availFilterActive, availFilterIds])

  // Apply category filter (multi-select)
  const filteredRows = useMemo(() => {
    if (activeFilter.has('all') || activeFilter.size === 0) return availFiltered
    const selectedCats = CATEGORY_FILTERS
      .filter(f => activeFilter.has(f.key) && f.cat)
      .map(f => f.cat!)
    if (selectedCats.length === 0) return availFiltered
    return availFiltered.map(row => {
      const filteredDays: Record<string, DayAllocation[]> = {}
      for (const [dayKey, allocs] of Object.entries(row.days)) {
        filteredDays[dayKey] = allocs.filter(a => selectedCats.includes(a.category))
      }
      return { ...row, days: filteredDays }
    }).filter(row => Object.values(row.days).some(d => d.length > 0))
  }, [availFiltered, activeFilter])

  // KPI stats — recomputed from the *filtered* rows so they react to every filter
  const { kpiAvailHours, kpiUtil, kpiClientFacing } = useMemo(() => {
    const rows = filteredRows
    const isWeekly = timeRange === 'Weekly'

    // Compute available hours across visible period for all filtered resources
    let totalAvailHours = 0
    let totalChargedHours = 0
    let totalMaxHours = 0
    let clientFacingCount = 0

    for (const row of rows) {
      let rowCharged = 0
      let hasClientWork = false
      for (const col of dayColumns) {
        const allocs = row.days[col.key] ?? []
        for (const a of allocs) {
          if (a.category === 'available') {
            totalAvailHours += a.hours ?? 0
          } else {
            rowCharged += a.hours ?? 0
            if (a.category === 'client') hasClientWork = true
          }
        }
      }
      totalChargedHours += rowCharged
      if (hasClientWork) clientFacingCount++
      // Max hours = visible weeks * 40h (weekly: 1 week shown as 5 day cols)
      const visibleWeekCount = isWeekly ? 1 : dayColumns.length
      totalMaxHours += visibleWeekCount * 40
    }

    const utilValues = rows.map(r => r.utilization ?? 0).filter(u => u > 0)
    const avgUtil = utilValues.length > 0
      ? Math.round(utilValues.reduce((s, v) => s + v, 0) / utilValues.length)
      : (hasLiveData ? liveData!.avgUtilization : gridStats.avgUtilization)

    return {
      kpiAvailHours: totalAvailHours,
      kpiUtil: avgUtil,
      kpiClientFacing: clientFacingCount,
    }
  }, [filteredRows, hasLiveData, liveData, dayColumns, timeRange])

  // Reset to page 1 whenever filters or page size change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, [activeFilter, locationFilter, regionFilter, subServiceLineFilter, gradeFilter, roleFilter, JSON.stringify(projectFilter), availFilter, statusFilter, search, pageSize])

  // Paginated slice for the grid
  const totalRows  = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pagedRows  = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize)

  // Availability data for modal (live or mock)
  const availabilityData = useMemo(() => {
    const allRows = expandedWeekly?.resource ?? liveRows?.resource ?? buildResourceViewRows()
    return allRows.map(r => {
      const meta = hasLiveData ? liveData!.employeeMeta.get(r.id) : mockResources.find(ri => ri.id === r.id)
      const mockRes = mockResources.find(ri => ri.id === r.id)
      const totalHours = Object.values(r.days).reduce((sum, dayAllocs) =>
        sum + dayAllocs.reduce((ds, a) => ds + (a.category !== 'available' ? (a.hours || 0) : 0), 0), 0)
      const maxHours = (dayColumns.length || 1) * 40
      return {
        id: r.id, name: r.name,
        role: (meta as any)?.role || r.subtitle,
        location: (meta as any)?.location || '',
        grade: (meta as any)?.grade || '',
        subServiceLine: (meta as any)?.subServiceLine || mockRes?.subServiceLine || '',
        primarySkill: mockRes?.primarySkill || '',
        skills: mockRes?.skills || [] as string[],
        utilization: r.utilization || 0,
        totalHours,
        freeHours: Math.max(0, maxHours - totalHours),
        availableCapacity: Math.max(0, 100 - (r.utilization || 0)),
        allocations: r.days,
      }
    })
  }, [expandedWeekly, liveRows, hasLiveData, liveData, dayColumns])

  const handleImportComplete = (result: UploadResult) => {
    addToast(`Uploaded ${result.successCount} rows (${result.fileType})`, 'success')
    refreshLive()
  }

  const handleCellClick = (row: GridRow, dayKey: string, alloc: DayAllocation) => {
    // In project view, clicking an employee block opens their resource detail panel
    if (perspective === 'project' && alloc.resourceId) {
      const allResRows = expandedWeekly?.resource ?? liveRows?.resource ?? []
      const resRow = allResRows.find(r => r.id === alloc.resourceId) ?? null
      if (resRow) { setResourcePanelRow(resRow); return }
    }
    setSelectedAlloc({ row, dayKey, alloc })
    setAllocAction(null)
    setAllocNote(alloc.note ?? '')
    setAllocNotesDirty(false)
    setAllocCodeHint(null)
    // Default date range to the Mon–Fri of the clicked week
    const dk = new Date(dayKey + 'T00:00:00')
    const dow = dk.getDay()
    const toMon = dow === 0 ? -6 : 1 - dow
    const mon = new Date(dk); mon.setDate(dk.getDate() + toMon)
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    const pad = (n: number) => String(n).padStart(2, '0')
    const monISO = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`
    const friISO = `${fri.getFullYear()}-${pad(fri.getMonth() + 1)}-${pad(fri.getDate())}`
    setAllocForm({
      pct: String(Math.round(alloc.allocPct ?? 100)),
      status: alloc.category === 'proposed' ? 'proposed' : 'confirmed',
      weeks: '4',
      project: '',
      startDate: monISO,
      endDate: friISO,
    })
  }

  const handleRowClick = (row: GridRow) => {
    if (perspective === 'resource') setResourcePanelRow(row)
    else setSelectedRow(row) // project row → project detail modal
  }

  // Opens the allocation popup with the assign form pre-expanded so the user
  // can immediately add a new project to any week — even fully booked ones.
  const handleAddProject = (row: GridRow, dayKey: string) => {
    const allocs = row.days[dayKey] ?? []
    const firstAlloc = allocs[0]
    if (!firstAlloc) return
    setSelectedAlloc({ row, dayKey, alloc: firstAlloc })
    setAllocNote(firstAlloc.note ?? '')
    setAllocCodeHint(null)
    const dk = new Date(dayKey + 'T00:00:00')
    const dow = dk.getDay()
    const toMon = dow === 0 ? -6 : 1 - dow
    const mon = new Date(dk); mon.setDate(dk.getDate() + toMon)
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
    const pad = (n: number) => String(n).padStart(2, '0')
    const monISO = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`
    const friISO = `${fri.getFullYear()}-${pad(fri.getMonth() + 1)}-${pad(fri.getDate())}`
    setAllocForm({ pct: '100', status: 'confirmed', weeks: '4', project: '', startDate: monISO, endDate: friISO })
    setAllocAction('assign')  // jump straight into the assign form
  }

  // Navigate the grid to a specific date picked from the calendar
  const handleGoToDate = (isoDate: string) => {
    if (!isoDate) return
    const target = new Date(isoDate + 'T00:00:00')
    if (isNaN(target.getTime())) return

    if (timeRange === 'Monthly') {
      // Switch month offset to the month containing the target date
      const now = new Date()
      const diff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
      setMonthOffset(diff)
    } else {
      // Find the Monday of the target date's week
      const dow = target.getDay()
      const daysToMon = dow === 0 ? -6 : 1 - dow
      const targetMon = new Date(target)
      targetMon.setDate(target.getDate() + daysToMon)
      const y = targetMon.getFullYear()
      const m = String(targetMon.getMonth() + 1).padStart(2, '0')
      const d = String(targetMon.getDate()).padStart(2, '0')
      const targetISO = `${y}-${m}-${d}`

      if (hasLiveData && allWeeks.length > 0) {
        // Find the closest week index in allWeeks
        let bestIdx = 0
        for (let i = 0; i < allWeeks.length; i++) {
          if (allWeeks[i] <= targetISO) bestIdx = i
          else break
        }
        setDateOffset(bestIdx)
      }
    }
    // Reset the input so the same date can be re-selected (onChange only fires on value change)
    setTimeout(() => { if (dateInputRef.current) dateInputRef.current.value = '' }, 0)
    addToast(`Navigated to ${isoDate}`, 'info')
  }

  const handleExportResources = async () => {
    setExportingResources(true)
    try {
      const auth = await apiAuthHeader()
      const url = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/api/exports/employees`
      const res = await fetch(url, { headers: auth })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[ 1] ?? 'employees.csv'
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExportingResources(false)
    }
  }

  const handleFindAvailability = () => {
    setAvailSearched(false)
    setAvailResults([])
    setShowAvailability(true)
  }

  const handleFindResources = () => {
    const capacity = Number(availCapacity) || 0
    const dateFrom = availDateFrom
    const dateTo = availDateTo

    // Use ALL resource rows from live data (entire date range), not just the visible window
    const allRows = hasLiveData ? liveData!.resourceRows : buildResourceViewRows()

    // Compute availability within the specified date range
    const rangeResults = allRows.map(r => {
      const meta = hasLiveData ? liveData!.employeeMeta.get(r.id) : mockResources.find(ri => ri.id === r.id)
      const mockRes = mockResources.find(ri => ri.id === r.id)

      // Only count hours from weeks that fall within the date range
      let totalHours = 0
      let weekCount = 0
      for (const [weekKey, dayAllocs] of Object.entries(r.days)) {
        // weekKey is a Monday ISO date; check if it overlaps with the date range
        // A week covers weekKey (Mon) through weekKey+4 (Fri)
        const weekEnd = new Date(weekKey + 'T00:00:00')
        weekEnd.setDate(weekEnd.getDate() + 4)
        const weekEndISO = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`

        if (weekKey <= dateTo && weekEndISO >= dateFrom) {
          weekCount++
          totalHours += dayAllocs.reduce((sum, a) =>
            sum + (a.category !== 'available' ? (a.hours || 0) : 0), 0)
        }
      }

      const maxHours = Math.max(1, weekCount) * 40
      const utilization = weekCount > 0 ? Math.round((totalHours / maxHours) * 100) : 0
      const availableCapacity = Math.max(0, 100 - utilization)

      return {
        id: r.id, name: r.name,
        role: (meta as any)?.role || r.subtitle,
        location: (meta as any)?.location || '',
        grade: (meta as any)?.grade || '',
        subServiceLine: (meta as any)?.subServiceLine || mockRes?.subServiceLine || '',
        primarySkill: mockRes?.primarySkill || '',
        skills: mockRes?.skills || [] as string[],
        utilization,
        totalHours,
        freeHours: Math.max(0, maxHours - totalHours),
        availableCapacity,
      }
    })

    const results = rangeResults.filter(r => {
      // Capacity filter: resource must have at least this % available
      if (capacity > 0 && r.availableCapacity < capacity) return false
      // Location filter
      if (availLocation !== 'any' && r.location !== availLocation) return false
      // Sub-team function / service line filter
      if (availSubTeamFn !== 'any' && r.subServiceLine !== availSubTeamFn) return false
      // Primary skill filter
      if (availPrimarySkill !== 'any' && r.primarySkill !== availPrimarySkill && !r.skills.includes(availPrimarySkill)) return false
      // Secondary skill filter
      if (availSecondarySkill !== 'any' && !r.skills.includes(availSecondarySkill)) return false
      return true
    }).sort((a, b) => b.availableCapacity - a.availableCapacity)

    // Apply results as a filter on the main resource table
    const matchIds = new Set(results.map(r => r.id))
    setAvailFilterIds(matchIds)
    setAvailFilterActive(true)
    setAvailResults(results)
    setAvailSearched(true)

    // Navigate the grid to the filter's start date
    if (hasLiveData && allWeeks.length > 0) {
      // Find the Monday of or before the start date
      const fromDate = new Date(dateFrom + 'T00:00:00')
      const dayOfWeek = fromDate.getDay()
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(fromDate)
      monday.setDate(fromDate.getDate() + daysToMonday)
      const mondayISO = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

      if (timeRange === 'Monthly') {
        // Set monthOffset so the displayed month contains the start date
        const now = new Date()
        const targetMonth = fromDate.getMonth() + (fromDate.getFullYear() - now.getFullYear()) * 12
        const currentMonth = now.getMonth()
        setMonthOffset(targetMonth - currentMonth)
      } else {
        // Find closest week index and set dateOffset
        let bestIdx = 0
        for (let i = 0; i < allWeeks.length; i++) {
          if (allWeeks[i] <= mondayISO) bestIdx = i
          else break
        }
        setDateOffset(bestIdx)
      }
    }

    // Close modal and show filtered table
    setShowAvailability(false)
    addToast(`Showing ${results.length} available resource${results.length !== 1 ? 's' : ''} matching criteria`, 'info')
  }

  const handleClearAvailFilter = () => {
    setAvailFilterActive(false)
    setAvailFilterIds(new Set())
    setAvailResults([])
    setAvailSearched(false)
  }

  // Show full-screen loader while initial data is loading
  if (liveLoading && !hasLiveData) {
    return (
      <FullScreenLoader>
        <Spinner />
        <LoadingText>Loading resource data…</LoadingText>
      </FullScreenLoader>
    )
  }

  return (
    <PageContainer>
      {/* Header */}
      <Header>
        <Brand>
          <Logo>RM</Logo>
          <BrandText>
            <h1>Resource Manager</h1>
            <p>{perspective === 'resource' ? 'Resource-wise' : 'Project-wise'} allocation overview</p>
          </BrandText>
        </Brand>
        <HeaderRight>
          <SearchBox>
            <Search />
            <input
              placeholder="Search resources..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </SearchBox>
          <FindBtn onClick={() => setImportOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload size={15} /> Import
          </FindBtn>
          <RoleGuard permission="canExport">
            <FindBtn onClick={handleExportResources} disabled={exportingResources} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={15} /> {exportingResources ? 'Exporting…' : 'Export'}
            </FindBtn>
          </RoleGuard>
          {hasLiveData && (
            <FindBtn onClick={() => { refreshLive(); addToast('Refreshing live data…', 'info') }} style={{ display: 'flex', alignItems: 'center', gap: 6 }} disabled={liveLoading}>
              <RefreshCw size={15} style={liveLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
              {liveLoading ? 'Loading…' : 'Refresh'}
            </FindBtn>
          )}
          <RoleGuard permission="canCheckAvailability">
            <FindBtn onClick={handleFindAvailability}>Find Availability</FindBtn>
          </RoleGuard>
        </HeaderRight>
      </Header>

      {/* KPI Stats — only meaningful in resource view */}
      {perspective === 'resource' && (
        <StatsRow>
          <Stat>
            <StatLabel>Available Hours</StatLabel>
            <StatValue $color="var(--color-primary)">{kpiAvailHours.toLocaleString()}h</StatValue>
          </Stat>
          <Stat>
            <StatLabel>Avg Utilization (Visible Period)</StatLabel>
            <StatValue $color="var(--color-success)">{kpiUtil}%</StatValue>
          </Stat>
          <Stat>
            <StatLabel>Client-Facing Resources</StatLabel>
            <StatValue>• {kpiClientFacing}</StatValue>
          </Stat>
        </StatsRow>
      )}

      {/* Structural Filters — row 1: Service Line → Grade */}
      <FilterDropdownRow>
        <FilterLabel>Service Line</FilterLabel>
        <MultiSelect options={activeSSLs} values={subServiceLineFilter} onChange={setSubServiceLineFilter} placeholder="All Service Lines" />
        <FilterLabel>Sub-Service Line</FilterLabel>
        <MultiSelect options={filteredActiveRoles} values={roleFilter} onChange={setRoleFilter} placeholder="All Sub-SLs" />
        <FilterLabel>Region</FilterLabel>
        <MultiSelect options={activeRegions} values={regionFilter} onChange={setRegionFilter} placeholder="All Regions" />
        <FilterLabel><MapPin size={12} /> Location</FilterLabel>
        <MultiSelect options={filteredActiveLocations} values={locationFilter} onChange={setLocationFilter} placeholder="All Locations" />
        <FilterLabel>Grade</FilterLabel>
        <MultiSelect options={activeGrades} values={gradeFilter} onChange={setGradeFilter} placeholder="All Grades" />
        <FilterLabel>Status</FilterLabel>
        <MultiSelect options={activeStatuses} values={statusFilter} onChange={setStatusFilter} placeholder="All Statuses" />
      </FilterDropdownRow>

      {/* Structural Filters — row 2: Project + Availability */}
      <FilterDropdownRow>
        <FilterLabel>Project</FilterLabel>
        <MultiSelect
          options={activeProjects.map(p => p.id)}
          values={projectFilter}
          onChange={setProjectFilter}
          placeholder="All Projects"
        />
        <FilterLabel><UserCheck size={12} /> Availability</FilterLabel>
        <FilterSelect value={availFilter} onChange={e => setAvailFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="available">Available (&lt;80%)</option>
          <option value="full">Fully Loaded (≥80%)</option>
        </FilterSelect>
      </FilterDropdownRow>

      {/* Active availability filter banner */}
      {availFilterActive && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--color-primary-light)',
          border: '1.5px solid var(--color-primary)',
          borderRadius: 'var(--border-radius)',
          fontSize: 13,
          color: 'var(--color-primary)',
          fontWeight: 600,
        }}>
          <span>
            🔍 Availability filter active — showing {availFilterIds.size} matching resource{availFilterIds.size !== 1 ? 's' : ''}
          </span>
          <button onClick={handleClearAvailFilter} style={{
            padding: '4px 12px',
            borderRadius: 'var(--border-radius)',
            border: '1px solid var(--color-primary)',
            background: '#fff',
            color: 'var(--color-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}>
            Clear Filter
          </button>
        </div>
      )}

      {/* Controls */}
      <ControlsRow>
        <LeftControls>
          <PerspectiveToggle>
            <PerspectiveBtn $active={perspective === 'resource'} onClick={() => setPerspective('resource')}>
              👤 Resource
            </PerspectiveBtn>
            <PerspectiveBtn $active={perspective === 'project'} onClick={() => setPerspective('project')}>
              📁 Project
            </PerspectiveBtn>
          </PerspectiveToggle>

          {/* Category pills only apply in resource view */}
          {perspective === 'resource' && (
            <FilterPills>
              {CATEGORY_FILTERS.map(f => (
                <Pill
                  key={f.key}
                  $active={activeFilter.has(f.key)}
                  $color={f.color}
                  onClick={() => {
                    setActiveFilter(prev => {
                      const next = new Set(prev)
                      if (f.key === 'all') {
                        // Clicking "All" resets to only "all"
                        return new Set(['all'])
                      }
                      // Toggle the specific filter
                      next.delete('all')
                      if (next.has(f.key)) {
                        next.delete(f.key)
                        // If nothing selected, revert to "all"
                        if (next.size === 0) return new Set(['all'])
                      } else {
                        next.add(f.key)
                      }
                      return next
                    })
                  }}
                >
                  {f.key !== 'all' && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: f.color, marginRight: 5 }} />}
                  {f.label}
                </Pill>
              ))}
            </FilterPills>
          )}
        </LeftControls>

        <RightControls>
          <TimeToggle>
            {(['Weekly', 'Bi-Weekly', 'Monthly'] as const).map(t => (
              <TimeBtn key={t} $active={timeRange === t} onClick={() => {
                // Capture first visible week so the new view stays on the same date
                anchorWeekRef.current = visibleWeekKeys?.[0] ?? null
                setTimeRange(t)
                addToast(`Switched to ${t} view`, 'info')
              }}>
                {t}
              </TimeBtn>
            ))}
          </TimeToggle>

          <DateNav>
            <NavBtn
              onClick={() => {
                if (timeRange === 'Monthly') {
                  setMonthOffset(o => o - 1)
                } else {
                  setDateOffset(o => o - navStep)
                }
              }}
              title={`Previous ${timeRange === 'Monthly' ? 'month' : timeRange === 'Bi-Weekly' ? 'fortnight' : 'week'}`}
              disabled={false}
            >
              <ChevronLeft size={16} />
            </NavBtn>
            <DateLabel>{dateRangeLabel}</DateLabel>
            <NavBtn
              onClick={() => {
                if (timeRange === 'Monthly') {
                  setMonthOffset(o => o + 1)
                } else {
                  setDateOffset(o => o + navStep)
                }
              }}
              title={`Next ${timeRange === 'Monthly' ? 'month' : timeRange === 'Bi-Weekly' ? 'fortnight' : 'week'}`}
              disabled={false}
            >
              <ChevronRight size={16} />
            </NavBtn>
            <GoToDateWrap title="Go to date">
              <NavBtn as="div">
                <Calendar size={14} />
              </NavBtn>
              <input
                ref={dateInputRef}
                type="date"
                onChange={(e) => handleGoToDate(e.target.value)}
                aria-label="Go to date"
              />
            </GoToDateWrap>
          </DateNav>
        </RightControls>
      </ControlsRow>

      {/* Allocation Grid / Loading Skeleton */}
      {liveLoading && !hasLiveData ? (
        <LoadingSkeleton>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i}>
              <SkeletonCell $w={180} />
              {Array.from({ length: 5 }).map((__, j) => <SkeletonCell key={j} $w={120} />)}
            </SkeletonRow>
          ))}
        </LoadingSkeleton>
      ) : (
        <>
          <AllocationGrid
            rows={pagedRows}
            dayColumns={dayColumns}
            perspective={perspective}
            onCellClick={handleCellClick}
            onRowClick={handleRowClick}
            onAddProjectClick={canEditBooking ? handleAddProject : undefined}
            notesByEmpCode={canViewEmployeeNotes && Object.keys(allEmpNotes).length > 0 ? allEmpNotes : undefined}
          />
          <PaginationRow>
            <PagInfo>
              {totalRows === 0
                ? 'No records'
                : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, totalRows)} of ${totalRows} ${perspective === 'resource' ? 'resources' : 'projects'}`
              }
            </PagInfo>
            <PagControls>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Rows per page:</span>
              <PagSelect
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value) as 50 | 100 | 200); setPage(1) }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </PagSelect>
              <PagBtn onClick={() => setPage(1)} disabled={safePage === 1} title="First page">«</PagBtn>
              <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} title="Previous page">‹</PagBtn>
              <PagBtn $active>
                {safePage} / {totalPages}
              </PagBtn>
              <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} title="Next page">›</PagBtn>
              <PagBtn onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} title="Last page">»</PagBtn>
            </PagControls>
          </PaginationRow>
        </>
      )}

      {/* Import Modal */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onComplete={handleImportComplete} />

      {/* Allocation Detail Modal */}
      <Modal
        open={!!selectedAlloc}
        onClose={() => { setSelectedAlloc(null); setAllocNotesDirty(false) }}
        title={selectedAlloc?.alloc.label ?? ''}
        subtitle={`${selectedAlloc?.row.name} • ${selectedAlloc?.dayKey ?? ''}`}
        size="sm"
      >
        {selectedAlloc && (() => {
          // Normalize the clicked dayKey to its Monday week-start. In the daily-
          // expanded Weekly view dayKey is e.g. a Tuesday — the underlying
          // forecast_allocations row is keyed by the Monday of that week, so
          // every API call below must send the Monday, never the clicked day.
          const dk = new Date(selectedAlloc.dayKey + 'T00:00:00')
          const dow = dk.getDay() // 0=Sun..6=Sat
          const mondayOffset = dow === 0 ? -6 : 1 - dow
          const monday = new Date(dk)
          monday.setDate(dk.getDate() + mondayOffset)
          const pad = (n: number) => String(n).padStart(2, '0')
          const weekStartIso = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`

          const weekStart = monday
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekStart.getDate() + 6)
          const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
          const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`
          const duration = `${fmt(weekStart)} – ${fmt(weekEnd)}`

          // Resolve the (empCode, projectName) pair regardless of perspective.
          // resource view: row.id = emp_code, alloc.label = project (or status word)
          // project view:  row.id = project_name, alloc.resourceId = emp_code
          const empCode = perspective === 'resource' ? selectedAlloc.row.id : (selectedAlloc.alloc.resourceId ?? '')
          const projectName = perspective === 'resource'
            ? (selectedAlloc.alloc.category === 'available' ? null : selectedAlloc.alloc.label)
            : selectedAlloc.row.id
          const isEmpty = selectedAlloc.alloc.category === 'available'
          const isProject = !isEmpty && projectName != null
          const currentStatus: 'proposed' | 'confirmed' =
            selectedAlloc.alloc.category === 'proposed' ? 'proposed' : 'confirmed'
          const projectOptions = liveData?.projectRows.map(p => p.name) ?? []

          const refreshAfter = async (msg: string) => {
            try { addToast(msg, 'success') } catch {}
            setAllocAction(null)
            setSelectedAlloc(null)
            try { refreshLive() } catch {}
          }
          const onError = (e: unknown) => {
            const m = e instanceof Error ? e.message : 'Action failed'
            try { addToast(m, 'error') } catch {}
          }

          const doSave = async () => {
            if (!isProject) return
            setAllocBusy(true)
            try {
              await allocationsApi.update({
                empCode, projectName, weekStart: weekStartIso,
                patch: {
                  allocationPct: Number(allocForm.pct),
                  allocationStatus: allocForm.status,
                },
              })
              await refreshAfter('Allocation updated')
            } catch (e) { onError(e) } finally { setAllocBusy(false) }
          }
          const doExtend = async () => {
            if (!isProject) return
            const n = Number(allocForm.weeks)
            if (!Number.isFinite(n) || n <= 0) return
            setAllocBusy(true)
            try {
              await allocationsApi.extend({
                empCode, projectName, fromWeekStart: weekStartIso, byWeeks: n,
              })
              await refreshAfter(`Extended by ${n} week${n === 1 ? '' : 's'}`)
            } catch (e) { onError(e) } finally { setAllocBusy(false) }
          }
          const doDelete = async () => {
            if (!isProject) return
            const from = allocForm.startDate || weekStartIso
            const to = allocForm.endDate || weekStartIso
            // Convert any dates to their Monday week-starts (deduped)
            const weeks = [...new Set(dailyDatesBetween(from, to).map(d => toMondayISO(d)))]
            if (weeks.length === 0) return
            setAllocBusy(true)
            try {
              await allocationsApi.remove({ empCode, projectName, weekStarts: weeks })
              await refreshAfter(`Deleted ${weeks.length} week${weeks.length !== 1 ? 's' : ''}`)
              setAllocAction(null)
            } catch (e) { onError(e) } finally { setAllocBusy(false) }
          }
          const doToggleStatus = async () => {
            if (!isProject) return
            const next = currentStatus === 'confirmed' ? 'proposed' : 'confirmed'
            setAllocBusy(true)
            try {
              await allocationsApi.setStatus({
                empCode, projectName, weekStart: weekStartIso, status: next,
              })
              await refreshAfter(`Status → ${next}`)
            } catch (e) { onError(e) } finally { setAllocBusy(false) }
          }
          const doAssign = async () => {
            const projName = allocForm.project.trim()
            if (!projName) return
            const isNew = !projectOptions.includes(projName)
            const empMeta = hasLiveData ? liveData!.employeeMeta.get(empCode) : undefined
            const serviceLineHint = empMeta?.subServiceLine || empMeta?.role || ''
            const weeks = weekStartsBetween(
              allocForm.startDate || weekStartIso,
              allocForm.endDate   || weekStartIso,
            )
            setAllocBusy(true)
            try {
              await allocationsApi.create({
                empCode, projectName: projName,
                weekStarts: weeks,
                allocationPct: Number(allocForm.pct),
                allocationStatus: allocForm.status,
                autoCreateProject: isNew,
                serviceLineHint,
              })
              await refreshAfter(`Assigned ${projName}${weeks.length > 1 ? ` for ${weeks.length} weeks` : ''}${isNew ? ' (new project created)' : ''}`)
            } catch (e) { onError(e) } finally { setAllocBusy(false) }
          }

          return (
            <Section>
              <SectionTitle>Allocation Details</SectionTitle>
              <DetailGrid>
                <DetailItem>
                  <label>{perspective === 'resource' ? 'Resource' : 'Project'}</label>
                  <span>{selectedAlloc.row.name}</span>
                </DetailItem>
                <DetailItem>
                  <label>Category</label>
                  <span><CatBadge $cat={selectedAlloc.alloc.category}>{selectedAlloc.alloc.category}</CatBadge></span>
                </DetailItem>
                {selectedAlloc.alloc.hours && (
                  <DetailItem>
                    <label>Hours</label>
                    <span>{selectedAlloc.alloc.hours}h</span>
                  </DetailItem>
                )}
                {selectedAlloc.alloc.allocPct != null && (
                  <DetailItem>
                    <label>Load</label>
                    <span>{Math.round(selectedAlloc.alloc.allocPct)}%</span>
                  </DetailItem>
                )}
                <DetailItem>
                  <label>Duration</label>
                  <span>{duration}</span>
                </DetailItem>
                {selectedAlloc.alloc.emEp && (
                  <DetailItem>
                    <label>EM / EP</label>
                    <span>{selectedAlloc.alloc.emEp}</span>
                  </DetailItem>
                )}
              </DetailGrid>

              {/* Per-allocation note */}
              {isProject && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Note</div>
                  {canEditBooking ? (
                    <>
                      <NoteTextarea
                        placeholder="Add a note for this allocation…"
                        value={allocNote}
                        onChange={e => { setAllocNote(e.target.value); setAllocNotesDirty(true) }}
                        style={{ width: '100%', boxSizing: 'border-box', minHeight: 56, fontSize: 12 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: allocNotesDirty ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
                          {allocNotesBusy ? 'Saving…' : allocNotesDirty ? 'Unsaved changes' : 'Saved'}
                        </span>
                        <button
                          disabled={allocNotesBusy || !allocNotesDirty}
                          onClick={async () => {
                            if (!empCode || !projectName) return
                            setAllocNotesBusy(true)
                            try {
                              await allocationsApi.update({
                                empCode, projectName, weekStart: weekStartIso,
                                patch: { rawText: allocNoteRef.current || null },
                              })
                              setAllocNotesDirty(false)
                            } catch (e) {
                              onError(e)
                            } finally { setAllocNotesBusy(false) }
                          }}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 4,
                            background: allocNotesDirty ? 'var(--color-primary)' : 'var(--color-border)',
                            color: allocNotesDirty ? '#fff' : 'var(--color-text-muted)',
                            cursor: allocNotesDirty ? 'pointer' : 'default', border: 'none',
                          }}
                        >
                          {allocNotesBusy ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </>
                  ) : (
                    allocNote
                      ? <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0 }}>{allocNote}</p>
                      : <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, fontStyle: 'italic' }}>No note</p>
                  )}
                </div>
              )}

              {canEditBooking && empCode && (
                <>
                  <InlineActionRow>
                    {isProject && (
                      <>
                        <InlineActionBtn onClick={() => setAllocAction(allocAction === 'edit' ? null : 'edit')} disabled={allocBusy}>
                          <Pencil size={12} /> Edit
                        </InlineActionBtn>
                        <InlineActionBtn onClick={() => setAllocAction(allocAction === 'extend' ? null : 'extend')} disabled={allocBusy}>
                          <Calendar size={12} /> Extend
                        </InlineActionBtn>
                        <InlineActionBtn onClick={doToggleStatus} disabled={allocBusy} $primary>
                          <UserCheck size={12} /> Mark {currentStatus === 'confirmed' ? 'Proposed' : 'Confirmed'}
                        </InlineActionBtn>
                        <InlineActionBtn
                          onClick={() => {
                            setAllocForm(f => ({ ...f, startDate: weekStartIso, endDate: weekStartIso }))
                            setAllocAction(allocAction === 'delete' ? null : 'delete')
                          }}
                          disabled={allocBusy} $danger
                        >
                          <X size={12} /> Delete
                        </InlineActionBtn>
                      </>
                    )}
                    <InlineActionBtn onClick={() => setAllocAction(allocAction === 'assign' ? null : 'assign')} disabled={allocBusy} $primary>
                      <UserPlus size={12} /> {isEmpty ? 'Assign Project' : 'Add Another Project'}
                    </InlineActionBtn>
                  </InlineActionRow>

                  {allocAction === 'edit' && isProject && (
                    <InlineForm>
                      <InlineFormLabel>
                        Load %
                        <InlineInput
                          type="number" min={0}
                          value={allocForm.pct}
                          onChange={e => setAllocForm(f => ({ ...f, pct: e.target.value }))}
                        />
                      </InlineFormLabel>
                      <InlineFormLabel>
                        Status
                        <InlineSelect
                          value={allocForm.status}
                          onChange={e => setAllocForm(f => ({ ...f, status: e.target.value }))}
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="proposed">Proposed</option>
                          <option value="unconfirmed">Unconfirmed</option>
                        </InlineSelect>
                      </InlineFormLabel>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <InlineActionBtn onClick={() => setAllocAction(null)} disabled={allocBusy}>Cancel</InlineActionBtn>
                        <InlineActionBtn onClick={doSave} disabled={allocBusy} $primary>Save</InlineActionBtn>
                      </div>
                    </InlineForm>
                  )}

                  {allocAction === 'extend' && isProject && (
                    <InlineForm>
                      <InlineFormLabel>
                        Extend by (weeks)
                        <InlineInput
                          type="number" min={1} max={52}
                          value={allocForm.weeks}
                          onChange={e => setAllocForm(f => ({ ...f, weeks: e.target.value }))}
                        />
                      </InlineFormLabel>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <InlineActionBtn onClick={() => setAllocAction(null)} disabled={allocBusy}>Cancel</InlineActionBtn>
                        <InlineActionBtn onClick={doExtend} disabled={allocBusy} $primary>Extend</InlineActionBtn>
                      </div>
                    </InlineForm>
                  )}

                  {allocAction === 'delete' && isProject && (() => {
                    const from = allocForm.startDate || weekStartIso
                    const to = allocForm.endDate || weekStartIso
                    const weeks = [...new Set(dailyDatesBetween(from, to).map(d => toMondayISO(d)))]
                    return (
                      <InlineForm style={{ gridTemplateColumns: '1fr 1fr', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8 }}>
                        <InlineFormLabel>
                          From date
                          <InlineInput
                            type="date"
                            value={from}
                            onChange={e => setAllocForm(f => ({ ...f, startDate: e.target.value }))}
                          />
                        </InlineFormLabel>
                        <InlineFormLabel>
                          To date
                          <InlineInput
                            type="date"
                            value={to}
                            onChange={e => setAllocForm(f => ({ ...f, endDate: e.target.value }))}
                          />
                        </InlineFormLabel>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>
                            {weeks.length === 0
                              ? 'Select a date range'
                              : `${weeks.length} week${weeks.length !== 1 ? 's' : ''} will be removed (allocations are stored per week)`}
                          </span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <InlineActionBtn onClick={() => setAllocAction(null)} disabled={allocBusy}>Cancel</InlineActionBtn>
                            <InlineActionBtn onClick={doDelete} disabled={allocBusy || weeks.length === 0} $danger>Confirm Delete</InlineActionBtn>
                          </div>
                        </div>
                      </InlineForm>
                    )
                  })()}

                  {allocAction === 'assign' && (() => {
                    const isNewProj = !!allocForm.project.trim() && !projectOptions.includes(allocForm.project.trim())
                    const empMeta = hasLiveData ? liveData!.employeeMeta.get(empCode) : undefined
                    const svcLineHint = empMeta?.subServiceLine || empMeta?.role || ''
                    return (
                      <InlineForm style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <InlineFormLabel style={{ gridColumn: '1 / -1' }}>
                          Project
                          <InlineInput
                            list="alloc-project-options"
                            placeholder="Project name…"
                            value={allocForm.project}
                            onChange={async e => {
                              const val = e.target.value
                              setAllocForm(f => ({ ...f, project: val }))
                              const isNew = !!val.trim() && !projectOptions.includes(val.trim())
                              if (isNew && val.trim().length >= 2) {
                                try {
                                  const { code } = await projectsApi.codePreview(svcLineHint)
                                  setAllocCodeHint(code)
                                } catch { setAllocCodeHint(null) }
                              } else { setAllocCodeHint(null) }
                            }}
                          />
                          <datalist id="alloc-project-options">
                            {projectOptions.map(p => <option key={p} value={p} />)}
                          </datalist>
                          {isNewProj && allocCodeHint && (
                            <span style={{ fontSize: 11, color: 'var(--color-primary)', marginTop: 3, display: 'block' }}>
                              New project — code: <strong>{allocCodeHint}</strong>
                            </span>
                          )}
                          {isNewProj && !allocCodeHint && (
                            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, display: 'block' }}>
                              New project — code will be auto-generated
                            </span>
                          )}
                        </InlineFormLabel>
                        <InlineFormLabel>
                          Start Date
                          <InlineInput
                            type="date"
                            value={allocForm.startDate}
                            onChange={e => setAllocForm(f => ({ ...f, startDate: e.target.value }))}
                          />
                        </InlineFormLabel>
                        <InlineFormLabel>
                          End Date
                          <InlineInput
                            type="date"
                            value={allocForm.endDate}
                            min={allocForm.startDate}
                            onChange={e => setAllocForm(f => ({ ...f, endDate: e.target.value }))}
                          />
                        </InlineFormLabel>
                        <InlineFormLabel>
                          Load %
                          <InlineInput
                            type="number" min={0}
                            value={allocForm.pct}
                            onChange={e => setAllocForm(f => ({ ...f, pct: e.target.value }))}
                          />
                        </InlineFormLabel>
                        <InlineFormLabel>
                          Status
                          <InlineSelect
                            value={allocForm.status}
                            onChange={e => setAllocForm(f => ({ ...f, status: e.target.value }))}
                          >
                            <option value="confirmed">Confirmed</option>
                            <option value="proposed">Proposed</option>
                          </InlineSelect>
                        </InlineFormLabel>
                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <InlineActionBtn onClick={() => setAllocAction(null)} disabled={allocBusy}>Cancel</InlineActionBtn>
                          <InlineActionBtn onClick={doAssign} disabled={allocBusy || !allocForm.project.trim()} $primary>Assign</InlineActionBtn>
                        </div>
                      </InlineForm>
                    )
                  })()}
                </>
              )}
            </Section>
          )
        })()}
      </Modal>

      {/* Resource Detail Right-Side Panel — opens from resource row click OR employee block click in project view */}
      <DetailPanelOverlay $open={!!resourcePanelRow} onClick={() => { setResourcePanelRow(null); setEditingNote(null); setPanelAllocAction(null); setPanelAddProjectOpen(false); setEmpNotesLoadedFor(null); setEmpNotesDirty(false) }} />
      <DetailPanel $open={!!resourcePanelRow}>
        {resourcePanelRow && (() => {
          const resInfo = (hasLiveData ? liveData!.employeeMeta.get(resourcePanelRow.id) : mockResources.find(r => r.id === resourcePanelRow.id)) as any
          const toMondayISO = (dayKey: string): string => {
            const dt = new Date(dayKey + 'T00:00:00')
            const dow = dt.getDay()
            const offset = dow === 0 ? -6 : 1 - dow
            dt.setDate(dt.getDate() + offset)
            const y = dt.getFullYear(), mo = String(dt.getMonth() + 1).padStart(2, '0'), dd = String(dt.getDate()).padStart(2, '0')
            return `${y}-${mo}-${dd}`
          }
          const projectMap = new Map<string, { label: string; category: AllocationCategory; hours: number; color: string; daySet: Set<string>; weekStartSet: Set<string>; allocPct: number; allocStatus: string; dbNote: string | undefined }>()
          for (const [dayKey, dayAllocs] of Object.entries(resourcePanelRow.days)) {
            const weekStart = toMondayISO(dayKey)
            for (const alloc of dayAllocs) {
              if (alloc.category === 'available') continue
              const existing = projectMap.get(alloc.label)
              if (existing) { existing.daySet.add(dayKey); existing.weekStartSet.add(weekStart); existing.hours += alloc.hours || 0 }
              else {
                const cc = alloc.category === 'client' ? '#0070C0' : alloc.category === 'training' ? '#8b5cf6' : alloc.category === 'leaves' ? '#FF33CC' : alloc.category === 'proposed' ? '#9ca3af' : '#3b82f6'
                projectMap.set(alloc.label, { label: alloc.label, category: alloc.category, hours: alloc.hours || 0, color: cc, daySet: new Set([dayKey]), weekStartSet: new Set([weekStart]), allocPct: alloc.allocPct ?? 100, allocStatus: alloc.category === 'proposed' ? 'proposed' : 'confirmed', dbNote: alloc.note })
              }
            }
          }
          const projectCards = Array.from(projectMap.values())
          const totalWeekHours = dayColumns.length * 8
          const CAT_LABELS: Record<string, string> = { client: 'Client-Facing', internal: 'Internal Work', training: 'Training (L&D)', leaves: 'Leave', available: 'Available', proposed: 'Proposed' }
          return (
            <>
              <PanelHeader>
                <PanelCloseBtn onClick={() => { setResourcePanelRow(null); setEditingNote(null); setPanelAllocAction(null); setPanelAddProjectOpen(false); setEmpNotesLoadedFor(null); setEmpNotesDirty(false) }}>
                  <X size={18} />
                </PanelCloseBtn>
                <PanelTitle>{resourcePanelRow.name}</PanelTitle>
                <PanelSubtitle>{resInfo?.subServiceLine ? `${resourcePanelRow.subtitle} · ${resInfo.subServiceLine}` : resourcePanelRow.subtitle}</PanelSubtitle>
              </PanelHeader>
              <PanelBody>
                <ResourceDetailStats>
                  <ResourceDetailStat>
                    <label>UTILIZATION</label>
                    <ResourceDetailStatValue $color={(resourcePanelRow.utilization || 0) >= 80 ? 'var(--color-success)' : 'var(--color-warning)'}>{resourcePanelRow.utilization || 0}%</ResourceDetailStatValue>
                  </ResourceDetailStat>
                  {resInfo?.location && (
                    <ResourceDetailStat>
                      <label>LOCATION</label>
                      <ResourceDetailStatValue $color="var(--color-success)">{resInfo.location}</ResourceDetailStatValue>
                    </ResourceDetailStat>
                  )}
                  {resInfo?.employeeStatus && (
                    <ResourceDetailStat>
                      <label>STATUS</label>
                      <ResourceDetailStatValue $color={
                        resInfo.employeeStatus === 'Active' ? 'var(--color-success)' :
                        resInfo.employeeStatus === 'Serving notice period' ? 'var(--color-warning)' :
                        resInfo.employeeStatus === 'Contract' ? 'var(--color-primary)' :
                        'var(--color-text-secondary)'
                      }>{resInfo.employeeStatus}</ResourceDetailStatValue>
                    </ResourceDetailStat>
                  )}
                </ResourceDetailStats>
                {(resInfo?.primarySkill || resInfo?.skills?.length > 0) && (
                  <PanelSection>
                    <PanelSectionTitle>Skills</PanelSectionTitle>
                    <SkillsRow>
                      {resInfo?.primarySkill && (
                        <SkillPill key="primary" style={{ background: 'var(--color-primary-light)', border: '1.5px solid var(--color-primary)', color: 'var(--color-primary)', fontWeight: 700 }}>
                          {resInfo.primarySkill}
                        </SkillPill>
                      )}
                      {resInfo?.skills?.map((s: string) => <SkillPill key={s}>{s}</SkillPill>)}
                    </SkillsRow>
                  </PanelSection>
                )}

                {/* Confidential employee notes — admin / rm / slh only */}
                {canViewEmployeeNotes && (() => {
                  const empCode = resourcePanelRow.id
                  const currentNote = empNotesMap[empCode] ?? ''
                  const saveNote = async () => {
                    if (!canEditBooking) return
                    setEmpNotesBusy(true)
                    try {
                      // Read from ref to always get the freshest value regardless of closure age
                      const saved = empNotesMapRef.current[empCode] ?? ''
                      await employeeNotesApi.put(empCode, saved)
                      setAllEmpNotes(prev => saved ? { ...prev, [empCode]: saved } : prev)
                      setEmpNotesDirty(false)
                    } catch (e) {
                      addToast(e instanceof Error ? e.message : 'Failed to save note', 'error')
                    } finally { setEmpNotesBusy(false) }
                  }
                  return (
                    <PanelSection>
                      <PanelSectionTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        Staff Notes
                        <ConfidentialBadge>Confidential</ConfidentialBadge>
                      </PanelSectionTitle>
                      <EmpNoteBox>
                        <textarea
                          placeholder="Add confidential notes about this employee…"
                          value={currentNote}
                          onChange={e => {
                            setEmpNotesMap(prev => ({ ...prev, [empCode]: e.target.value }))
                            setEmpNotesDirty(true)
                          }}
                          readOnly={!canEditBooking}
                        />
                        <EmpNoteFooter>
                          <span style={{ color: empNotesDirty ? 'var(--color-warning)' : undefined }}>
                            {empNotesBusy ? 'Saving…' : empNotesDirty ? 'Unsaved changes' : currentNote ? 'Saved' : 'Not visible to the employee'}
                          </span>
                          {canEditBooking && (
                            <button
                              onClick={saveNote}
                              disabled={empNotesBusy || !empNotesDirty}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 10px',
                                borderRadius: 4, background: empNotesDirty ? 'var(--color-primary)' : 'var(--color-border)',
                                color: empNotesDirty ? '#fff' : 'var(--color-text-muted)',
                                cursor: empNotesDirty ? 'pointer' : 'default', border: 'none',
                              }}
                            >
                              {empNotesBusy ? 'Saving…' : 'Save'}
                            </button>
                          )}
                          {!canEditBooking && <span>Read-only</span>}
                        </EmpNoteFooter>
                      </EmpNoteBox>
                    </PanelSection>
                  )
                })()}
                {canEditBooking && (
                  <PanelSection>
                    <PanelSectionTitle>Actions</PanelSectionTitle>
                    <AssignBtn onClick={() => {
                      setAssignResourceName(resourcePanelRow.name)
                      setAssignModalOpen(true)
                    }}>
                      <UserPlus size={15} /> Assign to Request
                    </AssignBtn>
                    <AssignBtn
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        setPanelAddProjectOpen(o => !o)
                        const firstWeek = visibleWeekKeys?.[0] ?? ''
                        if (firstWeek) {
                          const mon = new Date(firstWeek + 'T00:00:00')
                          const fri = new Date(mon); fri.setDate(mon.getDate() + 4)
                          const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                          setPanelAddProjectForm(f => ({ ...f, startDate: fmt(mon), endDate: fmt(fri) }))
                        }
                        setPanelAddProjectCodeHint(null)
                      }}
                    >
                      <Plus size={15} /> Add Project Allocation
                    </AssignBtn>
                    {panelAddProjectOpen && (() => {
                      const projectOptions = liveData?.projectRows.map(p => p.name) ?? []
                      const isNewProject = !!panelAddProjectForm.project.trim() && !projectOptions.includes(panelAddProjectForm.project.trim())
                      const empServiceLine = resInfo?.subServiceLine || resInfo?.role || ''
                      return (
                        <InlineForm style={{ marginTop: 10, gridTemplateColumns: '1fr 1fr' }}>
                          <InlineFormLabel style={{ gridColumn: '1 / -1' }}>
                            Project
                            <InlineInput
                              list="panel-add-project-list"
                              placeholder="Type or select project…"
                              value={panelAddProjectForm.project}
                              onChange={async e => {
                                const val = e.target.value
                                setPanelAddProjectForm(f => ({ ...f, project: val }))
                                const isNew = !!val.trim() && !projectOptions.includes(val.trim())
                                if (isNew && val.trim().length >= 2) {
                                  try {
                                    const { code } = await projectsApi.codePreview(empServiceLine)
                                    setPanelAddProjectCodeHint(code)
                                  } catch { setPanelAddProjectCodeHint(null) }
                                } else {
                                  setPanelAddProjectCodeHint(null)
                                }
                              }}
                            />
                            <datalist id="panel-add-project-list">
                              {projectOptions.map(p => <option key={p} value={p} />)}
                            </datalist>
                            {isNewProject && panelAddProjectCodeHint && (
                              <span style={{ fontSize: 11, color: 'var(--color-primary)', marginTop: 3, display: 'block' }}>
                                New project — will be created as <strong>{panelAddProjectCodeHint}</strong>
                              </span>
                            )}
                            {isNewProject && !panelAddProjectCodeHint && (
                              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, display: 'block' }}>
                                New project — code will be auto-generated
                              </span>
                            )}
                          </InlineFormLabel>
                          <InlineFormLabel>
                            Start Date
                            <InlineInput
                              type="date"
                              value={panelAddProjectForm.startDate}
                              onChange={e => setPanelAddProjectForm(f => ({ ...f, startDate: e.target.value }))}
                            />
                          </InlineFormLabel>
                          <InlineFormLabel>
                            End Date
                            <InlineInput
                              type="date"
                              value={panelAddProjectForm.endDate}
                              min={panelAddProjectForm.startDate}
                              onChange={e => setPanelAddProjectForm(f => ({ ...f, endDate: e.target.value }))}
                            />
                          </InlineFormLabel>
                          <InlineFormLabel>
                            Load %
                            <InlineInput
                              type="number" min={0}
                              value={panelAddProjectForm.pct}
                              onChange={e => setPanelAddProjectForm(f => ({ ...f, pct: e.target.value }))}
                            />
                          </InlineFormLabel>
                          <InlineFormLabel>
                            Status
                            <InlineSelect
                              value={panelAddProjectForm.status}
                              onChange={e => setPanelAddProjectForm(f => ({ ...f, status: e.target.value }))}
                            >
                              <option value="confirmed">Confirmed</option>
                              <option value="proposed">Proposed</option>
                            </InlineSelect>
                          </InlineFormLabel>
                          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <InlineActionBtn onClick={() => setPanelAddProjectOpen(false)} disabled={panelAddProjectBusy}>Cancel</InlineActionBtn>
                            <InlineActionBtn
                              $primary
                              disabled={panelAddProjectBusy || !panelAddProjectForm.project.trim() || !panelAddProjectForm.startDate}
                              onClick={async () => {
                                const projName = panelAddProjectForm.project.trim()
                                const weeks = weekStartsBetween(panelAddProjectForm.startDate, panelAddProjectForm.endDate || panelAddProjectForm.startDate)
                                setPanelAddProjectBusy(true)
                                try {
                                  await allocationsApi.create({
                                    empCode: resourcePanelRow.id,
                                    projectName: projName,
                                    weekStarts: weeks,
                                    allocationPct: Number(panelAddProjectForm.pct),
                                    allocationStatus: panelAddProjectForm.status,
                                    autoCreateProject: isNewProject,
                                    serviceLineHint: empServiceLine,
                                  })
                                  addToast(`Allocation created: ${projName}${weeks.length > 1 ? ` (${weeks.length} weeks)` : ''}`, 'success')
                                  setPanelAddProjectOpen(false)
                                  setPanelAddProjectForm({ project: '', pct: '100', status: 'confirmed', startDate: '', endDate: '' })
                                  setPanelAddProjectCodeHint(null)
                                  refreshLive()
                                } catch (e) {
                                  addToast(e instanceof Error ? e.message : 'Failed to create allocation', 'error')
                                } finally {
                                  setPanelAddProjectBusy(false)
                                }
                              }}
                            >
                              {panelAddProjectBusy ? 'Creating…' : 'Add Allocation'}
                            </InlineActionBtn>
                          </div>
                        </InlineForm>
                      )
                    })()}
                  </PanelSection>
                )}
                <PanelSection>
                  <PanelSectionTitle>This Period&apos;s Projects</PanelSectionTitle>
                  {projectCards.length === 0
                    ? <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No active allocations this period.</p>
                    : (() => {
                      const panelEmpCode = resourcePanelRow.id
                      const panelRefreshAfter = async (msg: string) => {
                        addToast(msg, 'success')
                        setPanelAllocAction(null)
                        try { refreshLive() } catch {}
                      }
                      const panelOnError = (e: unknown) => addToast(e instanceof Error ? e.message : 'Action failed', 'error')
                      const isEditableCategory = (cat: AllocationCategory) => cat === 'client' || cat === 'internal' || cat === 'training' || cat === 'proposed'
                      return (
                        <ProjectCardList>
                          {projectCards.map(pc => {
                            const pct = totalWeekHours > 0 ? Math.round((pc.hours / totalWeekHours) * 100) : 0
                            const noteKey = `${resourcePanelRow.id}-${pc.label}`
                            const isEditingNote = editingNote === noteKey
                            const sortedWeeks = [...pc.weekStartSet].sort()
                            const isPanelEdit = panelAllocAction?.projectLabel === pc.label && panelAllocAction.action === 'edit'
                            const isPanelExtend = panelAllocAction?.projectLabel === pc.label && panelAllocAction.action === 'extend'
                            const isPanelDelete = panelAllocAction?.projectLabel === pc.label && panelAllocAction.action === 'delete'
                            const canEdit = canEditBooking && isEditableCategory(pc.category)
                            return (
                              <div key={pc.label}>
                                <ProjectCardBand $color={pc.color}>
                                  <ProjectCardBandLeft>
                                    <ProjectCardName>{pc.label}</ProjectCardName>
                                    <ProjectCardDaysMeta>{pc.daySet.size} day{pc.daySet.size !== 1 ? 's' : ''} · {pct}% allocated</ProjectCardDaysMeta>
                                  </ProjectCardBandLeft>
                                  <ProjectCardCatBadge>{CAT_LABELS[pc.category] || pc.category}</ProjectCardCatBadge>
                                </ProjectCardBand>
                                {canEdit && (
                                  <InlineActionRow style={{ margin: '8px 12px 0' }}>
                                    <InlineActionBtn
                                      disabled={panelAllocBusy}
                                      onClick={() => {
                                        setPanelAllocAction(isPanelEdit ? null : { projectLabel: pc.label, action: 'edit' })
                                        setPanelAllocForm(f => ({ ...f, pct: String(Math.round(pc.allocPct)), status: pc.allocStatus }))
                                      }}
                                    >
                                      <Pencil size={11} /> Edit
                                    </InlineActionBtn>
                                    <InlineActionBtn
                                      disabled={panelAllocBusy}
                                      onClick={() => setPanelAllocAction(isPanelExtend ? null : { projectLabel: pc.label, action: 'extend' })}
                                    >
                                      <Calendar size={11} /> Extend
                                    </InlineActionBtn>
                                    <InlineActionBtn
                                      $primary disabled={panelAllocBusy}
                                      onClick={async () => {
                                        const next = pc.allocStatus === 'confirmed' ? 'proposed' : 'confirmed'
                                        setPanelAllocBusy(true)
                                        try {
                                          await allocationsApi.setStatus({ empCode: panelEmpCode, projectName: pc.label, weekStart: sortedWeeks[0], status: next, applyToAllWeeks: true })
                                          await panelRefreshAfter(`Status → ${next}`)
                                        } catch (e) { panelOnError(e) } finally { setPanelAllocBusy(false) }
                                      }}
                                    >
                                      <UserCheck size={11} /> Mark {pc.allocStatus === 'confirmed' ? 'Proposed' : 'Confirmed'}
                                    </InlineActionBtn>
                                    <InlineActionBtn
                                      $danger disabled={panelAllocBusy}
                                      onClick={() => setPanelAllocAction(isPanelDelete ? null : {
                                        projectLabel: pc.label,
                                        action: 'delete',
                                        deleteFrom: sortedWeeks[0],
                                        deleteTo: sortedWeeks.at(-1),
                                      })}
                                    >
                                      <X size={11} /> Delete
                                    </InlineActionBtn>
                                  </InlineActionRow>
                                )}
                                {isPanelEdit && (
                                  <InlineForm style={{ margin: '8px 12px' }}>
                                    <InlineFormLabel>
                                      Load %
                                      <InlineInput type="number" min={0} value={panelAllocForm.pct} onChange={e => setPanelAllocForm(f => ({ ...f, pct: e.target.value }))} />
                                    </InlineFormLabel>
                                    <InlineFormLabel>
                                      Status
                                      <InlineSelect value={panelAllocForm.status} onChange={e => setPanelAllocForm(f => ({ ...f, status: e.target.value }))}>
                                        <option value="confirmed">Confirmed</option>
                                        <option value="proposed">Proposed</option>
                                        <option value="unconfirmed">Unconfirmed</option>
                                      </InlineSelect>
                                    </InlineFormLabel>
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                      <InlineActionBtn onClick={() => setPanelAllocAction(null)} disabled={panelAllocBusy}>Cancel</InlineActionBtn>
                                      <InlineActionBtn $primary disabled={panelAllocBusy} onClick={async () => {
                                        setPanelAllocBusy(true)
                                        try {
                                          await Promise.all(sortedWeeks.map(ws => allocationsApi.update({ empCode: panelEmpCode, projectName: pc.label, weekStart: ws, patch: { allocationPct: Number(panelAllocForm.pct), allocationStatus: panelAllocForm.status } })))
                                          await panelRefreshAfter('Allocation updated')
                                        } catch (e) { panelOnError(e) } finally { setPanelAllocBusy(false) }
                                      }}>Save</InlineActionBtn>
                                    </div>
                                  </InlineForm>
                                )}
                                {isPanelExtend && (
                                  <InlineForm style={{ margin: '8px 12px' }}>
                                    <InlineFormLabel style={{ gridColumn: '1 / -1' }}>
                                      Extend by (weeks) — from {sortedWeeks.at(-1)}
                                      <InlineInput type="number" min={1} max={52} value={panelAllocForm.weeks} onChange={e => setPanelAllocForm(f => ({ ...f, weeks: e.target.value }))} />
                                    </InlineFormLabel>
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                      <InlineActionBtn onClick={() => setPanelAllocAction(null)} disabled={panelAllocBusy}>Cancel</InlineActionBtn>
                                      <InlineActionBtn $primary disabled={panelAllocBusy} onClick={async () => {
                                        const n = Number(panelAllocForm.weeks)
                                        if (!Number.isFinite(n) || n <= 0) return
                                        setPanelAllocBusy(true)
                                        try {
                                          await allocationsApi.extend({ empCode: panelEmpCode, projectName: pc.label, fromWeekStart: sortedWeeks.at(-1)!, byWeeks: n })
                                          await panelRefreshAfter(`Extended by ${n} week${n === 1 ? '' : 's'}`)
                                        } catch (e) { panelOnError(e) } finally { setPanelAllocBusy(false) }
                                      }}>Extend</InlineActionBtn>
                                    </div>
                                  </InlineForm>
                                )}
                                {isPanelDelete && (() => {
                                  const delFrom = panelAllocAction!.deleteFrom ?? sortedWeeks[0]
                                  const delTo = panelAllocAction!.deleteTo ?? sortedWeeks.at(-1) ?? sortedWeeks[0]
                                  const weeksToDelete = [...new Set(dailyDatesBetween(delFrom, delTo).map(d => toMondayISO(d)))]
                                  return (
                                    <InlineForm style={{ margin: '8px 12px', gridTemplateColumns: '1fr 1fr', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8 }}>
                                      <InlineFormLabel>
                                        From date
                                        <InlineInput
                                          type="date"
                                          value={delFrom}
                                          onChange={e => setPanelAllocAction(a => a ? { ...a, deleteFrom: e.target.value } : a)}
                                        />
                                      </InlineFormLabel>
                                      <InlineFormLabel>
                                        To date
                                        <InlineInput
                                          type="date"
                                          value={delTo}
                                          onChange={e => setPanelAllocAction(a => a ? { ...a, deleteTo: e.target.value } : a)}
                                        />
                                      </InlineFormLabel>
                                      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 11, color: 'var(--color-danger)' }}>
                                          {weeksToDelete.length === 0
                                            ? 'Select a date range'
                                            : `${weeksToDelete.length} week${weeksToDelete.length !== 1 ? 's' : ''} will be removed`}
                                        </span>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                          <InlineActionBtn onClick={() => setPanelAllocAction(null)} disabled={panelAllocBusy}>Cancel</InlineActionBtn>
                                          <InlineActionBtn $danger disabled={panelAllocBusy || weeksToDelete.length === 0} onClick={async () => {
                                            setPanelAllocBusy(true)
                                            try {
                                              await allocationsApi.remove({ empCode: panelEmpCode, projectName: pc.label, weekStarts: weeksToDelete })
                                              await panelRefreshAfter(`Deleted ${weeksToDelete.length} week${weeksToDelete.length !== 1 ? 's' : ''}`)
                                            } catch (e) { panelOnError(e) } finally { setPanelAllocBusy(false) }
                                          }}>Confirm Delete</InlineActionBtn>
                                        </div>
                                      </div>
                                    </InlineForm>
                                  )
                                })()}
                                {(() => {
                                  // Lazy-init: use DB value if not yet edited locally
                                  const currentNote = notes[noteKey] !== undefined ? notes[noteKey] : (pc.dbNote ?? '')
                                  const hasNote = !!currentNote
                                  return (
                                    <>
                                      <NoteRow>
                                        <span>Note ({hasNote ? 1 : 0})</span>
                                        <NoteEditBtn onClick={() => {
                                          if (!isEditingNote) setNotes(prev => ({ ...prev, [noteKey]: currentNote }))
                                          setEditingNote(isEditingNote ? null : noteKey)
                                        }}>
                                          <Pencil size={13} />
                                        </NoteEditBtn>
                                      </NoteRow>
                                      {isEditingNote && (
                                        <NoteTextarea
                                          placeholder="Add a note..."
                                          value={notes[noteKey] ?? ''}
                                          onChange={e => setNotes(prev => ({ ...prev, [noteKey]: e.target.value }))}
                                          onBlur={async () => {
                                            const noteVal = notes[noteKey] ?? ''
                                            try {
                                              await Promise.all(sortedWeeks.map(ws =>
                                                allocationsApi.update({
                                                  empCode: panelEmpCode,
                                                  projectName: pc.label,
                                                  weekStart: ws,
                                                  patch: { rawText: noteVal || null },
                                                })
                                              ))
                                            } catch { /* non-critical */ }
                                          }}
                                          autoFocus
                                        />
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                            )
                          })}
                        </ProjectCardList>
                      )
                    })()
                  }
                </PanelSection>
              </PanelBody>
            </>
          )
        })()}
      </DetailPanel>

      {/* Project Row Detail Modal */}
      <Modal
        open={!!selectedRow && perspective === 'project'}
        onClose={() => { setSelectedRow(null) }}
        title={selectedRow?.name ?? ''}
        subtitle={selectedRow?.subtitle}
        size="md"
      >
        {selectedRow && perspective === 'project' && (() => {
          // Aggregate all allocations across all day columns → group by department
          type EmpEntry = { empCode: string; name: string; grade: string; department: string; hours: number; emEp: string }
          const empTotals = new Map<string, EmpEntry>()
          for (const dayAllocs of Object.values(selectedRow.days)) {
            for (const a of dayAllocs) {
              if (!a.resourceId) continue
              const existing = empTotals.get(a.resourceId)
              if (existing) {
                existing.hours += a.hours ?? 0
                if (!existing.emEp && a.emEp) existing.emEp = a.emEp
              } else {
                const meta = hasLiveData ? liveData!.employeeMeta.get(a.resourceId) : undefined
                // Full name comes from the resource rows; fall back to emp_code
                const fullName = hasLiveData
                  ? (liveData!.resourceRows.find(r => r.id === a.resourceId)?.name ?? a.resourceId)
                  : a.resourceId
                empTotals.set(a.resourceId, {
                  empCode: a.resourceId,
                  name: fullName,
                  grade: meta?.grade || '—',
                  department: meta?.subServiceLine || 'Unknown',
                  hours: a.hours ?? 0,
                  emEp: a.emEp ?? '—',
                })
              }
            }
          }

          // Group by department
          const byDept = new Map<string, EmpEntry[]>()
          for (const entry of empTotals.values()) {
            if (!byDept.has(entry.department)) byDept.set(entry.department, [])
            byDept.get(entry.department)!.push(entry)
          }
          // Sort employees within each dept by hours desc
          for (const emps of byDept.values()) emps.sort((a, b) => b.hours - a.hours)
          const depts = Array.from(byDept.entries()).sort((a, b) => a[0].localeCompare(b[0]))
          const grandTotal = Array.from(empTotals.values()).reduce((s, e) => s + e.hours, 0)

          return (
            <Section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <SectionTitle style={{ margin: 0 }}>Team Breakdown</SectionTitle>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  {empTotals.size} employee{empTotals.size !== 1 ? 's' : ''} · {grandTotal}h total
                </span>
              </div>
              {depts.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No allocations in the visible period.</p>
              ) : (
                depts.map(([dept, emps]) => {
                  const deptTotal = emps.reduce((s, e) => s + e.hours, 0)
                  return (
                    <div key={dept} style={{ marginBottom: 16 }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '6px 12px', background: 'var(--color-bg)', borderRadius: 'var(--border-radius)',
                        marginBottom: 4, border: '1px solid var(--color-border)',
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{dept}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>{deptTotal}h</span>
                      </div>
                      <AllocModalTable>
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th>Grade</th>
                            <th>EM / EP</th>
                            <th style={{ textAlign: 'right' }}>Hours (Visible Period)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {emps.map(emp => {
                            const empResRow = hasLiveData
                              ? (liveData!.resourceRows.find(r => r.id === emp.empCode) ?? null)
                              : null
                            return (
                              <tr key={emp.empCode}>
                                <td
                                  style={{
                                    fontWeight: 600,
                                    cursor: empResRow ? 'pointer' : 'default',
                                    color: empResRow ? 'var(--color-primary)' : undefined,
                                  }}
                                  onClick={() => {
                                    if (!empResRow) return
                                    setResourcePanelRow(empResRow)
                                  }}
                                >
                                  {emp.name}
                                </td>
                                <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{emp.grade}</td>
                                <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{emp.emEp}</td>
                                <td style={{ fontWeight: 700, textAlign: 'right', color: 'var(--color-text)' }}>{emp.hours}h</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </AllocModalTable>
                    </div>
                  )
                })
              )}
            </Section>
          )
        })()}
      </Modal>

      {/* Find Availability Modal */}
      <Modal
        open={showAvailability}
        onClose={() => { setShowAvailability(false); setSelectedAvailResource(null) }}
        title="Find Availability"
        subtitle="Filter resources by capacity and skills"
        size="md"
      >
        <AvailFormGrid>
          <AvailFormField>
            <AvailFormLabel>DATE FROM</AvailFormLabel>
            <AvailFormInput
              type="date"
              value={availDateFrom}
              onChange={e => setAvailDateFrom(e.target.value)}
            />
          </AvailFormField>
          <AvailFormField>
            <AvailFormLabel>DATE TO</AvailFormLabel>
            <AvailFormInput
              type="date"
              value={availDateTo}
              min={availDateFrom}
              onChange={e => setAvailDateTo(e.target.value)}
            />
          </AvailFormField>
        </AvailFormGrid>
        <AvailFormField style={{ marginTop: 16 }}>
          <AvailFormLabel>NEED CAPACITY (%)</AvailFormLabel>
          <AvailFormInput
            type="number"
            min={0}
            max={100}
            placeholder="e.g. 50"
            value={availCapacity}
            onChange={e => setAvailCapacity(e.target.value)}
          />
        </AvailFormField>
        <AvailFormGrid style={{ marginTop: 16 }}>
          <AvailFormField>
            <AvailFormLabel>PRIMARY SKILL</AvailFormLabel>
            <AvailFormSelect value={availPrimarySkill} onChange={e => setAvailPrimarySkill(e.target.value)}>
              <option value="any">Any</option>
              {allSkills.map(s => <option key={s} value={s}>{s}</option>)}
            </AvailFormSelect>
          </AvailFormField>
          <AvailFormField>
            <AvailFormLabel>SECONDARY SKILL</AvailFormLabel>
            <AvailFormSelect value={availSecondarySkill} onChange={e => setAvailSecondarySkill(e.target.value)}>
              <option value="any">Any</option>
              {allSkills.map(s => <option key={s} value={s}>{s}</option>)}
            </AvailFormSelect>
          </AvailFormField>
        </AvailFormGrid>
        <AvailFormGrid style={{ marginTop: 16 }}>
          <AvailFormField>
            <AvailFormLabel>SUB-TEAM FUNCTION</AvailFormLabel>
            <AvailFormSelect value={availSubTeamFn} onChange={e => setAvailSubTeamFn(e.target.value)}>
              <option value="any">Any</option>
              {activeSSLs.map(s => <option key={s} value={s}>{s}</option>)}
            </AvailFormSelect>
          </AvailFormField>
          <AvailFormField>
            <AvailFormLabel>LOCATION</AvailFormLabel>
            <AvailFormSelect value={availLocation} onChange={e => setAvailLocation(e.target.value)}>
              <option value="any">Any</option>
              {activeLocations.map(l => <option key={l} value={l}>{l}</option>)}
            </AvailFormSelect>
          </AvailFormField>
        </AvailFormGrid>
        <AvailFormActions>
          <AvailResetBtn onClick={() => {
            setAvailDateFrom('2026-04-16')
            setAvailDateTo('2026-05-15')
            setAvailCapacity('4')
            setAvailPrimarySkill('any')
            setAvailSecondarySkill('any')
            setAvailSubTeamFn('any')
            setAvailLocation('any')
            setAvailResults([])
            setAvailSearched(false)
            handleClearAvailFilter()
          }}>Reset</AvailResetBtn>
          <AvailFindBtn onClick={handleFindResources}>Apply Filter to Table</AvailFindBtn>
        </AvailFormActions>
      </Modal>
      {/* Assign Resource to Existing Request */}
      <AssignToRequestModal
        open={assignModalOpen}
        resourceName={assignResourceName}
        onClose={() => { setAssignModalOpen(false); setAssignResourceName('') }}
        onAssign={async (req: ResourceRequest) => {
          // Assigning a resource auto-approves the request (requirement: assigning = approval).
          // Use the /approve endpoint so forecast_allocations are created and the
          // timeline reflects immediately via the 'allocation-created' event.
          try {
            const target = req.uuid
            if (target) {
              const res = await apiRaw(`/api/resource-requests/${target}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  decision: 'approved',
                  allocated_employee: assignResourceName,
                }),
              })
              if (res.ok) {
                window.dispatchEvent(new Event('allocation-created'))
                addToast(`${assignResourceName} assigned & request #${req.id} approved`, 'success')
              } else {
                const body = await res.json().catch(() => ({}))
                addToast(body.error ?? 'Failed to assign resource', 'error')
              }
            } else {
              // Mock data fallback — just show success
              addToast(`${assignResourceName} assigned to request #${req.id} (${req.projectName})`, 'success')
            }
          } catch {
            addToast('Network error — please try again', 'error')
          }
          setAssignModalOpen(false)
          setAssignResourceName('')
        }}
      />
    </PageContainer>
  )
}
