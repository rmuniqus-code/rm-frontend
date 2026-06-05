import { supabaseAdmin } from './supabase-admin'

export type AuditAction = 'Created' | 'Updated' | 'Assigned' | 'Approved' | 'Rejected' | 'Deleted' | 'Alert'
export type AuditEntity = 'Request' | 'Allocation' | 'Employee' | 'Project'

export interface AuditEntry {
  action: AuditAction
  entity: AuditEntity
  entityName?: string
  entityId?: string
  userName: string
  userId?: string | null
  field?: string
  oldValue?: string
  newValue?: string
  metadata?: Record<string, unknown>
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await supabaseAdmin()
      .from('audit_log')
      .insert({
        user_name:   entry.userName,
        user_id:     entry.userId ?? null,
        action:      entry.action,
        entity:      entry.entity,
        entity_name: entry.entityName ?? null,
        entity_id:   entry.entityId ?? null,
        field:       entry.field ?? null,
        old_value:   entry.oldValue ?? null,
        new_value:   entry.newValue ?? null,
        metadata:    entry.metadata ?? {},
      })
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err)
  }
}

export async function logAuditDiff(
  base: Omit<AuditEntry, 'field' | 'oldValue' | 'newValue'>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Promise<void> {
  const changes: { field: string; from: unknown; to: unknown }[] = []

  for (const f of fields) {
    const oldVal = before[f]
    const newVal = after[f]
    if (newVal !== undefined && String(oldVal ?? '') !== String(newVal ?? '')) {
      changes.push({ field: f, from: oldVal ?? null, to: newVal })
    }
  }

  if (changes.length === 0) return

  await logAudit({
    ...base,
    field: changes.length === 1 ? changes[0].field : `${changes.length} fields`,
    oldValue: changes.length === 1 ? String(changes[0].from ?? '') : undefined,
    newValue: changes.length === 1 ? String(changes[0].to ?? '') : undefined,
    metadata: { ...base.metadata, changes },
  })
}
