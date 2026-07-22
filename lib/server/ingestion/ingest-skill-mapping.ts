import { query, queryOne } from '@/lib/server/db'
import { parseSkillMappingExcel, buildSecondarySkillList } from '@/lib/ingestion/parse-skill-mapping'
import type { ValidationError } from '@/lib/ingestion/parse-excel'

export interface SkillMappingIngestionResult {
  uploadId: string
  fileType: 'skill_mapping'
  totalRows: number
  successCount: number
  errorCount: number
  errors: ValidationError[]
  duration: number
}

interface SkillMappingCache {
  skills: Map<string, string>
  sectors: Map<string, string>
  empById: Map<string, string>
  empByEmail: Map<string, string>
}

async function buildCache(): Promise<SkillMappingCache> {
  const [skills, sectors, emps] = await Promise.all([
    query<{ id: string; name: string }>('SELECT id, name FROM skills', []),
    query<{ id: string; name: string }>('SELECT id, name FROM sectors', []),
    query<{ id: string; employee_id: string; email: string | null }>('SELECT id, employee_id, email FROM employees', []),
  ])
  return {
    skills:    new Map(skills.map(s => [s.name, s.id])),
    sectors:   new Map(sectors.map(s => [s.name, s.id])),
    empById:   new Map(emps.map(e => [e.employee_id, e.id])),
    empByEmail: new Map(emps.filter(e => e.email).map(e => [e.email!.toLowerCase(), e.id])),
  }
}

const CHUNK = 500

async function upsertChunkedEmployeeSkills(
  rows: { employee_id: string; skill_id: string; skill_type: string; skill_order: number }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values: unknown[] = []
    const placeholders = chunk.map((r, idx) => {
      const base = idx * 4
      values.push(r.employee_id, r.skill_id, r.skill_type, r.skill_order)
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
    })
    await query(
      `INSERT INTO employee_skills (employee_id, skill_id, skill_type, skill_order)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (employee_id, skill_id) DO UPDATE
         SET skill_type = EXCLUDED.skill_type, skill_order = EXCLUDED.skill_order`,
      values,
    )
  }
}

async function upsertChunkedEmployeeSectors(
  rows: { employee_id: string; sector_id: string | null; raw_name: string }[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values: unknown[] = []
    const placeholders = chunk.map((r, idx) => {
      const base = idx * 3
      values.push(r.employee_id, r.sector_id, r.raw_name)
      return `($${base + 1}, $${base + 2}, $${base + 3})`
    })
    await query(
      `INSERT INTO employee_sectors (employee_id, sector_id, raw_name)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (employee_id, raw_name) DO UPDATE
         SET sector_id = EXCLUDED.sector_id`,
      values,
    )
  }
}

export async function ingestSkillMappingFile(buffer: ArrayBuffer, fileName: string): Promise<SkillMappingIngestionResult> {
  const startTime = Date.now()

  const rows = parseSkillMappingExcel(buffer)

  const logRow = await queryOne<{ id: string }>(
    `INSERT INTO upload_logs (file_name, file_type, row_count, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [fileName, 'skill_mapping', rows.length, 'processing'],
  )
  if (!logRow) throw new Error('upload_logs insert returned no row')
  const uploadId: string = logRow.id

  const cache = await buildCache()
  if (cache.skills.size === 0) throw new Error('skills table is empty — run migration 004_skill_mapping.sql first')

  const empSkillsInsert: { employee_id: string; skill_id: string; skill_type: string; skill_order: number }[] = []
  const empSectorsInsert: { employee_id: string; sector_id: string | null; raw_name: string }[] = []
  const primarySectorUpdates: { uuid: string; sectorId: string | null }[] = []
  const errors: ValidationError[] = []
  let successCount = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2
    const employeeUuid = cache.empById.get(row.employeeId) ?? cache.empByEmail.get(row.email.toLowerCase())
    if (!employeeUuid) {
      errors.push({ row: rowNum, field: 'Employee ID / Email', value: row.employeeId || row.email, message: `Employee not found (ID: ${row.employeeId}, email: ${row.email})` })
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
      if (!skillId) { errors.push({ row: rowNum, field: 'Secondary/Tertiary Skillset', value: skillName, message: `Unknown skill "${skillName}"` }); continue }
      empSkillsInsert.push({ employee_id: employeeUuid, skill_id: skillId, skill_type: 'secondary', skill_order: order })
    }

    const primarySectorId = row.primarySector ? (cache.sectors.get(row.primarySector) ?? null) : null
    primarySectorUpdates.push({ uuid: employeeUuid, sectorId: primarySectorId })

    for (const raw of row.secondarySectors) {
      empSectorsInsert.push({ employee_id: employeeUuid, sector_id: cache.sectors.get(raw) ?? null, raw_name: raw })
    }

    successCount++
  }

  if (empSkillsInsert.length > 0) await upsertChunkedEmployeeSkills(empSkillsInsert)
  if (empSectorsInsert.length > 0) await upsertChunkedEmployeeSectors(empSectorsInsert)

  if (primarySectorUpdates.length > 0) {
    const bySector = new Map<string | null, string[]>()
    for (const { uuid, sectorId } of primarySectorUpdates) {
      const key = sectorId ?? '__null__'
      if (!bySector.has(key)) bySector.set(key, [])
      bySector.get(key)!.push(uuid)
    }
    for (const [key, uuids] of bySector) {
      const sectorId = key === '__null__' ? null : key
      for (let i = 0; i < uuids.length; i += CHUNK) {
        const chunk = uuids.slice(i, i + CHUNK)
        const placeholders = chunk.map((_, idx) => `$${idx + 2}`).join(', ')
        try {
          await query(
            `UPDATE employees SET primary_sector_id = $1 WHERE id IN (${placeholders})`,
            [sectorId, ...chunk],
          )
        } catch (err) {
          console.error(`[skill-mapping] primary_sector update failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  }

  const duration = Date.now() - startTime
  const cappedErrors = errors.slice(0, 100)
  const status = errors.length === rows.length && rows.length > 0 ? 'failed' : 'completed'
  await query(
    `UPDATE upload_logs
     SET success_count = $1, error_count = $2, errors = $3, status = $4, completed_at = $5
     WHERE id = $6`,
    [successCount, errors.length, JSON.stringify(cappedErrors), status, new Date().toISOString(), uploadId],
  )

  return { uploadId, fileType: 'skill_mapping', totalRows: rows.length, successCount, errorCount: errors.length, errors: cappedErrors, duration }
}
