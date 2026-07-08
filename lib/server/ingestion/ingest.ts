import { SupabaseClient } from '@supabase/supabase-js'
import { parseExcelBuffer, detectFileType, parseMonthString } from '@/lib/ingestion/parse-excel'
import { isExcluded } from '@/lib/server/sub-function-normalize'
import type { ParsedRow, ValidationError, FileType } from '@/lib/ingestion/parse-excel'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

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

export function getSupabase(): SupabaseClient {
  return supabaseAdmin()
}

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

  const sb = getSupabase()
  const insertData = { [matchField]: key, ...extra }

  await sb.from(table).upsert(insertData, { onConflict: matchField, ignoreDuplicates: true })

  const { data: row, error } = await sb.from(table).select('id').eq(matchField, key).limit(1).single()
  if (error || !row) throw new Error(`Failed to resolve ${table} "${key}": ${error?.message}`)
  cache.set(key, row.id)
  return row.id
}

async function buildLookupCache(): Promise<LookupCache> {
  const sb = getSupabase()
  const cache: LookupCache = {
    departments: new Map(),
    subFunctions: new Map(),
    regions: new Map(),
    locations: new Map(),
    designations: new Map(),
    employees: new Map(),
  }

  const [depts, subs, regs, locs, desigs, emps] = await Promise.all([
    sb.from('departments').select('id, name'),
    sb.from('sub_functions').select('id, name, department_id'),
    sb.from('regions').select('id, name'),
    sb.from('locations').select('id, name'),
    sb.from('designations').select('id, name'),
    sb.from('employees').select('id, employee_id'),
  ])

  depts.data?.forEach((r: any) => cache.departments.set(r.name, r.id))
  subs.data?.forEach((r: any) => cache.subFunctions.set(`${r.department_id}|${r.name}`, r.id))
  regs.data?.forEach((r: any) => cache.regions.set(r.name, r.id))
  locs.data?.forEach((r: any) => cache.locations.set(r.name, r.id))
  desigs.data?.forEach((r: any) => cache.designations.set(r.name, r.id))
  emps.data?.forEach((r: any) => cache.employees.set(r.employee_id, r.id))

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
  const sb = getSupabase()

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
        const sbClient = getSupabase()
        await sbClient.from('sub_functions').upsert({ name: subName, department_id: deptId }, { onConflict: 'department_id,name', ignoreDuplicates: true })
        const { data: sfRow, error: sfErr } = await sbClient.from('sub_functions').select('id').eq('name', subName).eq('department_id', deptId).limit(1).single()
        if (sfErr || !sfRow) throw new Error(`Failed to resolve sub_functions "${subName}": ${sfErr?.message}`)
        subId = sfRow.id as string
        cache.subFunctions.set(cacheKey, sfRow.id as string)
      }
    }

    const regionName = String(d['Region'] ?? d['Employee Country'] ?? '')
    let regionId: string | null = null
    if (regionName) regionId = await resolveOrCreate('regions', 'name', regionName, cache.regions)

    const locName = String(d['Location'] ?? '')
    let locId: string | null = null
    if (locName) locId = await resolveOrCreate('locations', 'name', locName, cache.locations, { region_id: regionId, country: String(d['Employee Country'] ?? d['Region'] ?? '') })

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
      await sb.from('employees').update({
        name: String(d['Employee Name']),
        designation_id: desigId,
        department_id: deptId,
        sub_function_id: subId,
        location_id: locId,
        employee_region: d['Employee Region'] ? String(d['Employee Region']) : null,
        date_of_joining: d['Date of Joining'] || null,
        date_of_exit: d['Date of Exit'] || null,
        updated_at: new Date().toISOString(),
      }).eq('id', empUuid)
    } else {
      const { data: upserted, error } = await sb.from('employees')
        .upsert({
          employee_id: empCode,
          name: String(d['Employee Name']),
          designation_id: desigId,
          department_id: deptId,
          sub_function_id: subId,
          location_id: locId,
          employee_region: d['Employee Region'] ? String(d['Employee Region']) : null,
          date_of_joining: d['Date of Joining'] || null,
          date_of_exit: d['Date of Exit'] || null,
        }, { onConflict: 'employee_id' })
        .select('id').single()

      if (error) throw new Error(`Employee upsert failed: ${error.message}`)
      empUuid = upserted!.id
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

export async function ingestExcelFile(
  buffer: ArrayBuffer,
  fileName: string,
  uploadedBy?: string,
  periodOverride?: { month: string; year: number },
): Promise<IngestionResult> {
  const startTime = Date.now()
  const sb = getSupabase()

  const parsed = parseExcelBuffer(buffer)
  const fileType = detectFileType(parsed.headers)

  if (fileType === 'unknown') {
    return {
      uploadId: '', fileType, totalRows: 0, successCount: 0, errorCount: 1,
      errors: [{ row: 0, field: '', value: '', message: 'Unrecognized file format.' }],
      duration: Date.now() - startTime,
    }
  }

  const { data: log } = await sb.from('upload_logs').insert({
    file_name: fileName, file_type: fileType, uploaded_by: uploadedBy || null,
    row_count: parsed.totalRows, status: 'processing',
  }).select('id').single()

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
    // Deduplicate by conflict key — keep last occurrence to avoid "cannot affect a row a second time"
    const dedupMap = new Map<string, typeof allComplianceRows[0]>()
    for (const row of allComplianceRows) {
      dedupMap.set(`${row.employee_id}::${row.department_id}::${row.period_start}::${row.period_end}`, row)
    }
    const dedupedRows = [...dedupMap.values()]
    const { error: compError } = await getSupabase().from('timesheet_compliance').upsert(dedupedRows, { onConflict: 'employee_id,department_id,period_start,period_end' })
    if (compError) throw new Error(`Bulk compliance upsert failed: ${compError.message}`)
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
  const sb = getSupabase()
  const duration = Date.now() - startTime

  if (uploadId) {
    await sb.from('upload_logs').update({
      success_count: successCount,
      error_count: errors.length,
      errors: errors.slice(0, 100),
      status: errors.length === totalRows ? 'failed' : 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', uploadId)
  }

  return { uploadId, fileType, totalRows, successCount, errorCount: errors.length, errors, duration }
}
