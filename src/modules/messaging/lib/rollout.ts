/**
 * Accept rollout - the §2 table as a pure function.
 *
 * Given an `AcceptInput`, decide which threads an accept creates and which
 * seed lines each gets. **Pure**: no ids, no timestamps, no I/O - it returns a
 * plain spec the store (or, later, the real `acceptInbox` write) executes.
 * That keeps the *rule* (this file) separate from *persistence* (the mock
 * store), so this logic survives the swap to Supabase unchanged.
 *
 * The model (LOCKED 2026-06-08; = chat-prototype 2026-06-06):
 *   - C2C is created on EVERY accept; always gets a `connection_established`
 *     system line (the durable company-to-company record).
 *   - P2P opens ONLY for the substantive types (connect_message /
 *     pricelist_request / deal_card); Sella posts an `intro`, never the
 *     business message. For connect_message the sender's own note follows.
 *   - A bare `connect` = C2C only.
 *   - The deal-card GATE (deal_detected -> two-party confirm -> Deal chat) is
 *     deferred to 3a+; a deal_card accept here just opens a P2P + a Sella intro.
 */
import type {
  AcceptInput,
  AcceptRequestType,
  MessageSender,
  MessageType,
  ThreadType,
} from "../types";

/* -------------------------------------------------------------------------- */
/* The rollout's output contract - plain specs, no persistence concerns.      */
/* Not throwaway: the real acceptInbox executes the same shape.               */
/* -------------------------------------------------------------------------- */

/** A line to seed into a freshly-created thread. The store assigns id/created_at. */
export interface SeedMessageSpec {
  sender: MessageSender;
  /** null for system/sella; the author's person.id for a human line */
  senderPersonId: string | null;
  type: MessageType;
  body: string;
}

/** A thread to create on accept, with its seed lines in order. */
export interface ThreadSpec {
  /** `c2c` always; `p2p` for substantive types. Never `deal` in this slice. */
  type: ThreadType;
  /** p2p only - the two participants, canonically ordered (person_a_id < person_b_id) */
  personAId: string | null;
  personBId: string | null;
  seed: SeedMessageSpec[];
}

/** The full set of threads an accept produces (§2). */
export interface RolloutPlan {
  threads: ThreadSpec[];
}

/* -------------------------------------------------------------------------- */
/* The entry point                                                            */
/* -------------------------------------------------------------------------- */

/** Plan the threads + seed lines an accept produces, per the §2 model. */
export function planRollout(input: AcceptInput): RolloutPlan {
  const c2c: ThreadSpec = {
    type: "c2c",
    personAId: null,
    personBId: null,
    seed: [connectionEstablished(input)],
  };

  if (!opensP2P(input.requestType)) {
    return { threads: [c2c] };
  }

  const [personAId, personBId] = canonicalPair(
    input.viewerPerson.id,
    input.senderPerson.id,
  );
  const p2p: ThreadSpec = {
    type: "p2p",
    personAId,
    personBId,
    seed: p2pSeed(input),
  };
  return { threads: [c2c, p2p] };
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

/** Does this request type open a P2P? Exhaustive over AcceptRequestType. */
function opensP2P(type: AcceptRequestType): boolean {
  switch (type) {
    case "connect":
      return false;
    case "connect_message":
    case "pricelist_request":
    case "deal_card":
      return true;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/** The C2C system line every accept produces. */
function connectionEstablished(input: AcceptInput): SeedMessageSpec {
  return {
    sender: "system",
    senderPersonId: null,
    type: "connection_established",
    body: `${input.ownCompany.name} and ${input.senderCompany.name} are now connected.`,
  };
}

/**
 * The P2P seed lines per substantive request type. Exhaustive over
 * AcceptRequestType (the `connect` case can't be reached - planRollout guards
 * it out - but the switch stays total so a NEW request type fails the build).
 */
function p2pSeed(input: AcceptInput): SeedMessageSpec[] {
  switch (input.requestType) {
    case "connect_message": {
      const seed = [sellaIntroConnect(input)];
      const note = input.note?.trim();
      // Only seed the human note if there is one - never an empty bubble.
      if (note) seed.push(noteMessage(input, note));
      return seed;
    }
    case "pricelist_request":
      return [sellaIntroPricelist(input)];
    case "deal_card":
      return [sellaIntroDeal(input)];
    case "connect":
      return [];
    default: {
      const _exhaustive: never = input.requestType;
      return _exhaustive;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Sella intro copy (placeholder voice - to be polished later)                */
/* Framing: the SENDER is the requester ("wants to connect / is asking /      */
/* sent a draft"); our VIEWER is the recipient ("take it from here").         */
/* -------------------------------------------------------------------------- */

function sellaIntroConnect(input: AcceptInput): SeedMessageSpec {
  return sella(
    `${input.senderPerson.name} from ${input.senderCompany.name} wants to connect with ${input.viewerPerson.name} from ${input.ownCompany.name}. Their note is below - take it from here.`,
  );
}

function sellaIntroPricelist(input: AcceptInput): SeedMessageSpec {
  return sella(
    `${input.senderPerson.name} from ${input.senderCompany.name} is asking ${input.viewerPerson.name} (${input.ownCompany.name}) for a price list. Over to you both.`,
  );
}

function sellaIntroDeal(input: AcceptInput): SeedMessageSpec {
  return sella(
    `${input.senderPerson.name} from ${input.senderCompany.name} sent a deal draft to ${input.viewerPerson.name}. Take it from here.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

/** A Sella `intro` line (facilitator voice; no person author). */
function sella(body: string): SeedMessageSpec {
  return { sender: "sella", senderPersonId: null, type: "intro", body };
}

/** The requester's own note, as a human `message`. */
function noteMessage(input: AcceptInput, body: string): SeedMessageSpec {
  return {
    sender: "person",
    senderPersonId: input.senderPerson.id, // the requester wrote the note
    type: "message",
    body,
  };
}

/**
 * Canonical participant order for a P2P thread. The DB enforces
 * `person_a_id < person_b_id` (CHECK chat_thread_p2p_canonical_order); default
 * string sort matches that lexicographic comparison, so the mock writes the
 * same ordering a real insert would require.
 */
function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
