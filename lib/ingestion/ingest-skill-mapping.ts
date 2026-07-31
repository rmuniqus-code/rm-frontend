/**
 * Skill Mapping Ingestion Pipeline
 *
 * Flow:
 *   1. Parse Excel → SkillMappingRow[]
 *   2. Build lookup caches (skills, sectors, employees)
 *   3. For each employee row:
 *        a. Resolve employee UUID (by employee_id then email)
 *        b. Build employee_skills inserts (primary + deduped secondary)
 *        c. Build employee_sectors inserts (secondary free-text)
 *        d. Queue primary_sector_id update
 *   4. Batch upsert employee_skills  (onConflict: employee_id, skill_id)
 *   5. Batch upsert employee_sectors (onConflict: employee_id, raw_name)
 *   6. Batch update employees.primary_sector_id
 *   7. Log the upload
 *
 * Idempotent: re-uploading replaces skill data (upsert on unique keys).
 * Employees not already in the DB are skipped with an error entry.
 */

import { query, queryOne } from '@/lib/server/db'
import { parseSkillMappingExcel, buildSecondarySkillList } from './parse-skill-mapping'
import type { ValidationError } from './parse-excel'

// ─── Types ────────────────────────────────────────────────────

export interface SkillMappingIngestionResult {
  uploadId: string
  fileType: 'skill_mapping'
  totalRows: number
  successCount: number
  errorCount: number
  errors: ValidationError[]
  duration: number
}

// ─── Cache ───────────────────────────────────────────────────

interface SkillMappingCache {
  skills: Map<string, string>     // name → uuid
  sectors: Map<string, string>    // name → uuid
  empById: Map<string, string>    // employee_id → uuid
  empByEmail: Map<string, string> // email (lower) → uuid
}

async function buildCache(): Promise<SkillMappingCache> {
  const [skills, sectors, emps] = await Promise.all([
    query<{ id: string; name: string }>('SELECT id, name FROM skills'),
    query<{ id: string; name: string }>('SELECT id, name FROM sectors'),
    query<{ id: string; employee_id: string; email: string | null }>('SELECT id, employee_id, email FROM employees'),
  ])

  return {
    skills:     new Map(skills.map(s => [s.name, s.id])),
    sectors:    new Map(sectors.map(s => [s.name, s.id])),
    empById:    new Map(emps.map(e => [e.employee_id, e.id])),
    empByEmail: new Map(
      emps.filter(e => e.email).map(e => [e.email!.toLowerCase(), e.id]),
    ),
  }
}

// ─── Batch upsert helper ──────────────────────────────────────

const CHUNK = 500

