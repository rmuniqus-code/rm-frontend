/**
 * Over-allocation detection.
 *
 * GET /api/over-allocation?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Returns employees whose summed allocation > 100% in any week.
 *   Cheap: handled by Postgres aggregation, indexed on (employee_id, week_start).
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling, parseISODate } from '@/lib/api-helpers'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const from = parseISODate(url.searchParams.get('from'))
  const to = parseISODate(url.searchParams.get('to'))

  if (!from || !to) return fail(400, 'from and to (YYYY-MM-DD) are required')

  const { data, error } = await supabaseAdmin().rpc('fn_over_allocated', {
    p_from: from,
    p_to: to,
  })

  if (error) return fail(500, error.message)
  return ok({ from, to, conflicts: data, count: data?.length ?? 0 })
})
