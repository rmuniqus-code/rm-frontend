import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const fileType = sp.get('file_type') ?? undefined
  const version = sp.get('version') ?? undefined

  const params: unknown[] = []
  const conditions: string[] = []

  if (fileType) {
    params.push(fileType)
    conditions.push(`file_type = $${params.length}`)
  }
  if (version) {
    params.push(parseInt(version, 10))
    conditions.push(`version = $${params.length}`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const files = await query<Record<string, unknown>>(
      `SELECT * FROM file_uploads ${where} ORDER BY created_at DESC`,
      params,
    )
    return NextResponse.json({ files })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
