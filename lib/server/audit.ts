import { query } from '@/lib/server/db'

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
    await query(
      `INSERT INTO audit_log
         (user_name, user_id, action, entity, entity_name, entity_id, field, old_value, new_value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.userName,
        entry.userId ?? null,
        entry.action,
        entry.entity,
        entry.entityName ?? null,
        entry.entityId ?? null,
        entry.field ?? null,
        entry.oldValue ?? null,
        entry.newValue ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    )
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
