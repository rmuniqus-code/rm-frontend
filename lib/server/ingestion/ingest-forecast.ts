import { getSupabase } from './ingest'
import { parseForecastExcel, PENDING_EMP_ID_PREFIX } from '@/lib/ingestion/parse-forecast'
import type { ForecastRow } from '@/lib/ingestion/parse-forecast'
import type { ValidationError } from '@/lib/ingestion/parse-excel'
import { isExcluded } from '@/lib/server/sub-function-normalize'

interface ForecastIngestionResult {
  uploadId: string
  fileType: 'forecast_tracker'
  totalRows: number
  successCount: number
  errorCount: number
  errors: ValidationError[]
  weekRange: { start: string; end: string } | null
  duration: number
}

interface ForecastCache {
  designations: Map<string, string>
  subFunctions: Map<string, string>
  locations: Map<string, string>
  departments: Map<string, string>
  employees: Map<string, string>
  projects: Map<string, string>
  pendingByNameDoj: Map<string, { uuid: string; pendingEmpId: string }>
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function mapProjectType(type: string | null): string {
  if (!type) return 'chargeable'
  const lower = type.toLowerCase().trim()
  if (lower === 'chargeable') return 'chargeable'
  if (lower === 'non-chargeable' || lower === 'non chargeable') return 'non_chargeable'
  if (lower === 'internal') return 'internal'
  if (lower === 'training') return 'training'
  return 'chargeable'
}

async function buildForecastCache(): Promise<ForecastCache> {
  const sb = getSupabase()
  const cache: ForecastCache = {
    designations: new Map(), subFunctions: new Map(), locations: new Map(),
    departments: new Map(), employees: new Map(), projects: new Map(), pendingByNameDoj: new Map(),
  }

  const [desigs, subs, locs, depts, emps, pendingEmps, projs] = await Promise.all([
    sb.from('designations').select('id, name'),
    sb.from('sub_functions').select('id, name'),
    sb.from('locations').select('id, name'),
    sb.from('departments').select('id, name'),
    sb.from('employees').select('id, employee_id'),
    sb.from('employees').select('id, employee_id, name, date_of_joining').like('employee_id', `${PENDING_EMP_ID_PREFIX}-%`),
    sb.from('projects').select('id, name'),
  ])

  desigs.data?.forEach((r: any) => cache.designations.set(r.name, r.id))
  subs.data?.forEach((r: any) => cache.subFunctions.set(r.name, r.id))
  locs.data?.forEach((r: any) => cache.locations.set(r.name, r.id))
  depts.data?.forEach((r: any) => cache.departments.set(r.name, r.id))
  emps.data?.forEach((r: any) => cache.employees.set(r.employee_id, r.id))
  pendingEmps.data?.forEach((r: any) => {
    if (!r.name || !r.date_of_joining) return
    cache.pendingByNameDoj.set(`${normalizeName(r.name)}|${r.date_of_joining}`, { uuid: r.id, pendingEmpId: r.employee_id })
  })
  projs.data?.forEach((r: any) => cache.projects.set(normalizeProjectName(r.name), r.id))

  return cache
}

async function resolveOrCreate(table: string, field: string, value: string, cache: Map<string, string>, extra?: Record<string, unknown>): Promise<string | null> {
  if (!value || value.trim() === '') return null
  const key = value.trim()
  if (cache.has(key)) return cache.get(key)!
  const sb = getSupabase()
  await sb.from(table).upsert({ [field]: key, ...extra }, { onConflict: field, ignoreDuplicates: true })
  const { data: row, error } = await sb.from(table).select('id').eq(field, key).limit(1).single()
  if (error || !row) throw new Error(`Failed to resolve ${table} "${key}": ${error?.message}`)
  cache.set(key, row.id)
  return row.id
}

async function resolveProject(name: string, emEp: string | null, projectType: string | null, subTeam: string | null, cache: ForecastCache): Promise<string> {
  const normKey = normalizeProjectName(name)
  if (cache.projects.has(normKey)) return cache.projects.get(normKey)!
  const sb = getSupabase()
  const { data: existing } = await sb.from('projects').select('id').ilike('name', name.trim()).limit(1).single()
  if (existing) { cache.projects.set(normKey, existing.id); return existing.id }
  const { data: created, error } = await sb.from('projects').insert({ name: name.trim(), engagement_manager: emEp, project_type: mapProjectType(projectType), sub_team: subTeam }).select('id').single()
  if (error) throw new Error(`Failed to create project "${name}": ${error.message}`)
  cache.projects.set(normKey, created!.id)
  return created!.id
}

interface ProcessedRow {
  empUuid: string
  allocationRows: Array<Record<string, unknown>>
  utilizationRow: Record<string, unknown> | null
}

function inferDepartment(subTeam: string): string {
  const upper = subTeam.toUpperCase()
  if (upper.startsWith('ARC')) return 'ARC'
  if (upper.startsWith('GRC')) return 'GRC'
  if (upper.startsWith('SCC')) return 'SCC'
  if (upper.startsWith('TECH') || upper.startsWith('TC')) return 'Tech Consulting'
  return 'Central'
}

async function processForecastRow(row: ForecastRow, cache: ForecastCache, sourceFile: string): Promise<ProcessedRow | ValidationError | null> {
  const sb = getSupabase()
  const emp = row.employee

  try {
    const desigId = await resolveOrCreate('designations', 'name', emp.grade ?? '', cache.designations)
    const locId = await resolveOrCreate('locations', 'name', emp.location ?? '', cache.locations)

    let deptId: string | null = null
    let subFuncId: string | null = null
    if (emp.subTeam) {
      const deptName = inferDepartment(emp.subTeam)
      if (isExcluded(deptName, emp.subTeam)) return null
      deptId = await resolveOrCreate('departments', 'name', deptName, cache.departments)
      const sfCacheKey = `${deptId}|${emp.subTeam}`
      if (cache.subFunctions.has(sfCacheKey)) {
        subFuncId = cache.subFunctions.get(sfCacheKey)!
      } else {
        await sb.from('sub_functions').upsert({ name: emp.subTeam, department_id: deptId }, { onConflict: 'department_id,name', ignoreDuplicates: true })
        const { data: sfRow } = await sb.from('sub_functions').select('id').eq('name', emp.subTeam).eq('department_id', deptId).limit(1).single()
        if (sfRow) { subFuncId = sfRow.id; cache.subFunctions.set(sfCacheKey, sfRow.id) }
      }
    }

    let empUuid: string
    const isSyntheticId = emp.employeeId.startsWith(`${PENDING_EMP_ID_PREFIX}-`)
    const reconKey = !isSyntheticId && emp.doj ? `${normalizeName(emp.name)}|${emp.doj}` : null
    const reconMatch = reconKey ? cache.pendingByNameDoj.get(reconKey) : undefined

    const empData = {
      name: emp.name, email: emp.email, designation_id: desigId, department_id: deptId,
      sub_function_id: subFuncId, location_id: locId, work_mode: emp.workMode,
      ft_core: emp.ftCore, rocketlane_status: emp.rocketlane, date_of_joining: emp.doj,
      current_em_ep: emp.currentEmEp, updated_at: new Date().toISOString(),
    }

    if (reconMatch && !cache.employees.has(emp.employeeId)) {
      empUuid = reconMatch.uuid
      await sb.from('employees').update({ employee_id: emp.employeeId, ...empData }).eq('id', empUuid)
      cache.pendingByNameDoj.delete(reconKey!)
      cache.employees.delete(reconMatch.pendingEmpId)
      cache.employees.set(emp.employeeId, empUuid)
    } else if (cache.employees.has(emp.employeeId)) {
      empUuid = cache.employees.get(emp.employeeId)!
      await sb.from('employees').update(empData).eq('id', empUuid)
    } else {
      const { data: upserted, error } = await sb.from('employees')
        .upsert({ employee_id: emp.employeeId, ...empData }, { onConflict: 'employee_id' })
        .select('id').single()
      if (error) throw new Error(`Employee upsert failed: ${error.message}`)
      empUuid = upserted!.id
      cache.employees.set(emp.employeeId, empUuid)
    }

    const allocationRows: Array<Record<string, unknown>> = []
    for (const week of row.weeklyAllocations) {
      for (const alloc of week.allocations) {
        let projectId: string | null = null
        if (alloc.projectName) projectId = await resolveProject(alloc.projectName, emp.currentEmEp, emp.projectType, emp.subTeam, cache)
        allocationRows.push({
          employee_id: empUuid, project_id: projectId, week_start: week.weekStart,
          allocation_pct: alloc.allocationPct, allocation_status: alloc.status,
          raw_text: alloc.rawText || null, source_file: sourceFile,
        })
      }
    }

    let utilizationRow: Record<string, unknown> | null = null
    if (emp.mtdUtilization != null || emp.ytdUtilization != null || emp.wtdUtilization != null) {
      utilizationRow = {
        employee_id: empUuid, snapshot_date: new Date().toISOString().split('T')[0],
        mtd_utilization: emp.mtdUtilization, wtd_utilization: emp.wtdUtilization,
        ytd_utilization: emp.ytdUtilization, comments: emp.comments, source_file: sourceFile,
      }
    }

    return { empUuid, allocationRows, utilizationRow }
  } catch (err) {
    return { row: row.rowIndex, field: 'processing', value: emp.employeeId, message: err instanceof Error ? err.message : String(err) }
  }
}

interface AllocationRange {
  employee_id: string; type: string; start_date: string; end_date: string; allocation_percentage: number
}

function groupIntoRanges(rows: Array<Record<string, unknown>>): AllocationRange[] {
  const statusRows = rows.filter(r => r.project_id == null)
  if (statusRows.length === 0) return []

  const byKey = new Map<string, string[]>()
  for (const row of statusRows) {
    const key = `${row.employee_id}|${row.allocation_status}`
    const arr = byKey.get(key) ?? []
    arr.push(row.week_start as string)
    byKey.set(key, arr)
  }

  const ranges: AllocationRange[] = []
  for (const [key, weeks] of byKey) {
    const [employee_id, type] = key.split('|')
    const sorted = [...new Set(weeks)].sort()
    let rangeStart = sorted[0]
    let prev = sorted[0]

    for (let i = 1; i <= sorted.length; i++) {
      const cur = sorted[i]
      const consecutive = cur != null && new Date(cur + 'T00:00:00').getTime() - new Date(prev + 'T00:00:00').getTime() === 7 * 86_400_000
      if (!consecutive) {
        ranges.push({ employee_id, type, start_date: rangeStart, end_date: prev, allocation_percentage: 100 })
        if (cur != null) rangeStart = cur
      }
      if (cur != null) prev = cur
    }
  }

  return ranges
}

export async function ingestForecastFile(buffer: ArrayBuffer, fileName: string, uploadedBy?: string): Promise<ForecastIngestionResult> {
  const startTime = Date.now()
  const sb = getSupabase()

  const parsed = parseForecastExcel(buffer)

  if (parsed.rows.length === 0) {
    return {
      uploadId: '', fileType: 'forecast_tracker', totalRows: 0, successCount: 0,
      errorCount: parsed.errors.length || 1,
      errors: parsed.errors.length ? parsed.errors.map((e: any) => ({ ...e, value: '' })) : [{ row: 0, field: '', value: '', message: 'No data rows found' }],
      weekRange: null, duration: Date.now() - startTime,
    }
  }

  const { data: log } = await sb.from('upload_logs').insert({ file_name: fileName, file_type: 'forecast_tracker', uploaded_by: uploadedBy || null, row_count: parsed.totalRows, status: 'processing' }).select('id').single()
  const uploadId = log?.id ?? ''

  const cache = await buildForecastCache()

  const BATCH_SIZE = 50
  const allErrors: ValidationError[] = (parsed.errors as any[]).map((e: any) => ({ ...e, value: '' }))
  let successCount = 0

  const allAllocationRows: Array<Record<string, unknown>> = []
  const allUtilizationRows: Array<Record<string, unknown>> = []
  const allEmpUuids = new Set<string>()

  for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
    const batch = parsed.rows.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map((row: ForecastRow) => processForecastRow(row, cache, fileName)))
    for (const result of results) {
      if (result === null) continue
      if ('empUuid' in result) {
        successCount++
        allEmpUuids.add(result.empUuid)
        allAllocationRows.push(...result.allocationRows)
        if (result.utilizationRow) allUtilizationRows.push(result.utilizationRow)
      } else {
        allErrors.push(result)
      }
    }
  }

  if (allEmpUuids.size > 0 && parsed.weekColumns.length > 0) {
    const minWeek = parsed.weekColumns[0]
    const maxWeek = parsed.weekColumns[parsed.weekColumns.length - 1]
    await sb.from('forecast_allocations').delete().in('employee_id', [...allEmpUuids]).gte('week_start', minWeek).lte('week_start', maxWeek)
  }

  const seenAllocKeys = new Map<string, Record<string, unknown>>()
  for (const row of allAllocationRows) {
    const key = `${row.employee_id}|${row.week_start}|${row.project_id ?? '__null__'}`
    seenAllocKeys.set(key, row)
  }
  const deduped = [...seenAllocKeys.values()]

  const ALLOC_CHUNK = 2000
  for (let i = 0; i < deduped.length; i += ALLOC_CHUNK) {
    const { error: allocErr } = await sb.from('forecast_allocations').insert(deduped.slice(i, i + ALLOC_CHUNK))
    if (allocErr) throw new Error(`Bulk allocation insert failed: ${allocErr.message}`)
  }

  const allocationRanges = groupIntoRanges(allAllocationRows)
  if (allEmpUuids.size > 0 && parsed.weekColumns.length > 0) {
    const minDate = parsed.weekColumns[0]
    const maxDate = parsed.weekColumns[parsed.weekColumns.length - 1]
    await sb.from('allocations').delete().in('employee_id', [...allEmpUuids]).lte('start_date', maxDate).gte('end_date', minDate)
    if (allocationRanges.length > 0) {
      const { error: allocRangeErr } = await sb.from('allocations').upsert(allocationRanges.map(r => ({ ...r, source_file: fileName, updated_at: new Date().toISOString() })), { onConflict: 'employee_id,type,start_date' })
      if (allocRangeErr) throw new Error(`Allocation ranges upsert failed: ${allocRangeErr.message}`)
    }
  }

  if (allUtilizationRows.length > 0) {
    const { error: utilErr } = await sb.from('utilization_snapshots').upsert(allUtilizationRows, { onConflict: 'employee_id,snapshot_date' })
    if (utilErr) throw new Error(`Bulk utilization upsert failed: ${utilErr.message}`)
  }

  const duration = Date.now() - startTime
  const weekRange = parsed.weekColumns.length > 0 ? { start: parsed.weekColumns[0], end: parsed.weekColumns[parsed.weekColumns.length - 1] } : null

  if (uploadId) {
    await sb.from('upload_logs').update({
      success_count: successCount, error_count: allErrors.length, errors: allErrors.slice(0, 100),
      status: allErrors.length === parsed.totalRows ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', uploadId)
  }

  return { uploadId, fileType: 'forecast_tracker', totalRows: parsed.totalRows, successCount, errorCount: allErrors.length, errors: allErrors, weekRange, duration }
}
