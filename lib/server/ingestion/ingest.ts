import { query, queryOne } from '@/lib/server/db'
import { parseExcelBuffer, detectFileType, parseMonthString } from '@/lib/ingestion/parse-excel'
import { isExcluded } from '@/lib/server/sub-function-normalize'
import type { ParsedRow, ValidationError, FileType } from '@/lib/ingestion/parse-excel'

interface IngestionResult {
  uploadId: string
  fileType: FileType
  totalRows: number
  successCount: number
  errorCount: number
  errors: ValidationError[]
  duration: number
}

interface LookupCache {
  departments: Map<string, string>
  subFunctions: Map<string, string>
  regions: Map<string, string>
  locations: Map<string, string>
  designations: Map<string, string>
  employees: Map<string, string>
}

/**
 * Upsert a single dimension record and return its id.
 * Table name and field name come from our own code constants — never from user input.
 */
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

  // Build parameterized INSERT ... ON CONFLICT DO NOTHING
  const extraKeys = extra ? Object.keys(extra) : []
  const allCols = [matchField, ...extraKeys]
  const allVals = [key, ...(extra ? Object.values(extra) : [])]
  const colList = allCols.join(', ')
  const placeholders = allCols.map((_, i) => `$${i + 1}`).join(', ')

  await query(
    `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (${matchField}) DO NOTHING`,
    allVals,
  )

  const row = await queryOne<{ id: string }>(
    `SELECT id FROM ${table} WHERE ${matchField} = $1 LIMIT 1`,
    [key],
  )
  if (!row) throw new Error(`Failed to resolve ${table} "${key}"`)
  cache.set(key, row.id)
  return row.id
}

