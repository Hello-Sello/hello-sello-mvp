// Detection context builder (Sella 4b). Pure: the caller does the DB reads and
// passes the rows in; this turns them into the single user turn Sella sees.
//
// Whole-thread context (the locked decision, not a 15-20 msg window): a window
// silently misses deal facts spread across the conversation. The ~20k-token cap +
// summary/tail branch is deferred (POV §8) - demo threads are well under it; when we
// add it, it slots in here behind the same function signature.

export interface DetectionMessage {
  /** content_author code: 'person' | 'system' | 'sella'. */
  sender: string;
  /** display name for a person line (the company/person is fine); optional. */
  authorName?: string | null;
  body: string;
}

/** The slice of a seller's catalogue Sella needs to resolve a chat mention. */
export interface SellerProduct {
  name: string;
  cultivar?: string | null;
  /** product.local_code_pzn - the German pharma article number. */
  pzn?: string | null;
  /** product.unit_code. */
  unit?: string | null;
}

export interface DetectionContext {
  /** the whole thread, oldest -> newest. */
  messages: DetectionMessage[];
  /** the SELLER's products (the side making the offer), for name/PZN resolution. */
  sellerProducts: SellerProduct[];
  /**
   * A one-line summary of the deal Sella ALREADY surfaced on this thread, if any.
   * Fed back so the model does not re-surface the same deal unless qty/price changed
   * materially (the dedup hint; the durable dedup row lives in the DB, see 4b).
   */
  lastSurfacedSummary?: string | null;
}

/** The plain text of the thread - used for verbatim evidence-grounding checks. */
export function threadText(messages: DetectionMessage[]): string {
  return messages.map((m) => m.body).join("\n");
}

function formatProducts(products: SellerProduct[]): string {
  if (!products.length) return "(no products on file)";
  return products
    .map((p) => {
      const bits = [p.name];
      if (p.cultivar) bits.push(`cultivar: ${p.cultivar}`);
      if (p.pzn) bits.push(`PZN: ${p.pzn}`);
      if (p.unit) bits.push(`unit: ${p.unit}`);
      return `- ${bits.join(" | ")}`;
    })
    .join("\n");
}

function formatThread(messages: DetectionMessage[]): string {
  return messages
    .map((m) => {
      // a person line shows its author; system/sella lines show their voice
      const who = m.sender === "person" ? (m.authorName ?? "Person") : m.sender;
      return `${who}: ${m.body}`;
    })
    .join("\n");
}

/** Build the single user message handed to `callBedrock`. */
export function buildDetectionMessages(ctx: DetectionContext): { role: "user"; text: string }[] {
  const parts: string[] = [
    "SELLER PRODUCTS (resolve chat mentions against these):",
    formatProducts(ctx.sellerProducts),
    "",
    "<thread>",
    formatThread(ctx.messages),
    "</thread>",
  ];
  if (ctx.lastSurfacedSummary && ctx.lastSurfacedSummary.trim().length > 0) {
    parts.push(
      "",
      "ALREADY SURFACED (do not re-surface the same deal unless the quantity or price changed materially):",
      ctx.lastSurfacedSummary.trim(),
    );
  }
  parts.push("", "Extract the deal as the structured object.");
  return [{ role: "user", text: parts.join("\n") }];
}
