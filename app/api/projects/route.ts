/**
 * GET /api/projects?status=active&search=...
 *
 * Returns projects derived from the same source as the resources screen
 * (v_resource_allocation_grid) to ensure consistency.
 *
 * Each project includes its team members (distinct employees allocated).
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling } from '@/lib/api-helpers'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('search')

  // 1. Fetch projects base data
  let projQuery = supabaseAdmin()
    .from('projects')
    .select('id, code, name, client, engagement_manager, engagement_partner, project_type, status, sub_team')
    .order('name')

  if (status && status !== 'all') {
    projQuery = projQuery.eq('status', status)
  }

  const { data: projects, error: projErr } = await projQuery
  if (projErr) return fail(500, projErr.message)

  // 2. Fetch allocations from the same view used by Resources screen
  //    This ensures projects + resources show the same data
  const { data: allocRows, error: allocErr } = await supabaseAdmin()
    .from('v_resource_allocation_grid')
    .select('emp_code, employee_name, designation, sub_function, location, week_start, allocation_pct, allocation_status, project_name, project_client, engagement_manager, project_type')

  if (allocErr) return fail(500, allocErr.message)

  // 3. Group allocations by project name → team members + week range
  const projectAllocMap = new Map<string, {
    members: Map<string, { empCode: string; name: string; designation: string; location: string; allocPct: number }>
    weeks: Set<string>
    projectType: string
    client: string
    em: string
  }>()

  for (const row of (allocRows ?? [])) {
    const pName = row.project_name
    if (!pName) continue

    if (!projectAllocMap.has(pName)) {
      projectAllocMap.set(pName, {
        members: new Map(),
        weeks: new Set(),
        projectType: row.project_type ?? 'chargeable',
        client: row.project_client ?? '',
        em: row.engagement_manager ?? '',
      })
    }
    const entry = projectAllocMap.get(pName)!
    entry.weeks.add(row.week_start)

    // Track unique team members with their highest allocation
    const existing = entry.members.get(row.emp_code)
    const pct = Number(row.allocation_pct) || 0
    if (!existing || pct > existing.allocPct) {
      entry.members.set(row.emp_code, {
        empCode: row.emp_code,
        name: row.employee_name,
        designation: row.designation ?? '',
        location: row.location ?? '',
        allocPct: pct,
      })
    }
  }

  // 4. Merge: prefer DB projects table, but also include allocation-only projects
  const projectIds = new Set((projects ?? []).map((p: any) => p.id))
  const result: any[] = []

  // From projects table
  for (const p of (projects ?? [])) {
    const allocInfo = projectAllocMap.get(p.name)
    const weekArr = allocInfo ? [...allocInfo.weeks].sort() : []
    const members = allocInfo ? [...allocInfo.members.values()] : []

    result.push({
      id: p.id,
      name: p.name,
      projectCode: p.code ?? '',
      client: p.client ?? allocInfo?.client ?? '',
      engagementManager: p.engagement_manager ?? allocInfo?.em ?? '',
      projectType: p.project_type ?? allocInfo?.projectType ?? 'chargeable',
      status: p.status ?? 'active',
      subTeam: p.sub_team ?? '',
      totalTeamMembers: members.length,
      firstWeek: weekArr[0] ?? null,
      lastWeek: weekArr[weekArr.length - 1] ?? null,
      activeWeeks: weekArr.length,
      teamMembers: members,
    })
  }

  // Allocation-only projects (in forecast_allocations but not in projects table — rare)
  for (const [pName, info] of projectAllocMap) {
    const alreadyIncluded = result.some(r => r.name === pName)
    if (!alreadyIncluded) {
      const weekArr = [...info.weeks].sort()
      const members = [...info.members.values()]
      result.push({
        id: `alloc-${pName.replace(/\s+/g, '-').toLowerCase()}`,
        name: pName,
        projectCode: '',
        client: info.client,
        engagementManager: info.em,
        projectType: info.projectType,
        status: 'active',
        subTeam: '',
        totalTeamMembers: members.length,
        firstWeek: weekArr[0] ?? null,
        lastWeek: weekArr[weekArr.length - 1] ?? null,
        activeWeeks: weekArr.length,
        teamMembers: members,
      })
    }
  }

  // 5. Apply search filter
  let filtered = result
  if (search) {
    const q = search.toLowerCase()
    filtered = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.client.toLowerCase().includes(q) ||
      p.engagementManager.toLowerCase().includes(q)
    )
  }

  // Sort by team size desc (most active projects first)
  filtered.sort((a: any, b: any) => b.totalTeamMembers - a.totalTeamMembers)

  return ok({ projects: filtered, total: filtered.length })
})
