import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const fileType = sp.get('file_type') ?? undefined
  const version = sp.get('version') ?? undefined

  let query = supabaseAdmin().from('file_uploads').select('*').order('created_at', { ascending: false })
  if (fileType) query = query.eq('file_type', fileType)
  if (version) query = query.eq('version', parseInt(version))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ files: data ?? [] })
})