async function buildLookupCache(): Promise<LookupCache> {
  const cache: LookupCache = {
    departments: new Map(),
    subFunctions: new Map(),
    regions: new Map(),
    locations: new Map(),
    designations: new Map(),
    employees: new Map(),
  }

  const [depts, subs, regs, locs, desigs, emps] = await Promise.all([
    query<{ id: string; name: string }>('SELECT id, name FROM departments'),
    query<{ id: string; name: string; department_id: string }>('SELECT id, name, department_id FROM sub_functions'),
    query<{ id: string; name: string }>('SELECT id, name FROM regions'),
    query<{ id: string; name: string }>('SELECT id, name FROM locations'),
    query<{ id: string; name: string }>('SELECT id, name FROM designations'),
    query<{ id: string; employee_id: string }>('SELECT id, employee_id FROM employees'),
  ])

  depts.forEach(r => cache.departments.set(r.name, r.id))
  subs.forEach(r => cache.subFunctions.set(`${r.department_id}|${r.name}`, r.id))
  regs.forEach(r => cache.regions.set(r.name, r.id))
  locs.forEach(r => cache.locations.set(r.name, r.id))
  desigs.forEach(r => cache.designations.set(r.name, r.id))
  emps.forEach(r => cache.employees.set(r.employee_id, r.id))

  return cache
}

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
): Promise<ProcessedComplianceRow | ValidationError | null> {
  const d = row.data

  try {
    const deptName = String(d['Department Name'] ?? '')
    const subNameRaw = String(d['Sub-Function'] ?? '')
    if (isExcluded(deptName, subNameRaw)) return null

    const deptId = deptName ? await resolveOrCreate('departments', 'name', deptName, cache.departments) : null

    const subName = subNameRaw
    let subId: string | null = null
    if (subName && deptId) {
      const cacheKey = `${deptId}|${subName}`
      if (cache.subFunctions.has(cacheKey)) {
        subId = cache.subFunctions.get(cacheKey)!
      } else {
        await query(
          `INSERT INTO sub_functions (name, department_id) VALUES ($1, $2) ON CONFLICT (department_id, name) DO NOTHING`,
          [subName, deptId],
        )
        const sfRow = await queryOne<{ id: string }>(
          `SELECT id FROM sub_functions WHERE name = $1 AND department_id = $2 LIMIT 1`,
          [subName, deptId],
        )
        if (!sfRow) throw new Error(`Failed to resolve sub_functions "${subName}"`)
        subId = sfRow.id
        cache.subFunctions.set(cacheKey, sfRow.id)
      }
    }

    const regionName = String(d['Region'] ?? d['Employee Country'] ?? '')
    let regionId: string | null = null
    if (regionName) regionId = await resolveOrCreate('regions', 'name', regionName, cache.regions)

    const locName = String(d['Location'] ?? '')
    let locId: string | null = null
    if (locName) {
      locId = await resolveOrCreate('locations', 'name', locName, cache.locations, {
        region_id: regionId,
        country: String(d['Employee Country'] ?? d['Region'] ?? ''),
      })
    }

    const desigName = String(d['Designation'] ?? '')
    let desigId: string | null = null
    if (desigName) {
      const category = d['Category '] ? String(d['Category ']) : null
      desigId = await resolveOrCreate('designations', 'name', desigName, cache.designations, { category })
    }

    const empCode = String(d['Employee ID'])
    let empUuid: string

    if (cache.employees.has(empCode)) {
      empUuid = cache.employees.get(empCode)!
      await query(
        `UPDATE employees SET
          name = $1, designation_id = $2, department_id = $3, sub_function_id = $4,
          location_id = $5, employee_region = $6, date_of_joining = $7, date_of_exit = $8,
          updated_at = $9
         WHERE id = $10`,
        [
          String(d['Employee Name']),
          desigId,
          deptId,
          subId,
          locId,
          d['Employee Region'] ? String(d['Employee Region']) : null,
          d['Date of Joining'] || null,
          d['Date of Exit'] || null,
          new Date().toISOString(),
          empUuid,
        ],
      )
    } else {
      const upserted = await queryOne<{ id: string }>(
        `INSERT INTO employees
           (employee_id, name, designation_id, department_id, sub_function_id, location_id,
            employee_region, date_of_joining, date_of_exit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (employee_id) DO UPDATE SET
           name            = EXCLUDED.name,
           designation_id  = EXCLUDED.designation_id,
           department_id   = EXCLUDED.department_id,
           sub_function_id = EXCLUDED.sub_function_id,
           location_id     = EXCLUDED.location_id,
           employee_region = EXCLUDED.employee_region,
           date_of_joining = EXCLUDED.date_of_joining,
           date_of_exit    = EXCLUDED.date_of_exit
         RETURNING id`,
        [
          empCode,
          String(d['Employee Name']),
          desigId,
          deptId,
          subId,
          locId,
          d['Employee Region'] ? String(d['Employee Region']) : null,
          d['Date of Joining'] || null,
          d['Date of Exit'] || null,
        ],
      )
      if (!upserted) throw new Error(`Employee upsert failed for ${empCode}`)
      empUuid = upserted.id
      cache.employees.set(empCode, empUuid)
    }

    const complianceData: Record<string, unknown> = {
      employee_id: empUuid,
      department_id: deptId,
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
      updated_at: new Date().toISOString(),
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

const COMPLIANCE_COLS = [
  'employee_id', 'department_id', 'period_month', 'period_start', 'period_end',
  'holidays_days', 'leaves_days', 'available_hours', 'chargeable_hours',
  'non_chargeable_hours', 'total_hours', 'chargeability_pct', 'compliance_pct',
  'category', 'source_file', 'updated_at',
] as const

/** Build and execute a parameterized bulk upsert for timesheet_compliance. */
async function bulkUpsertCompliance(rows: Array<Record<string, unknown>>): Promise<void> {
  if (rows.length === 0) return

  const n = COMPLIANCE_COLS.length
  const valueClauses: string[] = []
  const params: unknown[] = []

  rows.forEach((row, rowIdx) => {
    const slots = COMPLIANCE_COLS.map((_, colIdx) => `$${rowIdx * n + colIdx + 1}`)
    valueClauses.push(`(${slots.join(', ')})`)
    COMPLIANCE_COLS.forEach(col => params.push(row[col] ?? null))
  })

  const sql = `
    INSERT INTO timesheet_compliance (${COMPLIANCE_COLS.join(', ')})
    VALUES ${valueClauses.join(', ')}
    ON CONFLICT (employee_id, department_id, period_start, period_end) DO UPDATE SET
      period_month         = EXCLUDED.period_month,
      holidays_days        = EXCLUDED.holidays_days,
      leaves_days          = EXCLUDED.leaves_days,
      available_hours      = EXCLUDED.available_hours,
      chargeable_hours     = EXCLUDED.chargeable_hours,
      non_chargeable_hours = EXCLUDED.non_chargeable_hours,
      total_hours          = EXCLUDED.total_hours,
      chargeability_pct    = EXCLUDED.chargeability_pct,
      compliance_pct       = EXCLUDED.compliance_pct,
      category             = EXCLUDED.category,
      source_file          = EXCLUDED.source_file,
      updated_at           = EXCLUDED.updated_at
  `
  await query(sql, params)
}

export async function ingestExcelFile(
  buffer: ArrayBuffer,
  fileName: string,
  uploadedBy?: string,
  periodOverride?: { month: string; year: number },
): Promise<IngestionResult> {
  const startTime = Date.now()

  const parsed = parseExcelBuffer(buffer)
  const fileType = detectFileType(parsed.headers)

  if (fileType === 'unknown') {
    return {
      uploadId: '', fileType, totalRows: 0, successCount: 0, errorCount: 1,
      errors: [{ row: 0, field: '', value: '', message: 'Unrecognized file format.' }],
      duration: Date.now() - startTime,
    }
  }

  const log = await queryOne<{ id: string }>(
    `INSERT INTO upload_logs (file_name, file_type, uploaded_by, row_count, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [fileName, fileType, uploadedBy || null, parsed.totalRows, 'processing'],
  )
  const uploadId = log?.id ?? ''

  let periodInfo: { periodMonth: string; periodStart: string; periodEnd: string }

  if (fileType === 'regionwise' && parsed.rows.length > 0) {
    const monthVal = String(parsed.rows[0].data['Month'] ?? '')
    const pm = parseMonthString(monthVal)
    if (!pm) return finalizeUpload(uploadId, fileType, parsed.totalRows, 0, [{ row: 1, field: 'Month', value: monthVal, message: `Cannot parse month value "${monthVal}"` }], startTime)
    periodInfo = { periodMonth: pm.label, periodStart: pm.periodStart, periodEnd: pm.periodEnd }
  } else if (periodOverride) {
    const pm = parseMonthString(`${periodOverride.month}'${periodOverride.year}`)
    if (!pm) throw new Error(`Invalid period override`)
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

  const cache = await buildLookupCache()

  const BATCH_SIZE = 50
  const allErrors: ValidationError[] = [...parsed.errors]
  let successCount = 0
  const allComplianceRows: Array<Record<string, unknown>> = []

  for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
    const batch = parsed.rows.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(row => processRow(row, fileType, periodInfo, cache, fileName)))
    for (const result of results) {
      if (result === null) continue
      if ('empUuid' in result) {
        successCount++
        allComplianceRows.push(result.complianceData)
      } else {
        allErrors.push(result)
      }
    }
  }

  if (allComplianceRows.length > 0) {
    // Deduplicate by conflict key — keep last occurrence
    const dedupMap = new Map<string, typeof allComplianceRows[0]>()
    for (const row of allComplianceRows) {
      dedupMap.set(`${row.employee_id}::${row.department_id}::${row.period_start}::${row.period_end}`, row)
    }
    await bulkUpsertCompliance([...dedupMap.values()])
  }

  return finalizeUpload(uploadId, fileType, parsed.totalRows, successCount, allErrors, startTime)
}

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
         status = $4, completed_at = $5
       WHERE id = $6`,
      [
        successCount,
        errors.length,
        JSON.stringify(errors.slice(0, 100)),
        errors.length === totalRows ? 'failed' : 'completed',
        new Date().toISOString(),
        uploadId,
      ],
    )
  }

  return { uploadId, fileType, totalRows, successCount, errorCount: errors.length, errors, duration }
}
