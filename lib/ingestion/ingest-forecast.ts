/**
 * Forecast Tracker Ingestion Pipeline
 *
 * Flow:
 *   1. Parse Excel → ForecastRow[]  (done by parse-forecast.ts)
 *   2. Upsert employees (master data + new fields)
 *   3. Resolve/create projects from allocation text
 *   4. Insert forecast_allocations (delete-and-replace per employee)
 *   5. Insert utilization_snapshots
 *   6. Log the upload
 */

import { query, queryOne } from '@/lib/server/db'
import { parseForecastExcel, PENDING_EMP_ID_PREFIX } from './parse-forecast'
import type { ForecastRow } from './parse-forecast'
import type { ValidationError } from './parse-excel'

const EXCLUDED_DEPARTMENTS = new Set(['Central'])
const EXCLUDED_SUB_FUNCTIONS = new Set(['LT'])
function isExcluded(dept: string, sub?: string): boolean {
  return EXCLUDED_DEPARTMENTS.has(dept) || !!(sub && EXCLUDED_SUB_FUNCTIONS.has(sub))
}

// ─── Types ───────────────────────────────────────────────────

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
  subFunctions: Map<string, string>     // "deptId|name" → uuid
  locations: Map<string, string>
  departments: Map<string, string>
  employees: Map<string, string>        // employee_id → uuid
  projects: Map<string, string>         // normalized name → uuid
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

// ─── Build caches ────────────────────────────────────────────

async function buildForecastCache(): Promise<ForecastCache> {
  const [desigs, subs, locs, depts, emps, pendingEmps, projs] = await Promise.all([
    query<{ id: string; name: string }>('SELECT id, name FROM designations'),
    query<{ id: string; name: string; department_id: string }>('SELECT id, name, department_id FROM sub_functions'),
    query<{ id: string; name: string }>('SELECT id, name FROM locations'),
    query<{ id: string; name: string }>('SELECT id, name FROM departments'),
    query<{ id: string; employee_id: string }>('SELECT id, employee_id FROM employees'),
    query<{ id: string; employee_id: string; name: string | null; date_of_joining: string | null }>(
      `SELECT id, employee_id, name, date_of_joining FROM employees WHERE employee_id LIKE $1`,
      [`${PENDING_EMP_ID_PREFIX}-%`],
    ),
    query<{ id: string; name: string }>('SELECT id, name FROM projects'),
  ])

  const cache: ForecastCache = {
    designations: new Map(desigs.map(r => [r.name, r.id])),
    subFunctions: new Map(subs.map(r => [`${r.department_id}|${r.name}`, r.id])),
    locations: new Map(locs.map(r => [r.name, r.id])),
    departments: new Map(depts.map(r => [r.name, r.id])),
    employees: new Map(emps.map(r => [r.employee_id, r.id])),
    projects: new Map(projs.map(r => [normalizeProjectName(r.name), r.id])),
    pendingByNameDoj: new Map(),
  }

  for (const r of pendingEmps) {
    if (!r.name || !r.date_of_joining) continue
    const key = `${normalizeName(r.name)}|${r.date_of_joining}`
    cache.pendingByNameDoj.set(key, { uuid: r.id, pendingEmpId: r.employee_id })
  }

  return cache
}

// ─── Resolve or create a lookup record ───────────────────────

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

  const fields = [field, ...Object.keys(extra ?? {})]
  const values = [key, ...Object.values(extra ?? {})]
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ')

  await query(
    `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (${field}) DO NOTHING`,
    values,
  )
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${field} = $1 LIMIT 1`,
    [key],
  )
  if (!row) throw new Error(`Failed to resolve ${table} "${key}"`)
  cache.set(key, row.id)
  return row.id
}

// ─── Resolve a project by name ───────────────────────────────

async function resolveProject(
  name: string,
  emEp: string | null,
  projectType: string | null,
  subTeam: string | null,
  cache: ForecastCache,
): Promise<string> {
  const normKey = normalizeProjectName(name)
  if (cache.projects.has(normKey)) return cache.projects.get(normKey)!

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM projects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [name.trim()],
  )
  if (existing) {
    cache.projects.set(normKey, existing.id)
    return existing.id
  }

  const created = await queryOne<{ id: string }>(
    `INSERT INTO projects (name, engagement_manager, project_type, sub_team)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [name.trim(), emEp, mapProjectType(projectType), subTeam],
  )
  if (!created) throw new Error(`Failed to create project "${name}"`)
  cache.projects.set(normKey, created.id)
  return created.id
}

// ─── Return types ────────────────────────────────────────────

interface ProcessedRow {
  empUuid: string
  allocationRows: Array<Record<string, unknown>>
  utilizationRow: Record<string, unknown> | null
}

// ─── Infer department from sub-team ──────────────────────────

function inferDepartment(subTeam: string): string {
  const upper = subTeam.toUpperCase()
  if (upper.startsWith('ARC')) return 'ARC'
  if (upper.startsWith('GRC')) return 'GRC'
  if (upper.startsWith('SCC')) return 'SCC'
  if (upper.startsWith('TECH') || upper.startsWith('TC')) return 'Tech Consulting'
  return 'Central'
}

