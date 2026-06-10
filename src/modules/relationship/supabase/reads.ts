/**
 * Relationship page - REAL Supabase reads (2e, Phase 2).
 *
 * Same shape as messaging/supabase/store.ts: flat, RLS-scoped fetches stitched
 * in JS, viewer from the session. RLS does the side-aware projection for us:
 *   - relationship_note  → only my company's team notes + my own personal notes
 *   - relationship_term  → both sides (relationship-scoped, shared)
 *   - relationship_artifact → both sides read; only the uploader writes
 *   - deal_card          → both sides, but PRIVATE deals are hidden by RLS
 * So whatever these return is already "my view" - no extra filtering here.
 */
import { createClient } from "@/shared/db/client";
import { companyInitials, bucketOf } from "../lib/stats";
import type {
  ArtifactView,
  DealStatus,
  DealSummaryView,
  NoteScope,
  NoteView,
  RelationshipCompany,
  RelationshipView,
  ScanStatus,
  TermTypeCode,
  TermView,
} from "../types";

/** The whole page's data, loaded in one parallel batch (one record, all tabs). */
export interface RelationshipPageData {
  relationship: RelationshipView;
  notes: NoteView[];
  terms: TermView[];
  artifacts: ArtifactView[];
  deals: DealSummaryView[];
}

type Json = Record<string, unknown> | null;

/** metadata.title if the seed set one, else the HS number, else the deal type. */
function dealTitle(metadata: unknown, hsNumber: string | null, dealType: string): string {
  const m = (metadata ?? {}) as Record<string, unknown>;
  if (typeof m.title === "string" && m.title.trim()) return m.title;
  return hsNumber ?? dealType;
}

/**
 * Load everything the relationship page needs for one relationship id. Throws if
 * the relationship is not visible to the viewer (RLS returns no row) - the
 * caller renders a "not found / no access" state.
 */
export async function getRelationshipPageData(
  relationshipId: string,
): Promise<RelationshipPageData> {
  const supabase = createClient();

  // viewer's company - to know which side of the pair is "me"
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("relationship: no authenticated user");
  const { data: viewerPerson, error: vpErr } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", user.id)
    .single();
  if (vpErr) throw vpErr;
  const viewerCompanyId = viewerPerson?.company_id ?? null;

  // the relationship row (RLS: viewer must be a member)
  const { data: rel, error: relErr } = await supabase
    .from("relationship")
    .select("id, company_a_id, company_b_id, status, created_at")
    .eq("id", relationshipId)
    .single();
  if (relErr) throw relErr;

  // the rest, in parallel - all RLS-scoped
  const [cosRes, notesRes, termsRes, termTypesRes, artsRes, dealsRes] = await Promise.all([
    supabase.from("company").select("id, name").in("id", [rel.company_a_id, rel.company_b_id]),
    supabase
      .from("relationship_note")
      .select("id, scope, body, updated_at")
      .eq("relationship_id", relationshipId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("relationship_term")
      .select("id, term_type_code, value, status, superseded_at")
      .eq("relationship_id", relationshipId)
      .eq("status", "accepted")
      .is("superseded_at", null)
      .is("deleted_at", null),
    supabase.from("agreed_term_type").select("code, description, sort_order"),
    supabase
      .from("relationship_artifact")
      .select(
        "id, title, category, storage_path, original_filename, mime_type, file_size_bytes, scan_status, uploaded_by_company_id, created_at",
      )
      .eq("relationship_id", relationshipId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("deal_card")
      .select("id, hs_deal_number, deal_type, status, value_net, currency, metadata, created_at")
      .eq("relationship_id", relationshipId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  for (const r of [cosRes, notesRes, termsRes, termTypesRes, artsRes, dealsRes]) {
    if (r.error) throw r.error;
  }

  // --- relationship header: canonical (a, b) order + my/their side ---
  const coById = new Map((cosRes.data ?? []).map((c) => [c.id, c.name] as const));
  const toCompany = (id: string): RelationshipCompany => {
    const name = coById.get(id) ?? "Unknown company";
    return { id, name, initials: companyInitials(name) };
  };
  const companyA = toCompany(rel.company_a_id);
  const companyB = toCompany(rel.company_b_id);
  const me = rel.company_a_id === viewerCompanyId ? companyA : companyB;
  const them = me.id === companyA.id ? companyB : companyA;

  const relationship: RelationshipView = {
    id: rel.id,
    companies: [companyA, companyB],
    me,
    them,
    status: rel.status,
    connectedAt: rel.created_at,
  };

  // --- notes (already RLS-scoped to my company + my personal) ---
  const notes: NoteView[] = (notesRes.data ?? []).map((n) => ({
    id: n.id,
    scope: n.scope as NoteScope,
    body: n.body,
    updatedAt: n.updated_at,
  }));

  // --- terms: label from the lookup; in-force only (already filtered) ---
  const termLabel = new Map((termTypesRes.data ?? []).map((t) => [t.code, t.description] as const));
  const terms: TermView[] = (termsRes.data ?? []).map((t) => ({
    id: t.id,
    termType: t.term_type_code as TermTypeCode,
    label: termLabel.get(t.term_type_code) ?? t.term_type_code,
    value: t.value,
  }));

  // --- artifacts ---
  const artifacts: ArtifactView[] = (artsRes.data ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    category: (a.category as ArtifactView["category"]) ?? null,
    originalFilename: a.original_filename,
    storagePath: a.storage_path,
    mimeType: a.mime_type,
    fileSizeBytes: a.file_size_bytes,
    scanStatus: a.scan_status as ScanStatus,
    uploadedByCompanyId: a.uploaded_by_company_id,
    uploadedAt: a.created_at,
  }));

  // --- deals (PRIVATE ones already hidden by RLS) ---
  // which of these deals has a live workspace (screen ④)? one batch lookup -
  // the "Open workspace" door only opens for deals that actually have one.
  const dealIds = (dealsRes.data ?? []).map((d) => d.id);
  const withWorkspace = new Set<string>();
  if (dealIds.length) {
    const { data: wsRows, error: wsErr } = await supabase
      .from("deal_workspace")
      .select("deal_card_id")
      .in("deal_card_id", dealIds)
      .is("deleted_at", null);
    if (wsErr) throw wsErr;
    for (const w of wsRows ?? []) withWorkspace.add(w.deal_card_id);
  }
  const deals: DealSummaryView[] = (dealsRes.data ?? []).map((d) => {
    const status = d.status as DealStatus;
    return {
      id: d.id,
      hsNumber: d.hs_deal_number,
      title: dealTitle(d.metadata as Json, d.hs_deal_number, d.deal_type),
      status,
      bucket: bucketOf(status),
      valueNet: d.value_net,
      currency: d.currency,
      createdAt: d.created_at,
      hasWorkspace: withWorkspace.has(d.id),
    };
  });

  return { relationship, notes, terms, artifacts, deals };
}

/**
 * A short-lived signed URL to download one artifact. Storage RLS already gates
 * access (the caller must be a relationship member), so this only succeeds for
 * files the viewer is allowed to see.
 */
export async function getArtifactDownloadUrl(storagePath: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("relationship-artifacts")
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
