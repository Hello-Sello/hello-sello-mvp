// First-contact intro (Sella 4d): when two companies connect and a P2P chat opens,
// turn the who/what context into one warm opening line. PURE of I/O: the Edge Function
// finds the seeded intro message and updates it; this module only writes the sentence,
// and fails SOFT (the static seeded intro stays if Sella is down).
import { callBedrock, MODELS } from "./bedrock.ts";
import { INTRO_SYSTEM } from "./prompts.ts";

export interface IntroContext {
  /** connect_message | pricelist_request | deal_card. */
  requestType: string;
  note?: string | null;
  senderCompany: string; // the requester's company
  senderPerson: string; // the requester (who reached out)
  recipientCompany: string;
  recipientPerson: string; // who accepted
}

export type IntroOutcome =
  | { ok: false; reason: string }
  | { ok: true; intro: string };

function requestLabel(t: string): string {
  switch (t) {
    case "pricelist_request":
      return "a price-list request";
    case "deal_card":
      return "a sent deal draft";
    case "connect_message":
      return "a connection message";
    default:
      return "a connection";
  }
}

function buildMessages(ctx: IntroContext): { role: "user"; text: string }[] {
  const parts = [
    `REQUESTER: ${ctx.senderPerson} (${ctx.senderCompany})`,
    `RECIPIENT: ${ctx.recipientPerson} (${ctx.recipientCompany})`,
    `KIND: ${requestLabel(ctx.requestType)}`,
  ];
  if (ctx.note && ctx.note.trim()) parts.push(`REQUESTER'S NOTE: ${ctx.note.trim()}`);
  parts.push("", "Write the one-line opening.");
  return [{ role: "user", text: parts.join("\n") }];
}

export async function runIntro(
  ctx: IntroContext,
  opts: { apiKey?: string } = {},
): Promise<IntroOutcome> {
  let text: string | null;
  try {
    const res = await callBedrock({
      model: MODELS.summarize, // Haiku - a cheap one-liner
      system: INTRO_SYSTEM,
      messages: buildMessages(ctx),
      maxTokens: 120,
      apiKey: opts.apiKey,
    });
    text = res.text;
  } catch (e) {
    return { ok: false, reason: `bedrock call failed: ${(e as Error).message}` };
  }
  const intro = (text ?? "").trim();
  if (!intro) return { ok: false, reason: "empty intro" };
  return { ok: true, intro };
}
