import * as XLSX from 'xlsx'
import { query, queryOne } from '@/lib/server/db'
import { excelDateToISO } from '@/lib/ingestion/parse-excel'
import { isExcluded } from '@/lib/server/sub-function-normalize'
import type { ValidationError } from '@/lib/ingestion/parse-excel'

export interface RmsIngestionResult {
  uploadId: string
  fileType: 'rms'
  totalRows: number
  successCount: number
  errorCount: number
  errors: ValidationError[]
  duration: number
}

interface RmsRow {
  employeeId: string
  name: string
  employeeStatus: string
  dateOfJoining: string | null
  dateOfExit: string | null
  department: string
  subFunction: string
  designation: string
  location: string
  region: string
  pmName: string
  pmEmail: string
  reportingPartnerEmail: string
  email: string
  skillSet: string
  rowIndex: number
}

function parseRmsBuffer(buffer: ArrayBuffer): { rows: RmsRow[]; errors: ValidationError[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  if (raw.length < 2) return { rows: [], errors: [{ row: 0, field: '', value: '', message: 'File has no data rows' }] }

  const headerRow = raw[0] as string[]
  const colIdx = new Map<string, number>()
  headerRow.forEach((h, i) => { if (h) colIdx.set(String(h).trim(), i) })

  const rows: RmsRow[] = []
  const errors: ValidationError[] = []

  for (let i = 1; i < raw.length; i++) {
    const r = raw[i] as unknown[]
    if (!r || r.length === 0) continue

    const get = (col: string): string => {
      const idx = colIdx.get(col)
      if (idx === undefined) return ''
      const v = r[idx]
      if (v === null || v === undefined) return ''
      return String(v).trim()
    }
    const getNum = (col: string): number | string => {
      const idx = colIdx.get(col)
      if (idx === undefined) return ''
      return r[idx] as number | string
    }

    const empId = get('Employee ID')
    if (!empId) { errors.push({ row: i + 1, field: 'Employee ID', value: '', message: 'Missing Employee ID' }); continue }
    const empName = get('Employee Name')
    if (!empName) { errors.push({ row: i + 1, field: 'Employee Name', value: empId, message: 'Missing Employee Name' }); continue }

    const rawJoining = getNum('Joining date')
    const rawExit = getNum('Exit Date')
    const dateOfJoining = rawJoining ? excelDateToISO(rawJoining as number) : null
    const dateOfExit = rawExit ? excelDateToISO(rawExit as number) : null

    const dept = get('Function')
    const sub = get('Sub Function')
    if (isExcluded(dept, sub)) continue

    rows.push({
      employeeId: empId, name: empName,
      employeeStatus: get('Employee Status'),
      dateOfJoining, dateOfExit,
      department: dept, subFunction: sub,
      designation: get('Employee Designation'),
      location: get('Work Location'),
      region: get('Region'),
      pmName: get('PM Name'), pmEmail: get('PM Mail Id'),
      reportingPartnerEmail: get('Reporting Partner Mail ID'),
      email: get('Company Email Id'),
      skillSet: get('Skill Set'),
      rowIndex: i + 1,
    })
  }

  return { rows, errors }
}

async function resolveOrCreate(
  table: string, matchField: string, value: string,
  cache: Map<string, string>, extra?: Record<string, unknown>,
): Promise<string | null> {
  if (!value) return null
  const key = value.trim()
  if (!key) return null
  if (cache.has(key)) return cache.get(key)!

  const extraFields = extra ? Object.keys(extra) : []
  const extraValues = extra ? Object.values(extra) : []
  const allFields = [matchField, ...extraFields]
  const allValues = [key, ...extraValues]
  const insertCols = allFields.map(f => `"${f}"`).join(', ')
  const insertPlaceholders = allFields.map((_, i) => `$${i + 1}`).join(', ')
  const conflictCols = `"${matchField}"`

  await query(
    `INSERT INTO "${table}" (${insertCols}) VALUES (${insertPlaceholders})
     ON CONFLICT (${conflictCols}) DO NOTHING`,
    allValues,
  )

  const row = await queryOne<{ id: string }>(
    `SELECT id FROM "${table}" WHERE "${matchField}" = $1 LIMIT 1`,
    [key],
  )
  if (!row) throw new Error(`Failed to resolve ${table} "${key}"`)
  cache.set(key, row.id)
  return row.id
}

async function hasMigration008(): Promise<boolean> {
  try {
    await query('SELECT employee_status FROM employees LIMIT 1', [])
    return true
  } catch {
    return false
  }
}

export async function ingestRmsFile(buffer: ArrayBuffer, fileName: string): Promise<RmsIngestionResult> {
  const startTime = Date.now()

  const migrated = await hasMigration008()
  const { rows, errors: parseErrors } = parseRmsBuffer(buffer)

  const logRow = await queryOne<{ id: string }>(
    `INSERT INTO upload_logs (file_name, file_type, row_count, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [fileName, 'rms', rows.length, 'processing'],
  )
  const uploadId = logRow?.id ?? ''

  const deptCache = new Map<string, string>()
  const sfCache = new Map<string, string>()
  const regionCache = new Map<string, string>()
  const locCache = new Map<string, string>()
  const desigCache = new Map<string, string>()
  const empCache = new Map<string, string>()

  const [depts, sfs, regions, locs, desigs, emps] = await Promise.all([
    query<{ id: string; name: string }>('SELECT id, name FROM departments', []),
    query<{ id: string; name: string; department_id: string }>('SELECT id, name, department_id FROM sub_functions', []),
    query<{ id: string; name: string }>('SELECT id, name FROM regions', []),
    query<{ id: string; name: string }>('SELECT id, name FROM locations', []),
    query<{ id: string; name: string }>('SELECT id, name FROM designations', []),
    query<{ id: string; employee_id: string }>('SELECT id, employee_id FROM employees', []),
  ])
  depts.forEach(r => deptCache.set(r.name, r.id))
  sfs.forEach(r => sfCache.set(`${r.department_id}|${r.name}`, r.id))
  regions.forEach(r => regionCache.set(r.name, r.id))
  locs.forEach(r => locCache.set(r.name, r.id))
  desigs.forEach(r => desigCache.set(r.name, r.id))
  emps.forEach(r => empCache.set(r.employee_id, r.id))

  const BATCH = 50
  const allErrors: ValidationError[] = [...parseErrors]
  let successCount = 0

  const caches = { deptCache, sfCache, regionCache, locCache, desigCache, empCache }

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(row => processRmsRow(row, caches, migrated)))
    for (const res of results) {
      if (res === null) continue
      if ('message' in res) { allErrors.push(res) } else { successCount++ }
    }
  }

  const duration = Date.now() - startTime
  if (uploadId) {
    const status = allErrors.length === rows.length && rows.length > 0 ? 'failed' : 'completed'
    await query(
      `UPDATE upload_logs
       SET success_count = $1, error_count = $2, errors = $3, status = $4, completed_at = $5
       WHERE id = $6`,
      [successCount, allErrors.length, JSON.stringify(allErrors.slice(0, 100)), status, new Date().toISOString(), uploadId],
    )
  }

  return { uploadId, fileType: 'rms', totalRows: rows.length, successCount, errorCount: allErrors.length, errors: allErrors, duration }
}

interface Caches {
  deptCache: Map<string, string>; sfCache: Map<string, string>
  regionCache: Map<string, string>; locCache: Map<string, string>
  desigCache: Map<string, string>; empCache: Map<string, string>
}

async function processRmsRow(row: RmsRow, caches: Caches, migrated: boolean): Promise<{ ok: true } | ValidationError | null> {
  try {
    const deptId = row.department ? await resolveOrCreate('departments', 'name', row.department, caches.deptCache) : null

    let subId: string | null = null
    if (row.subFunction && deptId) {
      const cacheKey = `${deptId}|${row.subFunction}`
      if (caches.sfCache.has(cacheKey)) {
        subId = caches.sfCache.get(cacheKey)!
      } else {
        await query(
          `INSERT INTO sub_functions (name, department_id) VALUES ($1, $2)
           ON CONFLICT (department_id, name) DO NOTHING`,
          [row.subFunction, deptId],
        )
        const sfRow = await queryOne<{ id: string }>(
          'SELECT id FROM sub_functions WHERE name = $1 AND department_id = $2 LIMIT 1',
          [row.subFunction, deptId],
        )
        if (sfRow) { subId = sfRow.id; caches.sfCache.set(cacheKey, sfRow.id) }
      }
    }

    const regionId = row.region ? await resolveOrCreate('regions', 'name', row.region, caches.regionCache) : null
    const locId = row.location
      ? await resolveOrCreate('locations', 'name', row.location, caches.locCache, { region_id: regionId, country: row.region || null })
      : null
    const desigId = row.designation ? await resolveOrCreate('designations', 'name', row.designation, caches.desigCache) : null

    const coreFields: Record<string, unknown> = {
      name: row.name, date_of_joining: row.dateOfJoining || null,
      date_of_exit: row.dateOfExit || null, designation_id: desigId,
      department_id: deptId, sub_function_id: subId, location_id: locId,
      email: row.email || null, updated_at: new Date().toISOString(),
    }

    const extFields: Record<string, unknown> = migrated ? {
      employee_status: row.employeeStatus || null, skill_set: row.skillSet || null,
      pm_name: row.pmName || null, pm_email: row.pmEmail || null,
      reporting_partner_email: row.reportingPartnerEmail || null,
    } : {}

    const payload = { ...coreFields, ...extFields }
    const fieldNames = Object.keys(payload)
    const fieldValues = Object.values(payload)

    if (caches.empCache.has(row.employeeId)) {
      const empUuid = caches.empCache.get(row.employeeId)!
      const setClauses = fieldNames.map((f, i) => `"${f}" = $${i + 1}`).join(', ')
      await query(
        `UPDATE employees SET ${setClauses} WHERE id = $${fieldNames.length + 1}`,
        [...fieldValues, empUuid],
      )
    } else {
      // Upsert by employee_id
      const insertFields = ['employee_id', ...fieldNames]
      const insertValues = [row.employeeId, ...fieldValues]
      const insertCols = insertFields.map(f => `"${f}"`).join(', ')
      const insertPlaceholders = insertFields.map((_, i) => `$${i + 1}`).join(', ')
      const updateClauses = fieldNames.map((f, i) => `"${f}" = $${i + 2}`).join(', ')
      const upserted = await queryOne<{ id: string }>(
        `INSERT INTO employees (${insertCols}) VALUES (${insertPlaceholders})
         ON CONFLICT (employee_id) DO UPDATE SET ${updateClauses}
         RETURNING id`,
        insertValues,
      )
      if (!upserted) throw new Error('Employee upsert returned no row')
      caches.empCache.set(row.employeeId, upserted.id)
    }

    return { ok: true }
  } catch (err) {
    return { row: row.rowIndex, field: 'processing', value: row.employeeId, message: err instanceof Error ? err.message : String(err) }
  }
}

export function isRmsFile(firstRow: unknown[]): boolean {
  const headers = firstRow.map(h => String(h ?? '').trim())
  return headers.includes('Employee Status') && headers.includes('Company Email Id')
}
