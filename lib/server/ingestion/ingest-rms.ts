import * as XLSX from 'xlsx'
import { getSupabase } from './ingest'
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
  const sb = getSupabase()
  await sb.from(table).upsert({ [matchField]: key, ...extra }, { onConflict: matchField, ignoreDuplicates: true })
  const { data: row, error } = await sb.from(table).select('id').eq(matchField, key).limit(1).single()
  if (error || !row) throw new Error(`Failed to resolve ${table} "${key}": ${error?.message}`)
  cache.set(key, row.id)
  return row.id
}

async function hasMigration008(): Promise<boolean> {
  const { error } = await getSupabase().from('employees').select('employee_status').limit(1)
  return !error
}

export async function ingestRmsFile(buffer: ArrayBuffer, fileName: string): Promise<RmsIngestionResult> {
  const startTime = Date.now()
  const sb = getSupabase()

  const migrated = await hasMigration008()
  const { rows, errors: parseErrors } = parseRmsBuffer(buffer)

  const { data: log } = await sb.from('upload_logs').insert({
    file_name: fileName, file_type: 'rms', row_count: rows.length, status: 'processing',
  }).select('id').single()
  const uploadId = log?.id ?? ''

  const deptCache = new Map<string, string>()
  const sfCache = new Map<string, string>()
  const regionCache = new Map<string, string>()
  const locCache = new Map<string, string>()
  const desigCache = new Map<string, string>()
  const empCache = new Map<string, string>()

  const [depts, sfs, regions, locs, desigs, emps] = await Promise.all([
    sb.from('departments').select('id, name'),
    sb.from('sub_functions').select('id, name, department_id'),
    sb.from('regions').select('id, name'),
    sb.from('locations').select('id, name'),
    sb.from('designations').select('id, name'),
    sb.from('employees').select('id, employee_id'),
  ])
  depts.data?.forEach((r: any) => deptCache.set(r.name, r.id))
  sfs.data?.forEach((r: any) => sfCache.set(`${r.department_id}|${r.name}`, r.id))
  regions.data?.forEach((r: any) => regionCache.set(r.name, r.id))
  locs.data?.forEach((r: any) => locCache.set(r.name, r.id))
  desigs.data?.forEach((r: any) => desigCache.set(r.name, r.id))
  emps.data?.forEach((r: any) => empCache.set(r.employee_id, r.id))

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
    await sb.from('upload_logs').update({
      success_count: successCount, error_count: allErrors.length,
      errors: allErrors.slice(0, 100),
      status: allErrors.length === rows.length && rows.length > 0 ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', uploadId)
  }

  return { uploadId, fileType: 'rms', totalRows: rows.length, successCount, errorCount: allErrors.length, errors: allErrors, duration }
}

interface Caches {
  deptCache: Map<string, string>; sfCache: Map<string, string>
  regionCache: Map<string, string>; locCache: Map<string, string>
  desigCache: Map<string, string>; empCache: Map<string, string>
}

async function processRmsRow(row: RmsRow, caches: Caches, migrated: boolean): Promise<{ ok: true } | ValidationError | null> {
  const sb = getSupabase()
  try {
    const deptId = row.department ? await resolveOrCreate('departments', 'name', row.department, caches.deptCache) : null

    let subId: string | null = null
    if (row.subFunction && deptId) {
      const cacheKey = `${deptId}|${row.subFunction}`
      if (caches.sfCache.has(cacheKey)) {
        subId = caches.sfCache.get(cacheKey)!
      } else {
        await sb.from('sub_functions').upsert({ name: row.subFunction, department_id: deptId }, { onConflict: 'department_id,name', ignoreDuplicates: true })
        const { data: sfRow } = await sb.from('sub_functions').select('id').eq('name', row.subFunction).eq('department_id', deptId).limit(1).single()
        if (sfRow) { subId = sfRow.id as string; caches.sfCache.set(cacheKey, sfRow.id as string) }
      }
    }

    const regionId = row.region ? await resolveOrCreate('regions', 'name', row.region, caches.regionCache) : null
    const locId = row.location ? await resolveOrCreate('locations', 'name', row.location, caches.locCache, { region_id: regionId, country: row.region || null }) : null
    const desigId = row.designation ? await resolveOrCreate('designations', 'name', row.designation, caches.desigCache) : null

    const corePayload: Record<string, unknown> = {
      name: row.name, date_of_joining: row.dateOfJoining || null,
      date_of_exit: row.dateOfExit || null, designation_id: desigId,
      department_id: deptId, sub_function_id: subId, location_id: locId,
      email: row.email || null, updated_at: new Date().toISOString(),
    }

    const extPayload: Record<string, unknown> = migrated ? {
      employee_status: row.employeeStatus || null, skill_set: row.skillSet || null,
      pm_name: row.pmName || null, pm_email: row.pmEmail || null,
      reporting_partner_email: row.reportingPartnerEmail || null,
    } : {}

    const empPayload = { ...corePayload, ...extPayload }

    if (caches.empCache.has(row.employeeId)) {
      const empUuid = caches.empCache.get(row.employeeId)!
      const { error } = await sb.from('employees').update(empPayload).eq('id', empUuid)
      if (error) throw new Error(`Employee update failed: ${error.message}`)
    } else {
      const { data: upserted, error } = await sb.from('employees')
        .upsert({ employee_id: row.employeeId, ...empPayload }, { onConflict: 'employee_id' })
        .select('id').single()
      if (error) throw new Error(`Employee upsert failed: ${error.message}`)
      caches.empCache.set(row.employeeId, upserted!.id)
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
