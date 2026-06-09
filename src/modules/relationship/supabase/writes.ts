/**
 * Relationship page - REAL Supabase writes (2e).
 *
 * Phase 5: notes (team + personal). RLS already guarantees a note can only be
 * written for the viewer's own company (`WITH CHECK company_id = current_company_id()`),
 * and a personal note is readable only by its author - so the write layer just
 * supplies the viewer's company + person and trusts the policy for safety.
 */
import { createClient } from "@/shared/db/client";
import { detectFileType } from "../lib/file-validation";
import type { ArtifactCategory, ArtifactView, NoteScope, NoteView, ScanStatus } from "../types";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

/** The viewer's person id (= auth.uid()) + company id, from the session. */
async function getViewer(
  supabase: SupabaseBrowserClient,
): Promise<{ personId: string; companyId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("relationship: no authenticated user");
  const { data, error } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  if (!data?.company_id) throw new Error("relationship: viewer has no company");
  return { personId: user.id, companyId: data.company_id };
}

/**
 * Create or update the viewer's note of a given scope on a relationship. There
 * is one team note + one personal note per side in the demo UX, so `existingId`
 * (when present) updates that row; otherwise a new row is inserted. Returns the
 * saved note for the caller to swap into local state.
 */
export async function saveNote(input: {
  relationshipId: string;
  scope: NoteScope;
  body: string;
  existingId: string | null;
}): Promise<NoteView> {
  const supabase = createClient();
  const viewer = await getViewer(supabase);
  const body = input.body.trim();
  if (!body) throw new Error("relationship: note body is empty");

  const nowIso = new Date().toISOString();

  if (input.existingId) {
    const { data, error } = await supabase
      .from("relationship_note")
      .update({ body, updated_by: viewer.personId, updated_at: nowIso })
      .eq("id", input.existingId)
      .select("id, scope, body, updated_at")
      .single();
    if (error) throw error;
    return { id: data.id, scope: data.scope as NoteScope, body: data.body, updatedAt: data.updated_at };
  }

  const { data, error } = await supabase
    .from("relationship_note")
    .insert({
      relationship_id: input.relationshipId,
      company_id: viewer.companyId,
      scope: input.scope,
      body,
      created_by: viewer.personId,
      updated_by: viewer.personId,
    })
    .select("id, scope, body, updated_at")
    .single();
  if (error) throw error;
  return { id: data.id, scope: data.scope as NoteScope, body: data.body, updatedAt: data.updated_at };
}

/** Safe object name: keep letters/digits/._-, collapse the rest to "-". */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

const ARTIFACTS_BUCKET = "relationship-artifacts";

/**
 * Upload a relationship-level document. Validates the real file type by magic
 * bytes (not the filename) and the size, puts the object in the private bucket
 * under `<relationshipId>/...` (Storage RLS scopes that folder to relationship
 * members), then records the pointer row.
 *
 * Scan is STUBBED clean for the demo (D2): a real malware scanner is the
 * deferred fast-follow. The upload + download path itself is real.
 */
export async function uploadArtifact(input: {
  relationshipId: string;
  file: File;
  title: string;
  category: ArtifactCategory | null;
}): Promise<ArtifactView> {
  const detected = await detectFileType(input.file);
  if (!detected.ok) throw new Error(detected.reason);

  const supabase = createClient();
  const viewer = await getViewer(supabase);

  const path = `${input.relationshipId}/${crypto.randomUUID()}-${safeName(input.file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(ARTIFACTS_BUCKET)
    .upload(path, input.file, { contentType: detected.mime, upsert: false });
  if (upErr) throw upErr;

  const scanStatus: ScanStatus = "clean"; // stub - real scanner is a fast-follow
  const { data, error } = await supabase
    .from("relationship_artifact")
    .insert({
      relationship_id: input.relationshipId,
      uploaded_by_company_id: viewer.companyId,
      title: input.title.trim() || input.file.name,
      category: input.category,
      storage_path: path,
      original_filename: input.file.name,
      mime_type: detected.mime,
      file_size_bytes: input.file.size,
      scan_status: scanStatus,
      created_by: viewer.personId,
      updated_by: viewer.personId,
    })
    .select(
      "id, title, category, storage_path, original_filename, mime_type, file_size_bytes, scan_status, uploaded_by_company_id, created_at",
    )
    .single();
  if (error) {
    // best-effort cleanup so a failed row insert doesn't orphan the object
    await supabase.storage.from(ARTIFACTS_BUCKET).remove([path]);
    throw error;
  }

  return {
    id: data.id,
    title: data.title,
    category: (data.category as ArtifactCategory | null) ?? null,
    originalFilename: data.original_filename,
    storagePath: data.storage_path,
    mimeType: data.mime_type,
    fileSizeBytes: data.file_size_bytes,
    scanStatus: data.scan_status as ScanStatus,
    uploadedByCompanyId: data.uploaded_by_company_id,
    uploadedAt: data.created_at,
  };
}