async function upsertChunked<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  conflictCols: string[],
): Promise<void> {
  if (rows.length === 0) return
  const cols = Object.keys(rows[0])
  const updateCols = cols.filter(c => !conflictCols.includes(c))

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const placeholders = chunk.map((_, ri) =>
      `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    ).join(', ')
    const updateSet = updateCols.length > 0
      ? `DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
      : 'DO NOTHING'
    await query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders}
       ON CONFLICT (${conflictCols.join(', ')}) ${updateSet}`,
      chunk.flatMap(r => cols.map(c => r[c])),
    )
  }
}

// ─── Main ingest function ─────────────────────────────────────

export async function ingestSkillMappingFile(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<SkillMappingIngestionResult> {
  const startTime = Date.now()

  // 1. Parse Excel
  const rows = parseSkillMappingExcel(buffer)

  // 2. Create upload log
  const logRow = await queryOne<{ id: string }>(
    `INSERT INTO upload_logs (file_name, file_type, row_count, status)
     VALUES ($1, 'skill_mapping', $2, 'processing') RETURNING id`,
    [fileName, rows.length],
  )
  if (!logRow) throw new Error('upload_logs insert failed')
  const uploadId = logRow.id

  // 3. Build caches
  const cache = await buildCache()

  if (cache.skills.size === 0) {
    throw new Error('skills table is empty — run migration 004_skill_mapping.sql first')
  }

  // 4. Process rows
  const empSkillsInsert: { employee_id: string; skill_id: string; skill_type: string; skill_order: number }[] = []
  const empSectorsInsert: { employee_id: string; sector_id: string | null; raw_name: string }[] = []
  const primarySectorUpdates: { uuid: string; sectorId: string | null }[] = []
  const errors: ValidationError[] = []
  let successCount = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2

    const employeeUuid =
      cache.empById.get(row.employeeId) ??
      cache.empByEmail.get(row.email.toLowerCase())

    if (!employeeUuid) {
      errors.push({
        row: rowNum,
        field: 'Employee ID / Email',
        value: row.employeeId || row.email,
        message: `Employee not found in database (ID: ${row.employeeId}, email: ${row.email})`,
      })
      continue
    }

    if (row.primarySkill) {
      const skillId = cache.skills.get(row.primarySkill)
      if (!skillId) {
        errors.push({ row: rowNum, field: 'Primary Skillset', value: row.primarySkill, message: `Unknown skill "${row.primarySkill}"` })
      } else {
        empSkillsInsert.push({ employee_id: employeeUuid, skill_id: skillId, skill_type: 'primary', skill_order: 1 })
      }
    }

    for (const { skillName, order } of buildSecondarySkillList(row.primarySkill, row.secondarySkills, row.tertiarySkills)) {
      const skillId = cache.skills.get(skillName)
      if (!skillId) {
        errors.push({ row: rowNum, field: 'Secondary/Tertiary Skillset', value: skillName, message: `Unknown skill "${skillName}"` })
        continue
      }
      empSkillsInsert.push({ employee_id: employeeUuid, skill_id: skillId, skill_type: 'secondary', skill_order: order })
    }

    const primarySectorId = row.primarySector ? (cache.sectors.get(row.primarySector) ?? null) : null
    primarySectorUpdates.push({ uuid: employeeUuid, sectorId: primarySectorId })

    for (const raw of row.secondarySectors) {
      empSectorsInsert.push({ employee_id: employeeUuid, sector_id: cache.sectors.get(raw) ?? null, raw_name: raw })
    }

    successCount++
  }

  // 5. Upsert employee_skills
  await upsertChunked('employee_skills', empSkillsInsert, ['employee_id', 'skill_id'])

  // 6. Upsert employee_sectors
  await upsertChunked('employee_sectors', empSectorsInsert, ['employee_id', 'raw_name'])

  // 7. Update employees.primary_sector_id (group by sector to minimise round trips)
  if (primarySectorUpdates.length > 0) {
    const bySector = new Map<string | null, string[]>()
    for (const { uuid, sectorId } of primarySectorUpdates) {
      const key = sectorId ?? null
      const arr = bySector.get(key) ?? []
      arr.push(uuid)
      bySector.set(key, arr)
    }
    for (const [sectorId, uuids] of bySector) {
      for (let i = 0; i < uuids.length; i += CHUNK) {
        const chunk = uuids.slice(i, i + CHUNK)
        const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(', ')
        await query(
          `UPDATE employees SET primary_sector_id = $1 WHERE id IN (${placeholders})`,
          [sectorId, ...chunk],
        )
      }
    }
  }

  // 8. Finalise upload log
  const duration = Date.now() - startTime
  const cappedErrors = errors.slice(0, 100)

  await query(
    `UPDATE upload_logs SET
       success_count = $1, error_count = $2, errors = $3,
       status = $4, completed_at = NOW()
     WHERE id = $5`,
    [
      successCount,
      errors.length,
      JSON.stringify(cappedErrors),
      errors.length === rows.length && rows.length > 0 ? 'failed' : 'completed',
      uploadId,
    ],
  )

  return { uploadId, fileType: 'skill_mapping', totalRows: rows.length, successCount, errorCount: errors.length, errors: cappedErrors, duration }
}
