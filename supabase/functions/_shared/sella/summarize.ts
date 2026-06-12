// Version-change summary (Sella 4d, "the why"): given a before/after line diff + the
// editor's note, ask Haiku for one neutral sentence. PURE of I/O (clean-architecture):
// the Edge Function loads the two versions + the note and writes the log line + the
// chat message; this module only turns a diff into a sentence, and fails SOFT.
import { callBedrock, MODELS } from "./bedrock.ts";
import { SUMMARIZE_SYSTEM } from "./prompts.ts";

export interface SummaryLine {
  name: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  currency: string | null;
}

export interface SummaryContext {
  oldVersion: number;
  newVersion: number;
  oldLines: SummaryLine[];
  newLines: SummaryLine[];
  /** the editor's MANDATORY change note (deal_change_input.note). */
  note: string;
}

export type SummaryOutcome =
  // fail-soft: no usable summary (Sella down / empty). The caller NO-OPS - the edit
  // and the deal keep working regardless.
  | { ok: false; reason: string }
  | { ok: true; summary: string };

function formatLines(lines: SummaryLine[]): string {
  if (!lines.length) return "  (none)";
  return lines
    .map((l) => {
      const qty = l.quantity != null ? `${l.quantity}${l.unit ? " " + l.unit : ""}` : "qty TBD";
      const price = l.unitPrice != null ? `@ ${l.currency ?? ""} ${l.unitPrice}/unit` : "price TBD";
      return `  - ${l.name}: ${qty} ${price}`;
    })
    .join("\n");
}

function buildMessages(ctx: SummaryContext): { role: "user"; text: string }[] {
  const text = [
    `PREVIOUS (v${ctx.oldVersion}):`,
    formatLines(ctx.oldLines),
    "",
    `NEW (v${ctx.newVersion}):`,
    formatLines(ctx.newLines),
    "",
    "EDITOR'S NOTE (their stated reason):",
    ctx.note.trim() || "(none given)",
    "",
    "Write the one-sentence change summary.",
  ].join("\n");
  return [{ role: "user", text }];
}

export async function runSummary(
  ctx: SummaryContext,
  opts: { apiKey?: string } = {},
): Promise<SummaryOutcome> {
  let text: string | null;
  try {
    const res = await callBedrock({
      model: MODELS.summarize, // Haiku - a cheap one-liner; no schema, so no cold compile
      system: SUMMARIZE_SYSTEM,
      messages: buildMessages(ctx),
      maxTokens: 120,
      apiKey: opts.apiKey,
    });
    text = res.text;
  } catch (e) {
    return { ok: false, reason: `bedrock call failed: ${(e as Error).message}` };
  }
  const summary = (text ?? "").trim();
  if (!summary) return { ok: false, reason: "empty summary" };
  return { ok: true, summary };
}
