import { supabaseAdmin } from './supabase-admin'

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
  const sb = supabaseAdmin()

  const { data: existing } = await sb
    .from('file_uploads')
    .select('id, version, is_active')
    .eq('file_type', params.fileType)
    .order('version', { ascending: false })

  const versions = existing ?? []
  const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1

  if (versions.length >= MAX_VERSIONS) {
    const oldest = versions[versions.length - 1]
    await sb.from('file_uploads').update({ is_active: false }).eq('id', oldest.id)
  }

  if (versions.length > 0) {
    await sb.from('file_uploads').update({ is_active: false }).eq('file_type', params.fileType).eq('is_active', true)
  }

  const { data, error } = await sb
    .from('file_uploads')
    .insert({
      file_name:     params.fileName,
      file_type:     params.fileType,
      file_size:     params.fileSize,
      version:       nextVersion,
      upload_log_id: params.uploadLogId ?? null,
      uploaded_by:   params.uploadedBy ?? null,
      is_active:     true,
    })
    .select()
    .single()

  if (error) {
    console.error('[file-versioning] Insert error:', error)
    return null
  }

  if (versions.length >= MAX_VERSIONS) {
    const { data: allVersions } = await sb
      .from('file_uploads')
      .select('id')
      .eq('file_type', params.fileType)
      .order('version', { ascending: false })

    if (allVersions && allVersions.length > MAX_VERSIONS) {
      const toDelete = allVersions.slice(MAX_VERSIONS).map((v: { id: string }) => v.id)
      await sb.from('file_uploads').delete().in('id', toDelete)
    }
  }

  return data
}
