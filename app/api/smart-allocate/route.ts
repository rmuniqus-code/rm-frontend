import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/server/ingestion/ingest'
import { withAuth } from '@/lib/server/auth'

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOf(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  m.setHours(0, 0, 0, 0)
  return toLocalISO(m)
}

function addWeeks(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return toLocalISO(d)
}

const ALLOC_PAGE = 1000
const BOOKED_STATUSES = ['confirmed', 'proposed', 'unconfirmed']

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const primarySkill = sp.get('primarySkill') ?? ''
  const gradeFilter = sp.get('grade') ?? ''
  const today = new Date()
  const fromISO = sp.get('startDate') ?? mondayOf(today)
  const toISO = sp.get('endDate') ?? addWeeks(mondayOf(today), 4)

  const sb = getSupabase()
  const { data: empRows, error: empError } = await sb.from('v_employee_details')
    .select('emp_code,name,designation,department,sub_function,location,region')
    .eq('is_active', true).order('name')
  if (empError) return NextResponse.json({ error: empError.message }, { status: 500 })

  const { data: empDetailRows } = await sb.from('employees').select('id,employee_id,primary_skill,years_experience,certifications,languages')
  const uuidByEmpCode = new Map<string, string>()
  const profileByEmpCode = new Map<string, any>()
  for (const r of empDetailRows ?? []) {
    if (r.employee_id) {
      uuidByEmpCode.set(r.employee_id, r.id)
      profileByEmpCode.set(r.employee_id, { primarySkillDb: r.primary_skill ?? '', yearsExperience: r.years_experience ?? null, certifications: r.certifications ?? null, languages: r.languages ?? null })
    }
  }

  const { data: noteRows } = await sb.from('employee_notes').select('employee_id,note')
  const noteByUUID = new Map<string, string>()
  for (const n of noteRows ?? []) { if (n.employee_id && n.note) noteByUUID.set(n.employee_id, n.note) }

  const { data: skillRows } = await sb.from('v_employee_skills').select('emp_code,primary_skill')
  const skillMap = new Map<string, string>()
  for (const s of skillRows ?? []) { if (s.emp_code && s.primary_skill) skillMap.set(s.emp_code, s.primary_skill) }

  const { data: desRows } = await sb.from('designations').select('name,rank_order')
  const gradeRank = new Map<string, number>()
  for (const d of desRows ?? []) { if (d.name) gradeRank.set(d.name, d.rank_order ?? 0) }

  const allocRows: any[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await sb.from('v_resource_allocation_grid')
      .select('emp_code,allocation_pct,week_start,allocation_status')
      .gte('week_start', fromISO).lte('week_start', toISO).in('allocation_status', BOOKED_STATUSES)
      .range(offset, offset + ALLOC_PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    allocRows.push(...data)
    if (data.length < ALLOC_PAGE) break
    offset += ALLOC_PAGE
  }

  const weekTotals = new Map<string, Map<string, number>>()
  for (const row of allocRows) {
    if (!weekTotals.has(row.emp_code)) weekTotals.set(row.emp_code, new Map())
    const wMap = weekTotals.get(row.emp_code)!
    wMap.set(row.week_start, (wMap.get(row.week_start) ?? 0) + (row.allocation_pct ?? 0))
  }
  const avgUtil = new Map<string, number>()
  for (const [empCode, wMap] of weekTotals.entries()) {
    const total = Array.from(wMap.values()).reduce((a, b) => a + b, 0)
    avgUtil.set(empCode, Math.round(total / wMap.size))
  }

  const requestedRank = gradeFilter ? (gradeRank.get(gradeFilter) ?? -1) : -1
  const hasSkillData = skillMap.size > 0
  const candidates: any[] = []

  for (const emp of empRows ?? []) {
    const r = emp as any
    const empSkill = skillMap.get(r.emp_code) ?? ''

    let skillScore = 0
    if (primarySkill && hasSkillData) {
      if (empSkill.toLowerCase() !== primarySkill.toLowerCase()) continue
      skillScore = 50
    } else if (primarySkill && !hasSkillData) {
      skillScore = 0
    } else {
      skillScore = empSkill ? 20 : 0
    }

    const util = avgUtil.get(r.emp_code) ?? 0
    if (util > 100) continue

    let availScore = util <= 50 ? 30 : util <= 80 ? 20 : 10
    let gradeScore = 0
    if (gradeFilter && r.designation) {
      if (r.designation === gradeFilter) {
        gradeScore = 20
      } else {
        const empRank = gradeRank.get(r.designation) ?? -99
        if (requestedRank >= 0 && empRank >= 0 && Math.abs(empRank - requestedRank) === 1) gradeScore = 10
      }
    }

    const fitScore = Math.min(skillScore + availScore + gradeScore, 100)
    const empUUID = uuidByEmpCode.get(r.emp_code) ?? r.emp_code
    const profile = profileByEmpCode.get(r.emp_code)
    candidates.push({
      id: empUUID, empCode: r.emp_code, name: r.name, grade: r.designation ?? '',
      serviceLine: r.department ?? '', subServiceLine: r.sub_function ?? '',
      location: r.location ?? '', region: r.region ?? '', primarySkill: empSkill,
      yearsExperience: profile?.yearsExperience ?? null, certifications: profile?.certifications ?? null,
      languages: profile?.languages ?? null, employeeNote: noteByUUID.get(empUUID) ?? null,
      utilization: util, fitScore, matchBreakdown: { skill: skillScore, availability: availScore, grade: gradeScore },
    })
  }

  candidates.sort((a, b) => b.fitScore - a.fitScore || a.utilization - b.utilization)
  return NextResponse.json({ candidates, fromISO, toISO })
})
