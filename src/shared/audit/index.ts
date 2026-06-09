import { createClient } from '@/shared/db/server'
import { getCurrentCompanyId } from '@/shared/auth'
import type { Database } from '@/shared/db'

type AuditInsert = Database['public']['Tables']['audit_log']['Insert']

// One audited change. actorType / action / contentType are codes from the audit
// lookup tables (validated by FK at the DB); contentId is the affected row's id.
export type AuditEvent = {
  actorType: string // audit_actor_type.code — 'person' | 'sella' | 'system'
  action: string // audit_action_type.code — e.g. 'relationship.accepted'
  contentType: string // auditable_content_type.code — e.g. 'relationship'
  contentId: string // id of the affected row
  actorPersonId?: string | null
  onBehalfOfPersonId?: string | null
  beforeDiff?: unknown
  afterDiff?: unknown
  reason?: string
  metadata?: Record<string, unknown>
}

// Append one row to the tamper-evident audit_log. company_id is taken from the
// caller's session (RLS requires company_id = the current company). The DB's
// BEFORE INSERT trigger fills sequence_number + the hash chain, so we never set
// those — the cast below hides that the generated type still demands entry_hash.
export async function writeAudit(event: AuditEvent): Promise<void> {
  const supabase = await createClient()
  const companyId = await getCurrentCompanyId()
  if (!companyId) {
    throw new Error('writeAudit: no company in session — cannot audit')
  }

  const row: Omit<AuditInsert, 'entry_hash' | 'prev_entry_hash' | 'sequence_number'> = {
    company_id: companyId,
    actor_type: event.actorType,
    action: event.action,
    content_type: event.contentType,
    content_id: event.contentId,
    actor_person_id: event.actorPersonId ?? null,
    on_behalf_of_person_id: event.onBehalfOfPersonId ?? null,
    before_diff: (event.beforeDiff ?? null) as AuditInsert['before_diff'],
    after_diff: (event.afterDiff ?? null) as AuditInsert['after_diff'],
    reason: event.reason ?? null,
    metadata: (event.metadata ?? {}) as AuditInsert['metadata'],
  }

  const { error } = await supabase.from('audit_log').insert(row as AuditInsert)
  if (error) {
    throw new Error(`writeAudit failed: ${error.message}`)
  }
}
