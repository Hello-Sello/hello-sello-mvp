/**
 * Connect inbox - MOCK data + accessor. **The only throwaway file in 2a.**
 *
 * Swap plan (2b / real data): delete the seed array below and re-implement
 * `getInbox` + the mutators against Supabase via `@/shared/db`. The signatures
 * here are already async + return `InboxItemView`, so the swap is a body
 * rewrite - no component changes. Everything outside this file is real.
 *
 * Anchored on the live seed identities where they exist:
 *   GreenLeaf Cultivation = aaaaaaaa-... (the viewer/receiver company)
 *   Alice Green           = 11111111-... (viewer)
 *   StonePharm / Bob      = bbbbbbbb-... / 22222222-... (one real sender)
 * Other senders + the two extra GreenLeaf teammates are invented for queue
 * volume (the seed only has 2 companies) and use clearly-fake UUIDs.
 */
import type {
  InboxDealCardPreview,
  InboxItemView,
  InboxRequestType,
  InboxStatus,
  TeamMember,
  ViewerContext,
} from "@/modules/connect/types";
import { acceptInbox } from "@/modules/messaging";

// --- identities -------------------------------------------------------------

/** The viewing company - all inbound items have this as receiver_company_id. */
const GREENLEAF_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** GreenLeaf's people - the assignable owners for the reassign dropdown. */
const TEAM: TeamMember[] = [
  { personId: "11111111-1111-1111-1111-111111111111", displayName: "Alice Green", initials: "AG", isAdmin: true },
  { personId: "cccccccc-0000-0000-0000-000000000001", displayName: "Jonas Weber", initials: "JW", isAdmin: false },
  { personId: "cccccccc-0000-0000-0000-000000000002", displayName: "Lena Vogt", initials: "LV", isAdmin: false },
];

/** Who is looking at the inbox. Alice is GreenLeaf's superadmin (seed creator). */
export const VIEWER: ViewerContext = {
  personId: "11111111-1111-1111-1111-111111111111",
  isAdmin: true,
};

/** Teammates a ticket can be (re)assigned to. */
export function getAssignableMembers(): TeamMember[] {
  return TEAM;
}

function resolveMember(personId: string | null): TeamMember | null {
  if (!personId) return null;
  return TEAM.find((m) => m.personId === personId) ?? null;
}

// --- senders (other companies contacting GreenLeaf) -------------------------

interface Sender {
  companyId: string;
  companyName: string;
  initials: string;
  verified: boolean;
  personId: string;
}

