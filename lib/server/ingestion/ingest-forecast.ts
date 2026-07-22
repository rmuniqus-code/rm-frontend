import { query, queryOne } from '@/lib/server/db'
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
  const cache: ForecastCache = {
    designations: new Map(), subFunctions: new Map(), locations: new Map(),
    departments: new Map(), employees: new Map(), projects: new Map(), pendingByNameDoj: new Map(),
  }

  const [desigs, subs, locs, depts, emps, pendingEmps, projs] = await Promise.all([
    query<{ id: string; name: string }>('SELECT id, name FROM designations'),
    query<{ id: string; name: string }>('SELECT id, name FROM sub_functions'),
    query<{ id: string; name: string }>('SELECT id, name FROM locations'),
    query<{ id: string; name: string }>('SELECT id, name FROM departments'),
    query<{ id: string; employee_id: string }>('SELECT id, employee_id FROM employees'),
    query<{ id: string; employee_id: string; name: string | null; date_of_joining: string | null }>(
      `SELECT id, employee_id, name, date_of_joining FROM employees WHERE employee_id LIKE $1`,
      [`${PENDING_EMP_ID_PREFIX}-%`],
    ),
    query<{ id: string; name: string }>('SELECT id, name FROM projects'),
  ])

  desigs.forEach(r => cache.designations.set(r.name, r.id))
  subs.forEach(r => cache.subFunctions.set(r.name, r.id))
  locs.forEach(r => cache.locations.set(r.name, r.id))
  depts.forEach(r => cache.departments.set(r.name, r.id))
  emps.forEach(r => cache.employees.set(r.employee_id, r.id))
  pendingEmps.forEach(r => {
    if (!r.name || !r.date_of_joining) return
    cache.pendingByNameDoj.set(`${normalizeName(r.name)}|${r.date_of_joining}`, { uuid: r.id, pendingEmpId: r.employee_id })
  })
  projs.forEach(r => cache.projects.set(normalizeProjectName(r.name), r.id))

  return cache
}

/**
 * Upsert a single dimension record and return its id.
 * Table name and field name are code constants — never user input.
 */
