import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

const SL_PREFIX_MAP: Record<string, string> = {
  ARC: 'ARC', ADVISORY: 'ADV', CONSULTING: 'CON', TAX: 'TAX',
  TECHNOLOGY: 'TCH', GRC: 'GRC', SCC: 'SCC', AUDIT: 'ARC',
  FORENSICS: 'FOR', RISK: 'RSK',
}

function serviceLinePrefix(hint: string): string {
  const h = (hint ?? '').trim().toUpperCase()
  for (const [key, code] of Object.entries(SL_PREFIX_MAP)) {
    if (h.startsWith(key) || h.includes(key)) return code
  }
  const clean = h.replace(/[^A-Z]/g, '')
  return (clean.slice(0, 3) || 'GEN').padEnd(3, 'X')
}

export const GET = withAuth(async (request: NextRequest) => {
  const hint = request.nextUrl.searchParams.get('hint') ?? ''
  const year = new Date().getFullYear()
  const prefix = serviceLinePrefix(hint)
  const { data } = await supabaseAdmin().from('projects').select('code').like('code', `%-${year}-%`)
  const maxSeq = (data ?? []).reduce((max: number, p: { code: string | null }) => {
    const parts = (p.code ?? '').split('-')
    const seq = parts.length >= 3 ? (parseInt(parts[parts.length - 1]) || 0) : 0
    return Math.max(max, seq)
  }, 0)
  const code = `${prefix}-${year}-${String(maxSeq + 1).padStart(3, '0')}`
  return NextResponse.json({ code })
})
