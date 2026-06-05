import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { ingestExcelFile } from '@/lib/server/ingestion/ingest'
import { parseMonthString } from '@/lib/ingestion/parse-excel'
import { ingestForecastFile } from '@/lib/server/ingestion/ingest-forecast'
import { isForecastTracker } from '@/lib/ingestion/parse-forecast'
import { ingestSkillMappingFile } from '@/lib/server/ingestion/ingest-skill-mapping'
import { isSkillMapping } from '@/lib/ingestion/parse-skill-mapping'
import { ingestRmsFile, isRmsFile } from '@/lib/server/ingestion/ingest-rms'
import { trackFileUpload } from '@/lib/server/file-versioning'
import { logAudit } from '@/lib/server/audit'
import { withAuth } from '@/lib/server/auth'

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']
const MAX_FILE_SIZE = 10 * 1024 * 1024

export const POST = withAuth(async (request: NextRequest, user) => {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const uploaderName = user.name ?? 'System'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: `Invalid file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB` }, { status: 400 })
  }

  let periodOverride: { month: string; year: number } | undefined
  const periodStr = formData.get('period') as string | null
  if (periodStr) {
    const pm = parseMonthString(periodStr)
    if (!pm) {
      return NextResponse.json({ error: `Invalid period format "${periodStr}". Use e.g. "Mar'2026" or "2026-03"` }, { status: 400 })
    }
    const [y, m] = pm.periodStart.split('-')
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    periodOverride = { month: monthNames[parseInt(m) - 1], year: parseInt(y) }
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = arrayBuffer

  const workbook = XLSX.read(buffer, { type: 'array' })
  let isForecast = false
  let isSkillMap = false
  let isRms = false
  for (const sn of workbook.SheetNames) {
    const s = workbook.Sheets[sn]
    const row = (XLSX.utils.sheet_to_json(s, { header: 1 }) as unknown[][])[0] ?? []
    if (isSkillMapping(row)) { isSkillMap = true; break }
    if (isForecastTracker(row)) { isForecast = true; break }
    if (isRmsFile(row)) { isRms = true; break }
  }

  const fileName = file.name

  if (isRms) {
    const result = await ingestRmsFile(buffer, fileName)
    const status = result.errorCount === result.totalRows && result.totalRows > 0 ? 422 : 200
    trackFileUpload({ fileName, fileType: 'rms', fileSize: file.size, uploadLogId: result.uploadId }).catch(err => console.error('[upload] version tracking error:', err))
    logAudit({ action: 'Created', entity: 'Employee', entityName: fileName, entityId: result.uploadId, userName: uploaderName, field: 'file_import', newValue: `Imported ${result.successCount}/${result.totalRows} rows`, metadata: { fileName, fileType: 'rms', fileSize: file.size, totalRows: result.totalRows, successCount: result.successCount, errorCount: result.errorCount, duration: result.duration } }).catch(() => {})
    return NextResponse.json(result, { status })
  }

  if (isSkillMap) {
    const result = await ingestSkillMappingFile(buffer, fileName)
    const status = result.errorCount === result.totalRows && result.totalRows > 0 ? 422 : 200
    trackFileUpload({ fileName, fileType: 'skill_mapping', fileSize: file.size, uploadLogId: result.uploadId }).catch(err => console.error('[upload] version tracking error:', err))
    logAudit({ action: 'Created', entity: 'Employee', entityName: fileName, entityId: result.uploadId, userName: uploaderName, field: 'file_import', newValue: `Imported ${result.successCount}/${result.totalRows} rows`, metadata: { fileName, fileType: 'skill_mapping', fileSize: file.size, totalRows: result.totalRows, successCount: result.successCount, errorCount: result.errorCount, duration: result.duration } }).catch(() => {})
    return NextResponse.json(result, { status })
  }

  if (isForecast) {
    const result = await ingestForecastFile(buffer, fileName)
    const status = result.errorCount === result.totalRows && result.totalRows > 0 ? 422 : 200
    trackFileUpload({ fileName, fileType: 'forecast_tracker', fileSize: file.size, uploadLogId: result.uploadId }).catch(err => console.error('[upload] version tracking error:', err))
    logAudit({ action: 'Created', entity: 'Allocation', entityName: fileName, entityId: result.uploadId, userName: uploaderName, field: 'file_import', newValue: `Imported ${result.successCount}/${result.totalRows} rows`, metadata: { fileName, fileType: 'forecast_tracker', fileSize: file.size, totalRows: result.totalRows, successCount: result.successCount, errorCount: result.errorCount, duration: result.duration } }).catch(() => {})
    return NextResponse.json(result, { status })
  }

  const result = await ingestExcelFile(buffer, fileName, undefined, periodOverride)
  const status = result.errorCount === result.totalRows && result.totalRows > 0 ? 422 : 200
  trackFileUpload({ fileName, fileType: result.fileType ?? 'timesheet_compliance', fileSize: file.size, uploadLogId: result.uploadId }).catch(err => console.error('[upload] version tracking error:', err))
  logAudit({ action: 'Created', entity: 'Allocation', entityName: fileName, entityId: result.uploadId, userName: uploaderName, field: 'file_import', newValue: `Imported ${result.successCount}/${result.totalRows} rows`, metadata: { fileName, fileType: result.fileType ?? 'timesheet_compliance', fileSize: file.size, totalRows: result.totalRows, successCount: result.successCount, errorCount: result.errorCount, duration: result.duration } }).catch(() => {})
  return NextResponse.json(result, { status })
})