async function resolveOrCreate(
  table: string,
  field: string,
  value: string,
  cache: Map<string, string>,
  extra?: Record<string, unknown>,
): Promise<string | null> {
  if (!value || value.trim() === '') return null
  const key = value.trim()
  if (cache.has(key)) return cache.get(key)!

  const extraKeys = extra ? Object.keys(extra) : []
  const allCols = [field, ...extraKeys]
  const allVals = [key, ...(extra ? Object.values(extra) : [])]
  const colList = allCols.join(', ')
  const placeholders = allCols.map((_, i) => `$${i + 1}`).join(', ')

  await query(
    `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (${field}) DO NOTHING`,
    allVals,
  )

  const row = await queryOne<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${field} = $1 LIMIT 1`,
    [key],
  )
  if (!row) throw new Error(`Failed to resolve ${table} "${key}"`)
  cache.set(key, row.id)
  return row.id
}

async function resolveProject(
  name: string,
  emEp: string | null,
  projectType: string | null,
  subTeam: string | null,
  cache: ForecastCache,
): Promise<string> {
  const normKey = normalizeProjectName(name)
  if (cache.projects.has(normKey)) return cache.projects.get(normKey)!

  // Try case-insensitive match first
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM projects WHERE name ILIKE $1 LIMIT 1`,
    [name.trim()],
  )
  if (existing) {
    cache.projects.set(normKey, existing.id)
    return existing.id
  }

  // Create new project
  const created = await queryOne<{ id: string }>(
    `INSERT INTO projects (name, engagement_manager, project_type, sub_team)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name.trim(), emEp, mapProjectType(projectType), subTeam],
  )
  if (!created) throw new Error(`Failed to create project "${name}"`)
  cache.projects.set(normKey, created.id)
  return created.id
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

async function processForecastRow(
  row: ForecastRow,
  cache: ForecastCache,
  sourceFile: string,
): Promise<ProcessedRow | ValidationError | null> {
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
        await query(
          `INSERT INTO sub_functions (name, department_id) VALUES ($1, $2) ON CONFLICT (department_id, name) DO NOTHING`,
          [emp.subTeam, deptId],
        )
        const sfRow = await queryOne<{ id: string }>(
          `SELECT id FROM sub_functions WHERE name = $1 AND department_id = $2 LIMIT 1`,
          [emp.subTeam, deptId],
        )
        if (sfRow) {
          subFuncId = sfRow.id
          cache.subFunctions.set(sfCacheKey, sfRow.id)
        }
      }
    }

    let empUuid: string
    const isSyntheticId = emp.employeeId.startsWith(`${PENDING_EMP_ID_PREFIX}-`)
    const reconKey = !isSyntheticId && emp.doj ? `${normalizeName(emp.name)}|${emp.doj}` : null
    const reconMatch = reconKey ? cache.pendingByNameDoj.get(reconKey) : undefined

    if (reconMatch && !cache.employees.has(emp.employeeId)) {
      empUuid = reconMatch.uuid
      await query(
        `UPDATE employees SET
           employee_id = $1, name = $2, email = $3, designation_id = $4, department_id = $5,
           sub_function_id = $6, location_id = $7, work_mode = $8, ft_core = $9,
           rocketlane_status = $10, date_of_joining = $11, current_em_ep = $12, updated_at = $13
         WHERE id = $14`,
        [emp.employeeId, emp.name, emp.email, desigId, deptId, subFuncId, locId,
         emp.workMode, emp.ftCore, emp.rocketlane, emp.doj, emp.currentEmEp,
         new Date().toISOString(), empUuid],
      )
      cache.pendingByNameDoj.delete(reconKey!)
      cache.employees.delete(reconMatch.pendingEmpId)
      cache.employees.set(emp.employeeId, empUuid)
    } else if (cache.employees.has(emp.employeeId)) {
      empUuid = cache.employees.get(emp.employeeId)!
      await query(
        `UPDATE employees SET
           name = $1, email = $2, designation_id = $3, department_id = $4,
           sub_function_id = $5, location_id = $6, work_mode = $7, ft_core = $8,
           rocketlane_status = $9, date_of_joining = $10, current_em_ep = $11, updated_at = $12
         WHERE id = $13`,
        [emp.name, emp.email, desigId, deptId, subFuncId, locId,
         emp.workMode, emp.ftCore, emp.rocketlane, emp.doj, emp.currentEmEp,
         new Date().toISOString(), empUuid],
      )
    } else {
      const upserted = await queryOne<{ id: string }>(
        `INSERT INTO employees
           (employee_id, name, email, designation_id, department_id, sub_function_id,
            location_id, work_mode, ft_core, rocketlane_status, date_of_joining, current_em_ep)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (employee_id) DO UPDATE SET
           name             = EXCLUDED.name,
           email            = EXCLUDED.email,
           designation_id   = EXCLUDED.designation_id,
           department_id    = EXCLUDED.department_id,
           sub_function_id  = EXCLUDED.sub_function_id,
           location_id      = EXCLUDED.location_id,
           work_mode        = EXCLUDED.work_mode,
           ft_core          = EXCLUDED.ft_core,
           rocketlane_status = EXCLUDED.rocketlane_status,
           date_of_joining  = EXCLUDED.date_of_joining,
           current_em_ep    = EXCLUDED.current_em_ep
         RETURNING id`,
        [emp.employeeId, emp.name, emp.email, desigId, deptId, subFuncId,
         locId, emp.workMode, emp.ftCore, emp.rocketlane, emp.doj, emp.currentEmEp],
      )
      if (!upserted) throw new Error(`Employee upsert failed for ${emp.employeeId}`)
      empUuid = upserted.id
      cache.employees.set(emp.employeeId, empUuid)
    }

    const allocationRows: Array<Record<string, unknown>> = []
    for (const week of row.weeklyAllocations) {
      for (const alloc of week.allocations) {
        let projectId: string | null = null
        if (alloc.projectName) {
          projectId = await resolveProject(alloc.projectName, emp.currentEmEp, emp.projectType, emp.subTeam, cache)
        }
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
  employee_id: string
  type: string
  start_date: string
  end_date: string
  allocation_percentage: number
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
      const consecutive =
        cur != null &&
        new Date(cur + 'T00:00:00').getTime() - new Date(prev + 'T00:00:00').getTime() === 7 * 86_400_000
      if (!consecutive) {
        ranges.push({ employee_id, type, start_date: rangeStart, end_date: prev, allocation_percentage: 100 })
        if (cur != null) rangeStart = cur
      }
      if (cur != null) prev = cur
    }
  }

  return ranges
}

/** Build a parameterized multi-row INSERT for forecast_allocations. */
async function bulkInsertAllocations(rows: Array<Record<string, unknown>>): Promise<void> {
  if (rows.length === 0) return
  const cols = ['employee_id', 'project_id', 'week_start', 'allocation_pct', 'allocation_status', 'raw_text', 'source_file'] as const
  const n = cols.length
  const valueClauses: string[] = []
  const params: unknown[] = []
  rows.forEach((row, i) => {
    valueClauses.push(`(${cols.map((_, j) => `$${i * n + j + 1}`).join(', ')})`)
    cols.forEach(c => params.push(row[c] ?? null))
  })
  await query(
    `INSERT INTO forecast_allocations (${cols.join(', ')}) VALUES ${valueClauses.join(', ')}`,
    params,
  )
}

/** Build a parameterized multi-row upsert for allocations (status ranges). */
async function bulkUpsertAllocationRanges(ranges: AllocationRange[], fileName: string): Promise<void> {
  if (ranges.length === 0) return
  const now = new Date().toISOString()
  const cols = ['employee_id', 'type', 'start_date', 'end_date', 'allocation_percentage', 'source_file', 'updated_at'] as const
  const n = cols.length
  const valueClauses: string[] = []
  const params: unknown[] = []
  ranges.forEach((r, i) => {
    valueClauses.push(`(${cols.map((_, j) => `$${i * n + j + 1}`).join(', ')})`)
    params.push(r.employee_id, r.type, r.start_date, r.end_date, r.allocation_percentage, fileName, now)
  })
  await query(
    `INSERT INTO allocations (${cols.join(', ')}) VALUES ${valueClauses.join(', ')}
     ON CONFLICT (employee_id, type, start_date) DO UPDATE SET
       end_date             = EXCLUDED.end_date,
       allocation_percentage = EXCLUDED.allocation_percentage,
       source_file          = EXCLUDED.source_file,
       updated_at           = EXCLUDED.updated_at`,
    params,
  )
}

/** Build a parameterized multi-row upsert for utilization_snapshots. */
async function bulkUpsertUtilization(rows: Array<Record<string, unknown>>): Promise<void> {
  if (rows.length === 0) return
  const cols = ['employee_id', 'snapshot_date', 'mtd_utilization', 'wtd_utilization', 'ytd_utilization', 'comments', 'source_file'] as const
  const n = cols.length
  const valueClauses: string[] = []
  const params: unknown[] = []
  rows.forEach((row, i) => {
    valueClauses.push(`(${cols.map((_, j) => `$${i * n + j + 1}`).join(', ')})`)
    cols.forEach(c => params.push(row[c] ?? null))
  })
  await query(
    `INSERT INTO utilization_snapshots (${cols.join(', ')}) VALUES ${valueClauses.join(', ')}
     ON CONFLICT (employee_id, snapshot_date) DO UPDATE SET
       mtd_utilization = EXCLUDED.mtd_utilization,
       wtd_utilization = EXCLUDED.wtd_utilization,
       ytd_utilization = EXCLUDED.ytd_utilization,
       comments        = EXCLUDED.comments,
       source_file     = EXCLUDED.source_file`,
    params,
  )
}

export async function ingestForecastFile(
  buffer: ArrayBuffer,
  fileName: string,
  uploadedBy?: string,
): Promise<ForecastIngestionResult> {
  const startTime = Date.now()

  const parsed = parseForecastExcel(buffer)

  if (parsed.rows.length === 0) {
    return {
      uploadId: '', fileType: 'forecast_tracker', totalRows: 0, successCount: 0,
      errorCount: parsed.errors.length || 1,
      errors: parsed.errors.length
        ? parsed.errors.map(e => ({ ...e, value: '' }))
        : [{ row: 0, field: '', value: '', message: 'No data rows found' }],
      weekRange: null,
      duration: Date.now() - startTime,
    }
  }

  const log = await queryOne<{ id: string }>(
    `INSERT INTO upload_logs (file_name, file_type, uploaded_by, row_count, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [fileName, 'forecast_tracker', uploadedBy || null, parsed.totalRows, 'processing'],
  )
  const uploadId = log?.id ?? ''

  const cache = await buildForecastCache()

  const BATCH_SIZE = 50
  const allErrors: ValidationError[] = parsed.errors.map(e => ({ ...e, value: '' }))
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

  // Delete existing forecast_allocations for affected employees in the sheet's week range
  if (allEmpUuids.size > 0 && parsed.weekColumns.length > 0) {
    const minWeek = parsed.weekColumns[0]
    const maxWeek = parsed.weekColumns[parsed.weekColumns.length - 1]
    await query(
      `DELETE FROM forecast_allocations
       WHERE employee_id = ANY($1::uuid[]) AND week_start >= $2 AND week_start <= $3`,
      [[...allEmpUuids], minWeek, maxWeek],
    )
  }

  // Deduplicate allocation rows
  const seenAllocKeys = new Map<string, Record<string, unknown>>()
  for (const row of allAllocationRows) {
    const key = `${row.employee_id}|${row.week_start}|${row.project_id ?? '__null__'}`
    seenAllocKeys.set(key, row)
  }
  const deduped = [...seenAllocKeys.values()]

  // Bulk insert in chunks
  const ALLOC_CHUNK = 2000
  for (let i = 0; i < deduped.length; i += ALLOC_CHUNK) {
    await bulkInsertAllocations(deduped.slice(i, i + ALLOC_CHUNK))
  }

  // Delete and re-upsert allocation ranges
  const allocationRanges = groupIntoRanges(allAllocationRows)
  if (allEmpUuids.size > 0 && parsed.weekColumns.length > 0) {
    const minDate = parsed.weekColumns[0]
    const maxDate = parsed.weekColumns[parsed.weekColumns.length - 1]
    await query(
      `DELETE FROM allocations
       WHERE employee_id = ANY($1::uuid[]) AND start_date <= $2 AND end_date >= $3`,
      [[...allEmpUuids], maxDate, minDate],
    )
    await bulkUpsertAllocationRanges(allocationRanges, fileName)
  }

  // Bulk upsert utilization snapshots
  await bulkUpsertUtilization(allUtilizationRows)

  const duration = Date.now() - startTime
  const weekRange = parsed.weekColumns.length > 0
    ? { start: parsed.weekColumns[0], end: parsed.weekColumns[parsed.weekColumns.length - 1] }
    : null

  if (uploadId) {
    await query(
      `UPDATE upload_logs SET
         success_count = $1, error_count = $2, errors = $3,
         status = $4, completed_at = $5
       WHERE id = $6`,
      [
        successCount,
        allErrors.length,
        JSON.stringify(allErrors.slice(0, 100)),
        allErrors.length === parsed.totalRows ? 'failed' : 'completed',
        new Date().toISOString(),
        uploadId,
      ],
    )
  }

  return {
    uploadId, fileType: 'forecast_tracker', totalRows: parsed.totalRows,
    successCount, errorCount: allErrors.length, errors: allErrors, weekRange, duration,
  }
}
