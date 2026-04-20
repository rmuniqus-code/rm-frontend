/**
 * File Uploads API — versioning (max 2 versions per file type)
 *
 * GET  /api/file-uploads?file_type=forecast_tracker
 *   List uploaded files (active + archived)
 *
 * GET  /api/file-uploads?file_type=forecast_tracker&version=1
 *   Get a specific version
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling, parseInt32 } from '@/lib/api-helpers'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const fileType = url.searchParams.get('file_type')
  const version = url.searchParams.get('version')

  let query = supabaseAdmin()
    .from('file_uploads')
    .select('*')
    .order('created_at', { ascending: false })

  if (fileType) query = query.eq('file_type', fileType)
  if (version) query = query.eq('version', parseInt(version))

  const { data, error } = await query
  if (error) return fail(500, error.message)
  return ok({ files: data ?? [] })
})
