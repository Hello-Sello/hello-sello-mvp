// Detection orchestration (Sella 4b, "the brain"): build context -> run the model
// with the detect_deal schema -> parse (zod, fail-soft) -> ground the evidence.
//
// This module is PURE of I/O on purpose (clean-architecture): it takes a context and
// returns an outcome. The Edge Function (the outer layer) loads the thread + products
// from the DB and writes the `deal_detected` message. That split keeps the judgment
// here testable without a database, and keeps frameworks/persistence out of the model.
import { callBedrock, MODELS } from "./bedrock.ts";
import {
  DETECT_DEAL_SCHEMA,
  groundedEvidence,
  parseDetectDeal,
  type DetectDealResult,
} from "./tools.ts";
import { DETECT_SYSTEM } from "./prompts.ts";
import { buildDetectionMessages, threadText, type DetectionContext } from "./context.ts";

// Detection runs on HAIKU - the cost decision, because it fires on every message.
// In the wrapper MODELS.summarize is the Haiku id and MODELS.draft is Sonnet; pass
// `opts.model: MODELS.draft` to fall back to Sonnet if Haiku's extraction is weak.
const DETECTION_MODEL = MODELS.summarize;

export type DetectionOutcome =
  // fail-soft: no usable result (bad JSON, schema miss, or Sella was down). The
  // caller NO-OPS - the chat and deals keep working regardless (POV §5).
  | { ok: false; reason: string }
  // a usable result. `isDeal` = a real forming/firm deal WITH grounded evidence;
  // a no_deal (or an ungrounded "deal") is `ok:true` but `isDeal:false` - still a
  // real result the caller persists for dedup, just nothing to surface to people.
  | { ok: true; result: DetectDealResult; evidence: string[]; isDeal: boolean };

export interface RunDetectionOptions {
  /** Override the detection model (default Haiku; pass MODELS.draft for Sonnet). */
  model?: string;
  maxTokens?: number;
  /** Override the bearer token (tests). */
  apiKey?: string;
}

export async function runDetection(
  ctx: DetectionContext,
  opts: RunDetectionOptions = {},
): Promise<DetectionOutcome> {
  let text: string | null;
  try {
    const res = await callBedrock({
      model: opts.model ?? DETECTION_MODEL,
      system: DETECT_SYSTEM,
      messages: buildDetectionMessages(ctx),
      jsonSchema: DETECT_DEAL_SCHEMA,
      maxTokens: opts.maxTokens ?? 1024,
      apiKey: opts.apiKey,
    });
    text = res.text;
  } catch (e) {
    return { ok: false, reason: `bedrock call failed: ${(e as Error).message}` };
  }

  const parsed = parseDetectDeal(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  // Anti-hallucination: keep only evidence quotes that are literally in the thread.
  const evidence = groundedEvidence(parsed.data, threadText(ctx.messages));
  // A positive verdict with no grounded evidence is the model inventing - not a deal.
  const isDeal =
    parsed.data.verdict !== "no_deal" && parsed.data.deal !== null && evidence.length > 0;

  return { ok: true, result: parsed.data, evidence, isDeal };
}
