import { supabaseAdmin } from './supabase-admin'

export async function resolveEmployeeIdByEmail(email?: string | null): Promise<string | null> {
  if (!email) return null
  const { data } = await supabaseAdmin().from('employees').select('id').ilike('email', email.trim()).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function resolveEmployeeIdByName(name?: string | null): Promise<string | null> {
  if (!name) return null
  const { data } = await supabaseAdmin().from('employees').select('id').ilike('name', name.trim()).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export interface AllocationNotificationMetadata {
  resourceName: string
  roleSkill: string | null
  startDate: string
  endDate: string
  loadingPct: number
  projectName: string
  projectCode: string | null
  emEpName: string | null
  projectDescription: string | null
}

interface NotificationPayload {
  type: string
  title: string
  message: string
  recipientId?: string | null
  relatedEntityType?: string | null
  relatedEntityId?: string | null
  metadata?: AllocationNotificationMetadata | null
}

export async function emitNotification(payload: NotificationPayload): Promise<void> {
  try {
    await supabaseAdmin().from('notifications').insert({
      type:                payload.type,
      title:               payload.title,
      message:             payload.message,
      recipient_id:        payload.recipientId ?? null,
      related_entity_type: payload.relatedEntityType ?? null,
      related_entity_id:   payload.relatedEntityId ?? null,
      metadata:            payload.metadata ?? null,
    })
  } catch (err) {
    console.error('[notify] Failed to emit notification:', err)
  }
}

export async function notifyRequestRaised(requestId: string, projectName: string, roleName: string): Promise<void> {
  await emitNotification({
    type: 'request_raised',
    title: 'New Resource Request',
    message: `Request raised for ${roleName} on ${projectName}`,
    relatedEntityType: 'resource_request',
    relatedEntityId: requestId,
  })
}

export async function notifyAllocationConfirmed(opts: {
  requestId: string
  resourceEmployeeId: string
  resourceName: string
  roleSkill: string | null
  startDate: string
  endDate: string
  loadingPct: number
  projectName: string
  projectCode: string | null
  emEpName: string | null
  projectDescription: string | null
  actorEmployeeId: string | null
}): Promise<void> {
  const metadata: AllocationNotificationMetadata = {
    resourceName:       opts.resourceName,
    roleSkill:          opts.roleSkill,
    startDate:          opts.startDate,
    endDate:            opts.endDate,
    loadingPct:         opts.loadingPct,
    projectName:        opts.projectName,
    projectCode:        opts.projectCode,
    emEpName:           opts.emEpName,
    projectDescription: opts.projectDescription,
  }

  const title   = 'Resource Booking Confirmed'
  const message = `${opts.resourceName} allocated to ${opts.projectName} (${opts.startDate} – ${opts.endDate})`
  const emitSafe = async (payload: NotificationPayload) => {
    try { await emitNotification(payload) } catch (err) { console.error('[notify]', err) }
  }

  const base = {
    type: 'booking_confirmed', title, message,
    relatedEntityType: 'resource_request', relatedEntityId: opts.requestId, metadata,
  }

  const notified = new Set<string>()
  await emitSafe({ ...base, recipientId: opts.resourceEmployeeId })
  notified.add(opts.resourceEmployeeId)

  const emEpEmployeeId = await resolveEmployeeIdByName(opts.emEpName)
  if (emEpEmployeeId && !notified.has(emEpEmployeeId)) {
    await emitSafe({ ...base, recipientId: emEpEmployeeId })
    notified.add(emEpEmployeeId)
  }

  if (opts.actorEmployeeId && !notified.has(opts.actorEmployeeId)) {
    await emitSafe({ ...base, recipientId: opts.actorEmployeeId })
    notified.add(opts.actorEmployeeId)
  }
}

export async function notifyAllocationAction(opts: {
  action: 'created' | 'updated' | 'deleted' | 'extended' | 'status_changed'
  employeeName: string | null
  projectName: string | null
  change: string
  resourceEmployeeId: string | null
  actorEmployeeId: string | null
  actorName: string
  relatedEntityId?: string | null
}): Promise<void> {
  const { action, employeeName, projectName, change, resourceEmployeeId, actorEmployeeId, relatedEntityId } = opts
  const resource = employeeName ?? 'Resource'
  const project  = projectName  ?? 'project'

  const actionTitles: Record<string, string> = {
    created:        'New Allocation',
    updated:        'Allocation Updated',
    deleted:        'Allocation Removed',
    extended:       'Allocation Extended',
    status_changed: 'Allocation Status Changed',
  }
  const title = actionTitles[action] ?? 'Allocation Changed'

  const emitSafe = async (payload: Parameters<typeof emitNotification>[0]) => {
    try { await emitNotification(payload) } catch (err) { console.error('[notify]', err) }
  }

  if (resourceEmployeeId) {
    await emitSafe({
      type: 'allocation_updated', title,
      message: `Your allocation on ${project}: ${change}`,
      recipientId: resourceEmployeeId,
      relatedEntityType: 'forecast_allocation',
      relatedEntityId: relatedEntityId ?? null,
    })
  }

  if (actorEmployeeId && actorEmployeeId !== resourceEmployeeId) {
    await emitSafe({
      type: 'allocation_updated',
      title: `${title} — Confirmed`,
      message: `${resource}'s allocation on ${project}: ${change}`,
      recipientId: actorEmployeeId,
      relatedEntityType: 'forecast_allocation',
      relatedEntityId: relatedEntityId ?? null,
    })
  }
}
