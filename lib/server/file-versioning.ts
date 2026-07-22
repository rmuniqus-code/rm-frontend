import { query, queryOne } from '@/lib/server/db'

const MAX_VERSIONS = 2

interface TrackFileParams {
  fileName: string
  fileType: string
  fileSize: number
  uploadLogId?: string
  uploadedBy?: string
}

interface FileUploadRecord {
  id: string
  file_name: string
  file_type: string
  version: number
  is_active: boolean
  created_at: string
}

export async function trackFileUpload(params: TrackFileParams): Promise<FileUploadRecord | null> {
  const existing = await query<{ id: string; version: number; is_active: boolean }>(
    `SELECT id, version, is_active FROM file_uploads WHERE file_type = $1 ORDER BY version DESC`,
    [params.fileType],
  )

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1

  if (existing.length >= MAX_VERSIONS) {
    const oldest = existing[existing.length - 1]
    await query(`UPDATE file_uploads SET is_active = false WHERE id = $1`, [oldest.id])
  }

  if (existing.length > 0) {
    await query(
      `UPDATE file_uploads SET is_active = false WHERE file_type = $1 AND is_active = true`,
      [params.fileType],
    )
  }

  const inserted = await queryOne<FileUploadRecord>(
    `INSERT INTO file_uploads (file_name, file_type, file_size, version, upload_log_id, uploaded_by, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.fileName,
      params.fileType,
      params.fileSize,
      nextVersion,
      params.uploadLogId ?? null,
      params.uploadedBy ?? null,
      true,
    ],
  )

  if (!inserted) {
    console.error('[file-versioning] Insert returned no row')
    return null
  }

  if (existing.length >= MAX_VERSIONS) {
    const allVersions = await query<{ id: string }>(
      `SELECT id FROM file_uploads WHERE file_type = $1 ORDER BY version DESC`,
      [params.fileType],
    )
    if (allVersions.length > MAX_VERSIONS) {
      const toDelete = allVersions.slice(MAX_VERSIONS).map(v => v.id)
      await query(
        `DELETE FROM file_uploads WHERE id = ANY($1::uuid[])`,
        [toDelete],
      )
    }
  }

  return inserted
}
