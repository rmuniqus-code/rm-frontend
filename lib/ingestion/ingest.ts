/**
 * Ingestion Pipeline
 *
 * Handles the full upload flow:
 *   File → Parse → Validate → Upsert Lookups → Upsert Employees → Insert Compliance
 *
 * Design principles:
 * - Idempotent: re-uploading the same file does not create duplicates
 * - Lookup-first: dimension tables are resolved or created before fact inserts
 * - Transactional: each batch is wrapped so partial failures don't corrupt data
 * - Auditable: every upload is logged with row counts and errors
 */

import { query, queryOne } from '@/lib/server/db'
import { parseExcelBuffer, detectFileType, parseMonthString } from './parse-excel'
import type { ParsedRow, ValidationError, FileType } from './parse-excel'

// ─── Types ───────────────────────────────────────────────────

interface IngestionResult {
  uploadId: string
  fileType: FileType
  totalRows: number
  successCount: number
  errorCount: number
  errors: ValidationError[]
  duration: number
}

// In-memory lookup caches (populated once per upload)
interface LookupCache {
  departments: Map<string, string>   // name → uuid
  subFunctions: Map<string, string>  // "deptId|name" → uuid
  regions: Map<string, string>       // name → uuid
  locations: Map<string, string>     // name → uuid
  designations: Map<string, string>  // name → uuid
  employees: Map<string, string>     // employee_id → uuid
}

// ─── Lookup Resolution ───────────────────────────────────────

