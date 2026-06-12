// detect-deal contract (Sella 4c): the ONE structured-output schema Sella uses to
// extract a forming B2B deal from a buyer/seller chat, plus the zod safety net that
// guards the model's output. Same contract serves automatic detection (4b) and the
// manual "+ Create a deal" pre-fill.
//
// TWO representations of the SAME shape - they MUST stay in sync:
//   1. DETECT_DEAL_JSON_SCHEMA - the JSON Schema sent to Bedrock to grammar-constrain
//      the response. It obeys the Draft-2020-12 SUBSET Bedrock accepts (AWS docs):
//        - every object sets `additionalProperties:false`
//        - every property is listed in `required`; a field is "optional" by being
//          NULLABLE (`type: ["T","null"]`), never by omission - grammar decoding emits
//          every key, so nullability is how we say "may be absent"
//        - no min/max, minLength/maxLength, or pattern; enum values are primitives
//   2. DetectDeal (zod) - the runtime check. Structured outputs already guarantee the
//      shape, but a truncated (max_tokens) or `malformed_model_output` response can
//      still slip through, so we ALWAYS parse + validate and fail SOFT (a mismatch is
//      "no detection", never a throw on the hot path).
//
// Field -> column map (the two-owner birth RPC turns a `deal` into rows):
//   line_items[].name        -> deal_line_item.product_name
//   line_items[].quantity    -> deal_line_item.quantity
//   line_items[].unit        -> deal_line_item.unit         (cf. product.unit_code)
//   line_items[].unit_price  -> deal_line_item.unit_price
//   line_items[].cultivar    -> product.cultivar            (helps resolve product_id)
//   line_items[].pzn         -> product.local_code_pzn      (PZN; helps resolve product_id)
//   deal.currency            -> deal_card.currency / deal_line_item.currency
//   deal.summary             -> the `deal_detected` message + deal_card.metadata
//   evidence[]               -> verbatim chat quotes (anti-hallucination; a quote that
//                               is not literally in the thread is dropped, see below)
import { z } from "zod";
import type { SellaJsonSchema } from "./bedrock.ts";

export type DetectVerdict = "no_deal" | "forming" | "firm";
export type DetectConfidence = "low" | "med" | "high";

/* -------------------------------------------------------------------------- */
/* 1. The Bedrock grammar (JSON Schema). Keep in sync with the zod below.      */
/* -------------------------------------------------------------------------- */

export const DETECT_DEAL_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["no_deal", "forming", "firm"] },
    confidence: { type: "string", enum: ["low", "med", "high"] },
    deal: {
      // null when verdict is no_deal; an object once something concrete is proposed.
      type: ["object", "null"],
      properties: {
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
              unit_price: { type: ["number", "null"] },
              cultivar: { type: ["string", "null"] },
              pzn: { type: ["string", "null"] },
            },
            required: ["name", "quantity", "unit", "unit_price", "cultivar", "pzn"],
            additionalProperties: false,
          },
        },
        currency: { type: ["string", "null"] },
        summary: { type: ["string", "null"] },
      },
      required: ["line_items", "currency", "summary"],
      additionalProperties: false,
    },
    // Verbatim quotes from the thread that justify the verdict. Empty on no_deal.
    evidence: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "confidence", "deal", "evidence"],
  additionalProperties: false,
};

/** The descriptor handed to `callBedrock({ jsonSchema })`. */
export const DETECT_DEAL_SCHEMA: SellaJsonSchema = {
  name: "detect_deal",
  description:
    "Extract a possible B2B deal forming in a buyer/seller chat. Quote the thread VERBATIM as evidence; set deal=null and verdict=no_deal when nothing concrete is proposed yet.",
  schema: DETECT_DEAL_JSON_SCHEMA,
};

/* -------------------------------------------------------------------------- */
/* 2. The zod fail-soft net. Keep in sync with the JSON Schema above.          */
/* -------------------------------------------------------------------------- */

const DetectLineItem = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unit_price: z.number().nullable(),
  cultivar: z.string().nullable(),
  pzn: z.string().nullable(),
});

const DetectDealBody = z.object({
  line_items: z.array(DetectLineItem),
  currency: z.string().nullable(),
  summary: z.string().nullable(),
});

export const DetectDeal = z.object({
  verdict: z.enum(["no_deal", "forming", "firm"]),
  confidence: z.enum(["low", "med", "high"]),
  deal: DetectDealBody.nullable(),
  evidence: z.array(z.string()),
});

export type DetectDealResult = z.infer<typeof DetectDeal>;
export type DetectLineItemResult = z.infer<typeof DetectLineItem>;

/** Fail-soft parse result: never throws on the hot path. */
export type DetectParse =
  | { ok: true; data: DetectDealResult }
  | { ok: false; reason: string };

/**
 * Parse + validate the model's structured output. Non-JSON or non-conforming output
 * returns `ok:false` (the caller treats that as "no detection") rather than throwing.
 */
export function parseDetectDeal(text: string | null): DetectParse {
  if (!text) return { ok: false, reason: "empty model output" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "model output was not valid JSON" };
  }
  const parsed = DetectDeal.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `schema mismatch: ${parsed.error.message}` };
  return { ok: true, data: parsed.data };
}

/**
 * Anti-hallucination guard (POV §5 "verbatim-evidence requirement"): every evidence
 * quote must actually appear in the thread. Returns the quotes that are grounded
 * (case-insensitive, whitespace-normalised). If a positive verdict ends up with zero
 * grounded quotes, the caller should fail soft - the model invented its evidence.
 */
export function groundedEvidence(result: DetectDealResult, threadText: string): string[] {
  const hay = threadText.toLowerCase().replace(/\s+/g, " ");
  return result.evidence
    .map((q) => q.trim())
    .filter((q) => q.length > 0 && hay.includes(q.toLowerCase().replace(/\s+/g, " ")));
}
