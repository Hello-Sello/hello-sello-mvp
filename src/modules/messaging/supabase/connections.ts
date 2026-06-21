/**
 * Connections directory read for the new-chat picker (phase 04B / plan 01).
 *
 * `getMyConnections()` returns the viewer's connected companies and, per
 * company, the people the viewer is allowed to see. It is the BACKEND half of
 * the "+ New chat" dropdown (D-01, D-07): only CONNECTED companies/people, no
 * strangers - the multi-tenant RLS (`company_select` + `can_see_person` +
 * `shares_connection_with_company`, migration 20260609183000) already projects
 * exactly "my view", so this read QUERIES within those policies and never
 * widens them. It uses ONLY the authenticated `createClient()` - never the
 * service role (the whole read rides on RLS; bypassing it would leak tenants).
 *
 * Shape mirrors the house "flat RLS-scoped fetch + stitch in JS" read
 * (store.ts getConversations): fetch each table flat (RLS auto-scopes), build
 * Maps by id, stitch the view. Open-deal counts (D-06) come from a
 * self-contained `deal_card` query counted by the pure
 * `countOpenDealsByRelationship` helper - this module does NOT import the deals
 * module (its count read is not barrel-exported; reaching in would widen this
 * plan's footprint - RESEARCH Pitfall 3).
 */
import { createClient } from "@/shared/db/client";
import { countOpenDealsByRelationship } from "../lib/connections-shape";
import type {
  ConnectedCompany,
  ConnectedPerson,
  MyConnectionsView,
} from "../types";

type SupabaseBrowserClient = ReturnType<typeof createClient>;

function personInitials(first: string | null | undefined, last: string | null | undefined): string {
  const i = ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
  return i || "?";
}

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "").join("");
  return (letters || name[0] || "?").toUpperCase();
}

/** The viewer's person id + company id, from the session (copied from store.ts). */
async function getViewer(
  supabase: SupabaseBrowserClient,
): Promise<{ personId: string; companyId: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("messaging: no authenticated user");
  const { data, error } = await supabase
    .from("person")
    .select("id, company_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return { personId: user.id, companyId: data?.company_id ?? null };
}

/** Read `person.metadata.role` only if it is a non-empty string; else null. */
function roleFromMetadata(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object") {
    const v = (metadata as Record<string, unknown>).role;
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/**
 * Every company the viewer is connected to, with its visible people, contacts
 * count, connected-since date, city, and open-deal count. Newest-connected
 * first. RLS-scoped: only the viewer's own connections are returned.
 */
export async function getMyConnections(): Promise<MyConnectionsView> {
  const supabase = createClient();
  const viewer = await getViewer(supabase);

  // Flat, RLS-scoped fetches; stitched in JS (mirrors getConversations).
  const [relsRes, cosRes, pplRes] = await Promise.all([
    supabase
      .from("relationship")
      .select("id, company_a_id, company_b_id, created_at, status")
      .is("deleted_at", null),
    supabase.from("company").select("id, name, city"),
    supabase
      .from("person")
      .select("id, company_id, display_name, first_name, last_name, metadata")
      .is("deleted_at", null),
  ]);
  for (const r of [relsRes, cosRes, pplRes]) {
    if (r.error) throw r.error;
  }

  const companyById = new Map((cosRes.data ?? []).map((c) => [c.id, c] as const));

  // Group the visible people by their company so each connected company can
  // collect its own contacts in one pass.
  const peopleByCompany = new Map<string, ConnectedPerson[]>();
  for (const p of pplRes.data ?? []) {
    if (!p.company_id) continue;
    const name = (p.display_name ?? `${p.first_name} ${p.last_name}`).trim() || "Unknown";
    const person: ConnectedPerson = {
      personId: p.id,
      name,
      initials: personInitials(p.first_name, p.last_name),
      role: roleFromMetadata(p.metadata),
    };
    const list = peopleByCompany.get(p.company_id);
    if (list) list.push(person);
    else peopleByCompany.set(p.company_id, [person]);
  }

  // The visible relationships -> the OTHER company per relationship (D-01).
  const rels = (relsRes.data ?? []).filter((r) => r.status === "active");
  const relIds = rels.map((r) => r.id);

  // Self-contained open-deal count (D-06) - no deals-module import (Pitfall 3).
  const openCountByRel = new Map<string, number>();
  if (relIds.length) {
    const { data: cards, error: cardsErr } = await supabase
      .from("deal_card")
      .select("id, status, relationship_id")
      .in("relationship_id", relIds)
      .is("deleted_at", null);
    if (cardsErr) throw cardsErr;
    const counts = countOpenDealsByRelationship(
      (cards ?? []).map((c) => ({ relationship_id: c.relationship_id, status: c.status })),
    );
    for (const [relId, n] of counts) openCountByRel.set(relId, n);
  }

  const companies: ConnectedCompany[] = [];
  for (const rel of rels) {
    const otherCompanyId =
      rel.company_a_id === viewer.companyId ? rel.company_b_id : rel.company_a_id;
    const co = companyById.get(otherCompanyId);
    if (!co) continue; // RLS hid the company (defensive); skip
    const people = peopleByCompany.get(otherCompanyId) ?? [];
    companies.push({
      companyId: otherCompanyId,
      relationshipId: rel.id,
      name: co.name,
      city: co.city,
      initials: companyInitials(co.name),
      contactsCount: people.length,
      connectedAt: rel.created_at,
      openDealCount: openCountByRel.get(rel.id) ?? 0,
      people,
    });
  }

  // Newest connection first (drives the "New connections by date" section).
  companies.sort((a, b) => (b.connectedAt ?? "").localeCompare(a.connectedAt ?? ""));
  return { companies };
}
