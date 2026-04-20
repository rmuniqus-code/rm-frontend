/**
 * POST /api/upload
 *
 * Accepts multipart/form-data with an Excel file.
 * Parses, validates, and ingests into Supabase.
 *
 * Request body (FormData):
 *   file      - Excel file (.xlsx, .xls, .csv)
 *   period    - Optional period override, e.g. "Mar-2026"
 *
 * Response:
 *   { uploadId, fileType, totalRows, successCount, errorCount, errors, duration }
 */

import { NextRequest, NextResponse } from 'next/server'
import { ingestExcelFile } from '@/lib/ingestion/ingest'
import { parseMonthString } from '@/lib/ingestion/parse-excel'
import { ingestForecastFile } from '@/lib/ingestion/ingest-forecast'
import { isForecastTracker } from '@/lib/ingestion/parse-forecast'
import { ingestSkillMappingFile } from '@/lib/ingestion/ingest-skill-mapping'
import { isSkillMapping } from '@/lib/ingestion/parse-skill-mapping'
import { trackFileUpload } from '@/lib/file-versioning'
import { logAudit } from '@/lib/audit'
import * as XLSX from 'xlsx'

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Invalid file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      )
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB` },
        { status: 400 },
      )
    }

    // Parse period override
    let periodOverride: { month: string; year: number } | undefined
    const periodStr = formData.get('period') as string | null
    if (periodStr) {
      const pm = parseMonthString(periodStr)
      if (!pm) {
        return NextResponse.json(
          { error: `Invalid period format "${periodStr}". Use e.g. "Mar'2026" or "2026-03"` },
          { status: 400 },
        )
      }
      const [y, m] = pm.periodStart.split('-')
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      periodOverride = { month: monthNames[parseInt(m) - 1], year: parseInt(y) }
    }

    // Read file buffer
    const buffer = await file.arrayBuffer()

    // Detect file type: peek at headers across all sheets.
    const workbook = XLSX.read(buffer, { type: 'array' })
    let isForecast = false
    let isSkillMap = false
    for (const sn of workbook.SheetNames) {
      const s = workbook.Sheets[sn]
      const row = (XLSX.utils.sheet_to_json(s, { header: 1 }) as unknown[][])[0] ?? []
      if (isSkillMapping(row)) { isSkillMap = true; break }
      if (isForecastTracker(row)) { isForecast = true; break }
    }

    if (isSkillMap) {
      const result = await ingestSkillMappingFile(buffer, file.name)
      const status = result.errorCount === result.totalRows && result.totalRows > 0 ? 422 : 200

      trackFileUpload({
        fileName: file.name,
        fileType: 'skill_mapping',
        fileSize: file.size,
        uploadLogId: result.uploadId,
      }).catch(err => console.error('[upload] version tracking error:', err))

      logAudit({
        action: 'Created',
        entity: 'Employee',
        entityName: file.name,
        entityId: result.uploadId,
        userName: 'System',
        field: 'file_import',
        newValue: `Imported ${result.successCount}/${result.totalRows} rows`,
        metadata: {
          fileName: file.name,
          fileType: 'skill_mapping',
          fileSize: file.size,
          totalRows: result.totalRows,
          successCount: result.successCount,
          errorCount: result.errorCount,
          duration: result.duration,
        },
      }).catch(() => {})

      return NextResponse.json(result, { status })
    }

    if (isForecast) {
      // Route to forecast tracker pipeline
      const result = await ingestForecastFile(buffer, file.name)
      const status = result.errorCount === result.totalRows && result.totalRows > 0 ? 422 : 200

      // Track file version (non-blocking)
      trackFileUpload({
        fileName: file.name,
        fileType: 'forecast_tracker',
        fileSize: file.size,
        uploadLogId: result.uploadId,
      }).catch(err => console.error('[upload] version tracking error:', err))

      // Audit trail for file import
      logAudit({
        action: 'Created',
        entity: 'Allocation',
        entityName: file.name,
        entityId: result.uploadId,
        userName: 'System',
        field: 'file_import',
        newValue: `Imported ${result.successCount}/${result.totalRows} rows`,
        metadata: {
          fileName: file.name,
          fileType: 'forecast_tracker',
          fileSize: file.size,
          totalRows: result.totalRows,
          successCount: result.successCount,
          errorCount: result.errorCount,
          duration: result.duration,
        },
      }).catch(() => {})

      return NextResponse.json(result, { status })
    }

    // Route to compliance/regionwise pipeline
    const result = await ingestExcelFile(buffer, file.name, undefined, periodOverride)

    const status = result.errorCount === result.totalRows && result.totalRows > 0 ? 422 : 200

    // Track file version (non-blocking)
    trackFileUpload({
      fileName: file.name,
      fileType: result.fileType ?? 'timesheet_compliance',
      fileSize: file.size,
      uploadLogId: result.uploadId,
    }).catch(err => console.error('[upload] version tracking error:', err))

    // Audit trail for file import
    logAudit({
      action: 'Created',
      entity: 'Allocation',
      entityName: file.name,
      entityId: result.uploadId,
      userName: 'System',
      field: 'file_import',
      newValue: `Imported ${result.successCount}/${result.totalRows} rows`,
      metadata: {
        fileName: file.name,
        fileType: result.fileType ?? 'timesheet_compliance',
        fileSize: file.size,
        totalRows: result.totalRows,
        successCount: result.successCount,
        errorCount: result.errorCount,
        duration: result.duration,
      },
    }).catch(() => {})

    return NextResponse.json(result, { status })
  } catch (err) {
    console.error('[upload] Ingestion error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
