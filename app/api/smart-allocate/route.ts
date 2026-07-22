import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
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

const BOOKED_STATUSES = ['confirmed', 'proposed', 'unconfirmed']

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const primarySkill = sp.get('primarySkill') ?? ''
  const gradeFilter = sp.get('grade') ?? ''
  const today = new Date()
  const fromISO = sp.get('startDate') ?? mondayOf(today)
  const toISO = sp.get('endDate') ?? addWeeks(mondayOf(today), 4)

  const [empRows, empDetailRows, noteRows, skillRows, desRows, allocRows] = await Promise.all([
    query(
      `SELECT emp_code, name, designation, department, sub_function, location, region
       FROM v_employee_details
       WHERE is_active = true
       ORDER BY name`,
    ),
    query(
      `SELECT id, employee_id, primary_skill, years_experience, certifications, languages
       FROM employees`,
    ),
    query(
      `SELECT employee_id, note
       FROM employee_notes`,
    ),
    query(
      `SELECT emp_code, primary_skill
       FROM v_employee_skills`,
    ),
    query(
      `SELECT name, rank_order
       FROM designations`,
    ),
    query(
      `SELECT emp_code, allocation_pct, week_start, allocation_status
       FROM v_resource_allocation_grid
       WHERE week_start >= $1 AND week_start <= $2
         AND allocation_status = ANY($3)`,
      [fromISO, toISO, BOOKED_STATUSES],
    ),
  ])

  const uuidByEmpCode = new Map<string, string>()
  const profileByEmpCode = new Map<string, any>()
  for (const r of empDetailRows as any[]) {
    if (r.employee_id) {
      uuidByEmpCode.set(r.employee_id, r.id)
      profileByEmpCode.set(r.employee_id, {
        primarySkillDb: r.primary_skill ?? '',
        yearsExperience: r.years_experience ?? null,
        certifications: r.certifications ?? null,
        languages: r.languages ?? null,
      })
    }
  }

  const noteByUUID = new Map<string, string>()
  for (const n of noteRows as any[]) { if (n.employee_id && n.note) noteByUUID.set(n.employee_id, n.note) }

  const skillMap = new Map<string, string>()
  for (const s of skillRows as any[]) { if (s.emp_code && s.primary_skill) skillMap.set(s.emp_code, s.primary_skill) }

  const gradeRank = new Map<string, number>()
  for (const d of desRows as any[]) { if (d.name) gradeRank.set(d.name, d.rank_order ?? 0) }

  const weekTotals = new Map<string, Map<string, number>>()
  for (const row of allocRows as any[]) {
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

  for (const emp of empRows as any[]) {
    const r = emp
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

    const availScore = util <= 50 ? 30 : util <= 80 ? 20 : 10
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
