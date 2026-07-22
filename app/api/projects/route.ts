import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

const SL_PREFIX_MAP: Record<string, string> = {
  ARC: 'ARC', ADVISORY: 'ADV', CONSULTING: 'CON', TAX: 'TAX',
  TECHNOLOGY: 'TCH', GRC: 'GRC', SCC: 'SCC', AUDIT: 'ARC',
  FORENSICS: 'FOR', RISK: 'RSK',
}

function serviceLinePrefix(hint: string): string {
  const h = (hint ?? '').trim().toUpperCase()
  for (const [key, code] of Object.entries(SL_PREFIX_MAP)) {
    if (h.startsWith(key) || h.includes(key)) return code
  }
  const clean = h.replace(/[^A-Z]/g, '')
  return (clean.slice(0, 3) || 'GEN').padEnd(3, 'X')
}

async function generateProjectCode(serviceLineHint: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = serviceLinePrefix(serviceLineHint)
  const rows = await query<{ code: string | null }>(
    `SELECT code FROM projects WHERE code LIKE $1`,
    [`%-${year}-%`],
  )
  const maxSeq = rows.reduce((max: number, p: { code: string | null }) => {
    const parts = (p.code ?? '').split('-')
    const seq = parts.length >= 3 ? (parseInt(parts[parts.length - 1]) || 0) : 0
    return Math.max(max, seq)
  }, 0)
  return `${prefix}-${year}-${String(maxSeq + 1).padStart(3, '0')}`
}

export const POST = withAuth(async (request: NextRequest) => {
  const { name, serviceLineHint, subTeam, client, projectType } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const existing = await queryOne<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM projects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [name.trim()],
  )
  if (existing) return NextResponse.json({ project: existing, existed: true })

  const code = await generateProjectCode(serviceLineHint ?? subTeam ?? '')
  try {
    const project = await queryOne<{ id: string; code: string; name: string }>(
      `INSERT INTO projects (name, code, status, sub_team, client, project_type)
       VALUES ($1, $2, 'active', $3, $4, $5)
       RETURNING id, code, name`,
      [name.trim(), code, subTeam ?? serviceLineHint ?? null, client ?? null, projectType ?? 'chargeable'],
    )
    return NextResponse.json({ project, existed: false }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const status = sp.get('status') ?? undefined
  const search = sp.get('search') ?? undefined

  const projectParams: unknown[] = []
  let projectSql = `SELECT id, code, name, client, engagement_manager, engagement_partner, project_type, status, sub_team, start_date, end_date FROM projects`
  if (status && status !== 'all') {
    projectParams.push(status)
    projectSql += ` WHERE status = $1`
  }
  projectSql += ` ORDER BY name`

  let projects: any[]
  let allocRows: any[]
  try {
    ;[projects, allocRows] = await Promise.all([
      query(projectSql, projectParams),
      query(
        `SELECT emp_code, employee_name, designation, sub_function, location, week_start, allocation_pct, allocation_status, project_name, project_client, engagement_manager, engagement_partner, project_type FROM v_resource_allocation_grid`,
      ),
    ])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const HOURS_PER_WEEK = 40
  type ProjectAgg = { members: Map<string, any>; weeks: Set<string>; projectType: string; client: string; em: string; ep: string; weeklyLoad: Map<string, number> }
  const projectAllocMap = new Map<string, ProjectAgg>()

  for (const row of allocRows) {
    const pName = row.project_name
    if (!pName) continue
    if (!projectAllocMap.has(pName)) {
      projectAllocMap.set(pName, { members: new Map(), weeks: new Set(), projectType: row.project_type ?? 'chargeable', client: row.project_client ?? '', em: row.engagement_manager ?? '', ep: row.engagement_partner ?? '', weeklyLoad: new Map() })
    }
    const entry = projectAllocMap.get(pName)!
    entry.weeks.add(row.week_start)
    const pct = Number(row.allocation_pct) || 0
    const existing = entry.members.get(row.emp_code)
    if (!existing || pct > existing.allocPct) {
      entry.members.set(row.emp_code, { empCode: row.emp_code, name: row.employee_name, designation: row.designation ?? '', location: row.location ?? '', allocPct: pct })
    }
    const slotKey = `${row.emp_code}|${row.week_start}`
    entry.weeklyLoad.set(slotKey, (entry.weeklyLoad.get(slotKey) ?? 0) + pct)
  }

  const buildProjectRow = (base: any) => {
    const info = projectAllocMap.get(base.name)
    const weekArr = info ? [...info.weeks].sort() : []
    const members = info ? [...info.members.values()] : []
    let totalHours = 0
    if (info) { for (const pct of info.weeklyLoad.values()) totalHours += (Math.min(pct, 100) / 100) * HOURS_PER_WEEK }
    const gradeMap = new Map<string, number>()
    for (const m of members) { const g = m.designation || 'Unknown'; gradeMap.set(g, (gradeMap.get(g) ?? 0) + 1) }
    const gradeBreakdown = [...gradeMap.entries()].map(([grade, count]) => ({ grade, count })).sort((a, b) => b.count - a.count)
    return { ...base, totalTeamMembers: members.length, firstWeek: weekArr[0] ?? null, lastWeek: weekArr[weekArr.length - 1] ?? null, activeWeeks: weekArr.length, totalHoursBooked: Math.round(totalHours), duration: { from: base.startDate ?? weekArr[0] ?? null, to: base.endDate ?? weekArr[weekArr.length - 1] ?? null, weeks: weekArr.length }, gradeBreakdown, teamMembers: members }
  }

  const result: any[] = []
  for (const p of projects) {
    const allocInfo = projectAllocMap.get(p.name)
    result.push(buildProjectRow({ id: p.id, name: p.name, projectCode: p.code ?? '', client: p.client ?? allocInfo?.client ?? '', engagementManager: p.engagement_manager ?? allocInfo?.em ?? '', engagementPartner: p.engagement_partner ?? allocInfo?.ep ?? '', projectType: p.project_type ?? allocInfo?.projectType ?? 'chargeable', status: p.status ?? 'active', subTeam: p.sub_team ?? '', startDate: p.start_date ?? null, endDate: p.end_date ?? null }))
  }
  for (const [pName, info] of projectAllocMap) {
    if (!result.some(r => r.name === pName)) {
      result.push(buildProjectRow({ id: `alloc-${pName.replace(/\s+/g, '-').toLowerCase()}`, name: pName, projectCode: '', client: info.client, engagementManager: info.em, engagementPartner: info.ep, projectType: info.projectType, status: 'active', subTeam: '', startDate: null, endDate: null }))
    }
  }

  let filtered = result
  if (search) {
    const q = search.toLowerCase()
    filtered = result.filter(p => p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q) || p.engagementManager.toLowerCase().includes(q) || (p.engagementPartner ?? '').toLowerCase().includes(q))
  }
  filtered.sort((a: any, b: any) => b.totalTeamMembers - a.totalTeamMembers)
  return NextResponse.json({ projects: filtered, total: filtered.length })
})