const SENDERS = {
  stonepharm: { companyId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", companyName: "StonePharm", initials: "SP", verified: true, personId: "22222222-2222-2222-2222-222222222222" },
  gruenApo: { companyId: "dddddddd-0000-0000-0000-000000000001", companyName: "GrünApo Berlin", initials: "GA", verified: true, personId: "eeeeeeee-0000-0000-0000-000000000001" },
  nordPharma: { companyId: "dddddddd-0000-0000-0000-000000000002", companyName: "NordPharma", initials: "NP", verified: true, personId: "eeeeeeee-0000-0000-0000-000000000002" },
  apothekeMitte: { companyId: "dddddddd-0000-0000-0000-000000000003", companyName: "Apotheke Mitte", initials: "AM", verified: true, personId: "eeeeeeee-0000-0000-0000-000000000003" },
  berlinClinic: { companyId: "dddddddd-0000-0000-0000-000000000004", companyName: "Berlin Cannabis Clinic", initials: "BC", verified: true, personId: "eeeeeeee-0000-0000-0000-000000000004" },
  cannaCare: { companyId: "dddddddd-0000-0000-0000-000000000005", companyName: "CannaCare GmbH", initials: "CC", verified: true, personId: "eeeeeeee-0000-0000-0000-000000000005" },
  rheinPharma: { companyId: "dddddddd-0000-0000-0000-000000000006", companyName: "RheinPharma", initials: "RP", verified: true, personId: "eeeeeeee-0000-0000-0000-000000000006" },
  quickMeds: { companyId: "dddddddd-0000-0000-0000-000000000007", companyName: "QuickMeds", initials: "QM", verified: false, personId: "eeeeeeee-0000-0000-0000-000000000007" },
} satisfies Record<string, Sender>;

// --- item factory -----------------------------------------------------------

let seq = 0;

function makeItem(input: {
  sender: Sender;
  type: InboxRequestType;
  createdAt: string;
  status?: InboxStatus;
  note?: string | null;
  assignedTo?: string | null;
  assignedBy?: string | null;
  mutualCount?: number;
  dealCard?: InboxDealCardPreview | null;
}): InboxItemView {
  const assignedTo = input.assignedTo ?? null;
  const dealCard = input.dealCard ?? null;
  const id = `inb_${String(seq++).padStart(2, "0")}`;
  return {
    // --- pending_inbox_item row (schema-shaped) ---
    id,
    type: input.type,
    status: input.status ?? "pending",
    note: input.note ?? null,
    sender_company_id: input.sender.companyId,
    sender_person_id: input.sender.personId,
    receiver_company_id: GREENLEAF_ID,
    assigned_to: assignedTo,
    assigned_by: input.assignedBy ?? null,
    assigned_at: assignedTo ? input.createdAt : null,
    deal_card_id: dealCard ? `dc_${id}` : null,
    metadata: {},
    created_at: input.createdAt,
    updated_at: input.createdAt,
    deleted_at: null,
    // --- view projection (joined/derived) ---
    sender: {
      companyId: input.sender.companyId,
      companyName: input.sender.companyName,
      initials: input.sender.initials,
      verified: input.sender.verified,
    },
    assignee: resolveMember(assignedTo),
    mutualCount: input.mutualCount ?? 0,
    dealCard,
  };
}

// --- seed -------------------------------------------------------------------
// 8 items spanning all 4 types, all 3 statuses, and every assignment state:
//   Unassigned lens -> inb_00, inb_01, inb_07   (pending + assigned_to null)
//   Mine lens       -> inb_02                    (pending + assigned to Alice)
//   All lens        -> every pending item        (6)
//   History lens    -> inb_05 (accepted), inb_06 (rejected)

const store: InboxItemView[] = [
  makeItem({
    sender: SENDERS.stonepharm,
    type: "pricelist_request",
    createdAt: "2026-06-07T14:20:00.000Z",
    mutualCount: 2,
  }),
  makeItem({
    sender: SENDERS.gruenApo,
    type: "connect_message",
    createdAt: "2026-06-07T08:10:00.000Z",
    note: "We're expanding our medical cannabis range and would love to connect about your indica strains.",
    mutualCount: 1,
  }),
  makeItem({
    sender: SENDERS.nordPharma,
    type: "deal_card",
    createdAt: "2026-06-07T11:05:00.000Z",
    assignedTo: "11111111-1111-1111-1111-111111111111", // me (Alice), self-claimed
    mutualCount: 3,
    dealCard: { product: "CBD Isolate 99%", quantity: "8 kg", unitPrice: "€2,300 / kg", total: "€18,400", delivery: "Sept 2026" },
  }),
  makeItem({
    sender: SENDERS.apothekeMitte,
    type: "connect",
    createdAt: "2026-06-06T16:40:00.000Z",
    assignedTo: "cccccccc-0000-0000-0000-000000000001", // Jonas - someone else (collision cue)
    mutualCount: 0,
  }),
  makeItem({
    sender: SENDERS.berlinClinic,
    type: "connect_message",
    createdAt: "2026-06-06T09:15:00.000Z",
    note: "Interested in a recurring supply agreement - can we talk volumes?",
    assignedTo: "cccccccc-0000-0000-0000-000000000002", // Lena - someone else
    mutualCount: 1,
  }),
  makeItem({
    sender: SENDERS.cannaCare,
    type: "pricelist_request",
    createdAt: "2026-06-05T17:30:00.000Z",
    status: "accepted",
    assignedTo: "11111111-1111-1111-1111-111111111111",
    mutualCount: 4,
  }),
  makeItem({
    sender: SENDERS.rheinPharma,
    type: "connect",
    createdAt: "2026-06-04T10:00:00.000Z",
    status: "rejected",
    mutualCount: 0,
  }),
  makeItem({
    sender: SENDERS.quickMeds,
    type: "deal_card",
    createdAt: "2026-06-03T13:45:00.000Z",
    mutualCount: 0,
    dealCard: { product: "Dried Flower · Indica", quantity: "5 kg", unitPrice: "€4.20 / g", total: "€21,000", delivery: "01 Aug 2026" },
  }),
];

// --- accessor + mutators ----------------------------------------------------
// Async on purpose: matches the real Supabase shape so the swap is a body
// rewrite, not a component change. Returns clones so callers can't mutate store.

const nowIso = () => new Date().toISOString();

function findOrThrow(itemId: string): InboxItemView {
  const item = store.find((x) => x.id === itemId);
  if (!item) throw new Error(`Inbox item not found: ${itemId}`);
  return item;
}

/** The inbox queue for the viewing company. */
export async function getInbox(): Promise<InboxItemView[]> {
  return structuredClone(store);
}

/**
 * Claim an UNASSIGNED ticket (first-come, first-served). Self-assign:
 * assigned_by stays null. Throws if already owned - no forceful take-over (§2).
 */
export async function claimItem(itemId: string, viewerPersonId: string): Promise<InboxItemView[]> {
  const item = findOrThrow(itemId);
  if (item.assigned_to) throw new Error("Already claimed - cannot force-take a ticket.");
  item.assigned_to = viewerPersonId;
  item.assigned_by = null;
  item.assigned_at = nowIso();
  item.assignee = resolveMember(viewerPersonId);
  item.updated_at = item.assigned_at;
  return getInbox();
}

/**
 * (Re)assign a ticket to a teammate. Allowed for the current owner or a head
 * admin (enforced in the UI; here we just record assigned_by = the actor).
 */
export async function assignItem(itemId: string, toPersonId: string, byPersonId: string): Promise<InboxItemView[]> {
  const item = findOrThrow(itemId);
  item.assigned_to = toPersonId;
  item.assigned_by = byPersonId;
  item.assigned_at = nowIso();
  item.assignee = resolveMember(toPersonId);
  item.updated_at = item.assigned_at;
  return getInbox();
}

/** Accept the inbound contact -> status accepted + fires the messaging rollout. */
export async function acceptItem(itemId: string): Promise<InboxItemView[]> {
  const item = findOrThrow(itemId);
  item.status = "accepted";
  item.updated_at = nowIso();

  // 2b: trigger the messaging rollout (relationship + threads + seed messages).
  void acceptInbox({
    inboxItemId: item.id,
    requestType: item.type as "connect" | "connect_message" | "pricelist_request" | "deal_card",
    note: item.note,
    ownCompany: { id: GREENLEAF_ID, name: "GreenLeaf Cultivation", initials: "GL" },
    senderCompany: { id: item.sender_company_id, name: item.sender.companyName, initials: item.sender.initials },
    viewerPerson: { id: VIEWER.personId, name: "Alice Green", initials: "AG" },
    senderPerson: { id: item.sender_person_id, name: item.sender.companyName, initials: item.sender.initials },
  });

  return getInbox();
}

/** Decline the inbound contact -> status rejected (moves to History). */
export async function declineItem(itemId: string): Promise<InboxItemView[]> {
  const item = findOrThrow(itemId);
  item.status = "rejected";
  item.updated_at = nowIso();
  return getInbox();
}