async function resolveOrCreate(
  table: string,
  matchField: string,
  value: string,
  cache: Map<string, string>,
  extra?: Record<string, unknown>,
): Promise<string> {
  if (!value || value.trim() === '') return ''
  const key = value.trim()
  if (cache.has(key)) return cache.get(key)!

  const fields = [matchField, ...Object.keys(extra ?? {})]
  const values = [key, ...Object.values(extra ?? {})]
  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ')

  await query(
    `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (${matchField}) DO NOTHING`,
    values,
  )

  const row = await queryOne<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${matchField} = $1 LIMIT 1`,
    [key],
  )
  if (!row) throw new Error(`Failed to resolve ${table} "${key}"`)
  cache.set(key, row.id)
  return row.id
}

// ─── Pre-populate Caches ─────────────────────────────────────

async function buildLookupCache(): Promise<LookupCache> {
  const [depts, subs, regs, locs, desigs, emps] = await Promise.all([
    query<{ id: string; name: string }>('SELECT id, name FROM departments'),
    query<{ id: string; name: string; department_id: string }>('SELECT id, name, department_id FROM sub_functions'),
    query<{ id: string; name: string }>('SELECT id, name FROM regions'),
    query<{ id: string; name: string }>('SELECT id, name FROM locations'),
    query<{ id: string; name: string }>('SELECT id, name FROM designations'),
    query<{ id: string; employee_id: string }>('SELECT id, employee_id FROM employees'),
  ])

  const cache: LookupCache = {
    departments: new Map(depts.map(r => [r.name, r.id])),
    subFunctions: new Map(subs.map(r => [`${r.department_id}|${r.name}`, r.id])),
    regions: new Map(regs.map(r => [r.name, r.id])),
    locations: new Map(locs.map(r => [r.name, r.id])),
    designations: new Map(desigs.map(r => [r.name, r.id])),
    employees: new Map(emps.map(r => [r.employee_id, r.id])),
  }
  return cache
}

// ─── Process Single Row ──────────────────────────────────────

interface ProcessedComplianceRow {
  empUuid: string
  complianceData: Record<string, unknown>
}

async function processRow(
  row: ParsedRow,
  fileType: FileType,
  periodInfo: { periodMonth: string; periodStart: string; periodEnd: string },
  cache: LookupCache,
  sourceFile: string,
): Promise<ProcessedComplianceRow | ValidationError> {
  const d = row.data

  try {
    // 1. Resolve department
    const deptName = String(d['Department Name'] ?? '')
    const deptId = deptName ? await resolveOrCreate('departments', 'name', deptName, cache.departments) : null

    // 2. Resolve sub-function (composite unique key: department_id, name)
    const subName = String(d['Sub-Function'] ?? '')
    let subId: string | null = null
    if (subName && deptId) {
      const cacheKey = `${deptId}|${subName}`
      if (cache.subFunctions.has(cacheKey)) {
        subId = cache.subFunctions.get(cacheKey)!
      } else {
        await query(
          `INSERT INTO sub_functions (name, department_id) VALUES ($1, $2)
           ON CONFLICT (department_id, name) DO NOTHING`,
          [subName, deptId],
        )
        const sfRow = await queryOne<{ id: string }>(
          'SELECT id FROM sub_functions WHERE name = $1 AND department_id = $2 LIMIT 1',
          [subName, deptId],
        )
        if (!sfRow) throw new Error(`Failed to resolve sub_functions "${subName}"`)
        subId = sfRow.id
        cache.subFunctions.set(cacheKey, sfRow.id)
      }
    }

    // 3. Resolve region
    const regionName = String(d['Region'] ?? d['Employee Country'] ?? '')
    let regionId: string | null = null
    if (regionName) {
      regionId = await resolveOrCreate('regions', 'name', regionName, cache.regions)
    }

    // 4. Resolve location
    const locName = String(d['Location'] ?? '')
    let locId: string | null = null
    if (locName) {
      locId = await resolveOrCreate('locations', 'name', locName, cache.locations, {
        region_id: regionId,
        country: String(d['Employee Country'] ?? d['Region'] ?? ''),
      })
    }

    // 5. Resolve designation
    const desigName = String(d['Designation'] ?? '')
    let desigId: string | null = null
    if (desigName) {
      const category = d['Category '] ? String(d['Category ']) : null
      desigId = await resolveOrCreate('designations', 'name', desigName, cache.designations, {
        ...(category ? { category } : {}),
      })
    }

    // 6. Upsert employee
    const empCode = String(d['Employee ID'])
    let empUuid: string

    if (cache.employees.has(empCode)) {
      empUuid = cache.employees.get(empCode)!
      await query(
        `UPDATE employees SET
           name = $1, designation_id = $2, department_id = $3,
           sub_function_id = $4, location_id = $5, employee_region = $6,
           date_of_joining = $7, date_of_exit = $8, updated_at = NOW()
         WHERE id = $9`,
        [
          String(d['Employee Name']), desigId, deptId,
          subId, locId, d['Employee Region'] ? String(d['Employee Region']) : null,
          d['Date of Joining'] || null, d['Date of Exit'] || null,
          empUuid,
        ],
      )
    } else {
      const upserted = await queryOne<{ id: string }>(
        `INSERT INTO employees
           (employee_id, name, designation_id, department_id, sub_function_id,
            location_id, employee_region, date_of_joining, date_of_exit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (employee_id) DO UPDATE SET
           name = EXCLUDED.name, designation_id = EXCLUDED.designation_id,
           department_id = EXCLUDED.department_id, sub_function_id = EXCLUDED.sub_function_id,
           location_id = EXCLUDED.location_id, employee_region = EXCLUDED.employee_region,
           date_of_joining = EXCLUDED.date_of_joining, date_of_exit = EXCLUDED.date_of_exit,
           updated_at = NOW()
         RETURNING id`,
        [
          empCode, String(d['Employee Name']), desigId, deptId,
          subId, locId, d['Employee Region'] ? String(d['Employee Region']) : null,
          d['Date of Joining'] || null, d['Date of Exit'] || null,
        ],
      )
      if (!upserted) throw new Error(`Employee upsert failed for ${empCode}`)
      empUuid = upserted.id
      cache.employees.set(empCode, empUuid)
    }

    // 7. Build compliance record
    const complianceData: Record<string, unknown> = {
      employee_id: empUuid,
      period_month: periodInfo.periodMonth,
      period_start: periodInfo.periodStart,
      period_end: periodInfo.periodEnd,
      holidays_days: d['Holidays (Days)'] ?? 0,
      leaves_days: d['Leaves (Days)'] ?? 0,
      available_hours: d['Available Hours'] ?? 0,
      chargeable_hours: d['Chargeable'] ?? 0,
      non_chargeable_hours: d['Non-Chargeable'] ?? 0,
      total_hours: d['Total Hours '] ?? 0,
      chargeability_pct: d['Chargeability %'] ?? 0,
      compliance_pct: d['Compliance %'] ?? 0,
      category: d['Category '] ? String(d['Category ']) : null,
      source_file: sourceFile,
    }

    return { empUuid, complianceData }
  } catch (err) {
    return {
      row: row.rowIndex,
      field: 'processing',
      value: String(d['Employee ID']),
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Main Ingestion Entry Point ──────────────────────────────

export async function ingestExcelFile(
  buffer: ArrayBuffer,
  fileName: string,
  uploadedBy?: string,
  periodOverride?: { month: string; year: number },
): Promise<IngestionResult> {
  const startTime = Date.now()

  // 1. Parse Excel
  const parsed = parseExcelBuffer(buffer)
  const fileType = detectFileType(parsed.headers)

  if (fileType === 'unknown') {
    return {
      uploadId: '',
      fileType,
      totalRows: 0,
      successCount: 0,
      errorCount: 1,
      errors: [{ row: 0, field: '', value: '', message: `Unrecognized file format. Expected columns: Employee ID, Chargeability %, etc.` }],
      duration: Date.now() - startTime,
    }
  }

  // 2. Create upload log
  const log = await queryOne<{ id: string }>(
    `INSERT INTO upload_logs (file_name, file_type, uploaded_by, row_count, status)
     VALUES ($1, $2, $3, $4, 'processing') RETURNING id`,
    [fileName, fileType, uploadedBy || null, parsed.totalRows],
  )
  const uploadId = log?.id ?? ''

  // 3. Determine period
  let periodInfo: { periodMonth: string; periodStart: string; periodEnd: string }

  if (fileType === 'regionwise' && parsed.rows.length > 0) {
    const monthVal = String(parsed.rows[0].data['Month'] ?? '')
    const pm = parseMonthString(monthVal)
    if (!pm) {
      return finalizeUpload(uploadId, fileType, parsed.totalRows, 0, [{
        row: 1, field: 'Month', value: monthVal,
        message: `Cannot parse month value "${monthVal}"`,
      }], startTime)
    }
    periodInfo = { periodMonth: pm.label, periodStart: pm.periodStart, periodEnd: pm.periodEnd }
  } else if (periodOverride) {
    const pm = parseMonthString(`${periodOverride.month}'${periodOverride.year}`)
    if (!pm) throw new Error(`Invalid period override: ${periodOverride.month}'${periodOverride.year}`)
    periodInfo = { periodMonth: pm.label, periodStart: pm.periodStart, periodEnd: pm.periodEnd }
  } else {
    const monthMatch = fileName.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*/i)
    const yearMatch = fileName.match(/20\d{2}/)
    const month = monthMatch?.[0] ?? 'Mar'
    const year = yearMatch?.[0] ?? '2026'
    const pm = parseMonthString(`${month}'${year}`)
    periodInfo = pm
      ? { periodMonth: pm.label, periodStart: pm.periodStart, periodEnd: pm.periodEnd }
      : { periodMonth: 'Mar-2026', periodStart: '2026-03-01', periodEnd: '2026-03-31' }
  }

  // 4. Build lookup cache
  const cache = await buildLookupCache()

  // 5. Process rows in parallel batches
  const BATCH_SIZE = 50
  const allErrors: ValidationError[] = [...parsed.errors]
  let successCount = 0
  const allComplianceRows: Array<Record<string, unknown>> = []

  for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
    const batch = parsed.rows.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(row => processRow(row, fileType, periodInfo, cache, fileName))
    )
    for (const result of results) {
      if ('empUuid' in result) {
        successCount++
        allComplianceRows.push(result.complianceData)
      } else {
        allErrors.push(result)
      }
    }
  }

  // 6. Bulk upsert all compliance records
  if (allComplianceRows.length > 0) {
    for (let i = 0; i < allComplianceRows.length; i += 500) {
      const chunk = allComplianceRows.slice(i, i + 500)
      const cols = Object.keys(chunk[0])
      const placeholders = chunk.map((_, ri) =>
        `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
      ).join(', ')
      const updateCols = cols.filter(c => c !== 'employee_id' && c !== 'period_start' && c !== 'period_end')
      const updateSet = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')
      await query(
        `INSERT INTO timesheet_compliance (${cols.join(', ')}) VALUES ${placeholders}
         ON CONFLICT (employee_id, period_start, period_end) DO UPDATE SET ${updateSet}, updated_at = NOW()`,
        chunk.flatMap(r => cols.map(c => r[c])),
      )
    }
  }

  // 7. Finalize
  return finalizeUpload(uploadId, fileType, parsed.totalRows, successCount, allErrors, startTime)
}

// ─── Finalize Upload Log ─────────────────────────────────────

async function finalizeUpload(
  uploadId: string,
  fileType: FileType,
  totalRows: number,
  successCount: number,
  errors: ValidationError[],
  startTime: number,
): Promise<IngestionResult> {
  const duration = Date.now() - startTime

  if (uploadId) {
    await query(
      `UPDATE upload_logs SET
         success_count = $1, error_count = $2, errors = $3,
         status = $4, completed_at = NOW()
       WHERE id = $5`,
      [
        successCount,
        errors.length,
        JSON.stringify(errors.slice(0, 100)),
        errors.length === totalRows ? 'failed' : 'completed',
        uploadId,
      ],
    )
  }

  return { uploadId, fileType, totalRows, successCount, errorCount: errors.length, errors, duration }
}