// ─── Process a single forecast row ───────────────────────────

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
          `INSERT INTO sub_functions (name, department_id) VALUES ($1, $2)
           ON CONFLICT (department_id, name) DO NOTHING`,
          [emp.subTeam, deptId],
        )
        const sfRow = await queryOne<{ id: string }>(
          'SELECT id FROM sub_functions WHERE name = $1 AND department_id = $2 LIMIT 1',
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

    const empFields = {
      name: emp.name,
      email: emp.email,
      designation_id: desigId,
      department_id: deptId,
      sub_function_id: subFuncId,
      location_id: locId,
      work_mode: emp.workMode,
      ft_core: emp.ftCore,
      rocketlane_status: emp.rocketlane,
      date_of_joining: emp.doj,
      current_em_ep: emp.currentEmEp,
    }

    if (reconMatch && !cache.employees.has(emp.employeeId)) {
      empUuid = reconMatch.uuid
      await query(
        `UPDATE employees SET
           employee_id=$1, name=$2, email=$3, designation_id=$4, department_id=$5,
           sub_function_id=$6, location_id=$7, work_mode=$8, ft_core=$9,
           rocketlane_status=$10, date_of_joining=$11, current_em_ep=$12, updated_at=NOW()
         WHERE id=$13`,
        [emp.employeeId, ...Object.values(empFields), empUuid],
      )
      cache.pendingByNameDoj.delete(reconKey!)
      cache.employees.delete(reconMatch.pendingEmpId)
      cache.employees.set(emp.employeeId, empUuid)
    } else if (cache.employees.has(emp.employeeId)) {
      empUuid = cache.employees.get(emp.employeeId)!
      await query(
        `UPDATE employees SET
           name=$1, email=$2, designation_id=$3, department_id=$4,
           sub_function_id=$5, location_id=$6, work_mode=$7, ft_core=$8,
           rocketlane_status=$9, date_of_joining=$10, current_em_ep=$11, updated_at=NOW()
         WHERE id=$12`,
        [...Object.values(empFields), empUuid],
      )
    } else {
      const upserted = await queryOne<{ id: string }>(
        `INSERT INTO employees
           (employee_id, name, email, designation_id, department_id,
            sub_function_id, location_id, work_mode, ft_core,
            rocketlane_status, date_of_joining, current_em_ep)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (employee_id) DO UPDATE SET
           name=EXCLUDED.name, email=EXCLUDED.email,
           designation_id=EXCLUDED.designation_id, department_id=EXCLUDED.department_id,
           sub_function_id=EXCLUDED.sub_function_id, location_id=EXCLUDED.location_id,
           work_mode=EXCLUDED.work_mode, ft_core=EXCLUDED.ft_core,
           rocketlane_status=EXCLUDED.rocketlane_status,
           date_of_joining=EXCLUDED.date_of_joining, current_em_ep=EXCLUDED.current_em_ep,
           updated_at=NOW()
         RETURNING id`,
        [emp.employeeId, ...Object.values(empFields)],
      )
      if (!upserted) throw new Error(`Employee upsert failed for ${emp.employeeId}`)
      empUuid = upserted.id
      cache.employees.set(emp.employeeId, empUuid)
    }

    // Build allocation rows
    const allocationRows: Array<Record<string, unknown>> = []
    for (const week of row.weeklyAllocations) {
      for (const alloc of week.allocations) {
        let projectId: string | null = null
        if (alloc.projectName) {
          projectId = await resolveProject(alloc.projectName, emp.currentEmEp, emp.projectType, emp.subTeam, cache)
        }
        allocationRows.push({
          employee_id: empUuid,
          project_id: projectId,
          week_start: week.weekStart,
          allocation_pct: alloc.allocationPct,
          allocation_status: alloc.status,
          raw_text: alloc.rawText || null,
          source_file: sourceFile,
        })
      }
    }

    let utilizationRow: Record<string, unknown> | null = null
    if (emp.mtdUtilization != null || emp.ytdUtilization != null || emp.wtdUtilization != null) {
      utilizationRow = {
        employee_id: empUuid,
        snapshot_date: new Date().toISOString().split('T')[0],
        mtd_utilization: emp.mtdUtilization,
        wtd_utilization: emp.wtdUtilization,
        ytd_utilization: emp.ytdUtilization,
        comments: emp.comments,
        source_file: sourceFile,
      }
    }

    return { empUuid, allocationRows, utilizationRow }
  } catch (err) {
    return {
      row: row.rowIndex,
      field: 'processing',
      value: emp.employeeId,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Range Grouping ──────────────────────────────────────────

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

// ─── Main Entry Point ────────────────────────────────────────

export async function ingestForecastFile(
  buffer: ArrayBuffer,
  fileName: string,
  uploadedBy?: string,
): Promise<ForecastIngestionResult> {
  const startTime = Date.now()

  const parsed = parseForecastExcel(buffer)

  if (parsed.rows.length === 0) {
    return {
      uploadId: '',
      fileType: 'forecast_tracker',
      totalRows: 0,
      successCount: 0,
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
     VALUES ($1, 'forecast_tracker', $2, $3, 'processing') RETURNING id`,
    [fileName, uploadedBy || null, parsed.totalRows],
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
    const results = await Promise.all(batch.map(row => processForecastRow(row, cache, fileName)))
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

  // Delete + re-insert forecast_allocations for affected employees
  if (allEmpUuids.size > 0 && parsed.weekColumns.length > 0) {
    const minWeek = parsed.weekColumns[0]
    const maxWeek = parsed.weekColumns[parsed.weekColumns.length - 1]
    const uuidList = [...allEmpUuids]
    const placeholders = uuidList.map((_, i) => `$${i + 3}`).join(', ')
    await query(
      `DELETE FROM forecast_allocations WHERE week_start >= $1 AND week_start <= $2 AND employee_id IN (${placeholders})`,
      [minWeek, maxWeek, ...uuidList],
    )
  }

  // Deduplicate in-memory rows
  const seenAllocKeys = new Map<string, Record<string, unknown>>()
  for (const row of allAllocationRows) {
    const key = `${row.employee_id}|${row.week_start}|${row.project_id ?? '__null__'}`
    seenAllocKeys.set(key, row)
  }
  const deduped = [...seenAllocKeys.values()]

  // Bulk insert allocations
  const ALLOC_CHUNK = 2000
  for (let i = 0; i < deduped.length; i += ALLOC_CHUNK) {
    const chunk = deduped.slice(i, i + ALLOC_CHUNK)
    const cols = Object.keys(chunk[0])
    const placeholders = chunk.map((_, ri) =>
      `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    ).join(', ')
    await query(
      `INSERT INTO forecast_allocations (${cols.join(', ')}) VALUES ${placeholders}`,
      chunk.flatMap(r => cols.map(c => r[c])),
    )
  }

  // Delete + re-insert allocation ranges
  if (allEmpUuids.size > 0 && parsed.weekColumns.length > 0) {
    const minDate = parsed.weekColumns[0]
    const maxDate = parsed.weekColumns[parsed.weekColumns.length - 1]
    const uuidList = [...allEmpUuids]
    const placeholders = uuidList.map((_, i) => `$${i + 3}`).join(', ')
    await query(
      `DELETE FROM allocations WHERE start_date <= $1 AND end_date >= $2 AND employee_id IN (${placeholders})`,
      [maxDate, minDate, ...uuidList],
    )

    const allocationRanges = groupIntoRanges(allAllocationRows)
    if (allocationRanges.length > 0) {
      const cols = ['employee_id', 'type', 'start_date', 'end_date', 'allocation_percentage', 'source_file', 'updated_at']
      const rows = allocationRanges.map(r => ({
        employee_id: r.employee_id,
        type: r.type,
        start_date: r.start_date,
        end_date: r.end_date,
        allocation_percentage: r.allocation_percentage,
        source_file: fileName,
        updated_at: new Date().toISOString(),
      }))
      const placeholders2 = rows.map((_, ri) =>
        `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
      ).join(', ')
      await query(
        `INSERT INTO allocations (${cols.join(', ')}) VALUES ${placeholders2}
         ON CONFLICT (employee_id, type, start_date) DO UPDATE SET
           end_date=EXCLUDED.end_date, allocation_percentage=EXCLUDED.allocation_percentage,
           source_file=EXCLUDED.source_file, updated_at=EXCLUDED.updated_at`,
        rows.flatMap(r => cols.map(c => (r as Record<string, unknown>)[c])),
      )
    }
  }

  // Bulk upsert utilization snapshots
  if (allUtilizationRows.length > 0) {
    const cols = Object.keys(allUtilizationRows[0])
    const updateCols = cols.filter(c => c !== 'employee_id' && c !== 'snapshot_date')
    for (let i = 0; i < allUtilizationRows.length; i += 500) {
      const chunk = allUtilizationRows.slice(i, i + 500)
      const placeholders = chunk.map((_, ri) =>
        `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
      ).join(', ')
      await query(
        `INSERT INTO utilization_snapshots (${cols.join(', ')}) VALUES ${placeholders}
         ON CONFLICT (employee_id, snapshot_date) DO UPDATE SET
         ${updateCols.map(c => `${c}=EXCLUDED.${c}`).join(', ')}`,
        chunk.flatMap(r => cols.map(c => r[c])),
      )
    }
  }

  const duration = Date.now() - startTime
  const weekRange = parsed.weekColumns.length > 0
    ? { start: parsed.weekColumns[0], end: parsed.weekColumns[parsed.weekColumns.length - 1] }
    : null

  if (uploadId) {
    await query(
      `UPDATE upload_logs SET
         success_count=$1, error_count=$2, errors=$3, status=$4, completed_at=NOW()
       WHERE id=$5`,
      [
        successCount,
        allErrors.length,
        JSON.stringify(allErrors.slice(0, 100)),
        allErrors.length === parsed.totalRows ? 'failed' : 'completed',
        uploadId,
      ],
    )
  }

  return { uploadId, fileType: 'forecast_tracker', totalRows: parsed.totalRows, successCount, errorCount: allErrors.length, errors: allErrors, weekRange, duration }
}
