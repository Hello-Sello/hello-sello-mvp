// The one helper every Sella task uses to call Claude on Amazon Bedrock (EU).
//
// Contract: callers pass a plain { system, messages, tools?, jsonSchema? } shape
// and get back a normalized { text, toolUse, stopReason, raw }. They never touch
// the Bedrock Converse wire format, the EU endpoint, the bearer-token auth, or the
// retry/timeout machinery. Swapping model/provider or the auth method changes only
// this file.
//
// Auth + transport (verified live 2026-06-08, see DECISIONS.md "Sella 4a"):
//   Bedrock API key (bearer token) in the `AWS_BEARER_TOKEN_BEDROCK` secret +
//   plain fetch to the EU Converse endpoint. No AWS SDK, no SigV4 signing.
//
// Structured outputs (Bedrock GA Feb 2026; shape verified against the AWS Converse
// API reference 2026-06-12): pass `jsonSchema` and the model is grammar-constrained
// to emit JSON that conforms - far stronger than a forced tool. AWS quirk: the
// schema rides in `outputConfig.textFormat.structure.jsonSchema.schema` as a
// STRINGIFIED schema (a JSON string), NOT a nested object - and note that a tool's
// `inputSchema.json` IS an object, so the two are easy to confuse. The conforming
// JSON comes back as the assistant text block, so `result.text` is the JSON string
// the caller parses + zod-validates (the wrapper stays dumb). Only the JSON Schema
// Draft 2020-12 SUBSET is allowed: every object must set `additionalProperties:false`;
// no min/maxLength, no minimum/maximum/multipleOf; enum values must be primitives.
// The first call on a new schema compiles a grammar (cold latency up to minutes,
// then cached 24h) - hence the daily pre-warm.

const REGION = "eu-central-1";

// Per-call timeout = base + slope * maxTokens, capped. A structured-output COLD
// compile can take minutes, so the ceiling is generous; the daily pre-warm keeps us
// on the hot path where calls finish in seconds. Callers can override via timeoutMs.
const TIMEOUT_BASE_MS = 15_000;
const TIMEOUT_PER_TOKEN_MS = 60;
const TIMEOUT_CEILING_MS = 180_000;

// Retry budget for transient Bedrock failures (throttling / 5xx / timeout / network).
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const RETRY_CEILING_MS = 8_000;
// HTTP statuses worth retrying: request-timeout (408), throttling (429), and 5xx.
// Everything else (400 bad schema, 403 auth, 404 model) is terminal - never retried.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// Model-per-job. The `eu.` prefix is MANDATORY - EU inference profiles only
// resolve via the cross-region `eu.` ids; bare `anthropic.*` ids fail. Cross-region
// inference profiles are explicitly supported for structured outputs (AWS docs).
export const MODELS = {
  /** Detection + drafting - needs reasoning. Verified live with structured outputs 2026-06-12. */
  draft: "eu.anthropic.claude-sonnet-4-5-20250929-v1:0",
  /** Cheap one-liners / version summaries. Verified working 2026-06-08. */
  summarize: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
} as const;

/** A tool Sella may call. `inputSchema` is a JSON Schema for the tool's input. */
export type SellaTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/**
 * A JSON-schema contract the model MUST conform to (Bedrock structured outputs).
 * `schema` is a JSON Schema OBJECT here for ergonomics; the wrapper stringifies it
 * into the Converse `structure.jsonSchema.schema` field. Stick to the Draft 2020-12
 * subset (see the file header) or Bedrock rejects it with a 400 at request time.
 */
export type SellaJsonSchema = {
  /** Short name; Bedrock caches the compiled grammar keyed (in part) by it. */
  name: string;
  description?: string;
  /** A JSON Schema object (Draft 2020-12 subset). Serialized before sending. */
  schema: Record<string, unknown>;
};

export type CallInput = {
  model: string;
  /** Optional system prompt (Sella's voice / task framing). */
  system?: string;
  /** Conversation so far. Most Sella tasks send a single user turn. */
  messages: { role: "user" | "assistant"; text: string }[];
  /** Tools the model may call (e.g. propose_deal_draft). */
  tools?: SellaTool[];
  /** Force a specific tool by name (else the model decides). */
  forceTool?: string;
  /**
   * Force a schema-conforming JSON response (structured outputs). Preferred over
   * `forceTool` for detection/drafting: the grammar GUARANTEES the shape, whereas a
   * forced tool only strongly suggests it. `result.text` is then the JSON string.
   */
  jsonSchema?: SellaJsonSchema;
  maxTokens?: number;
  temperature?: number;
  /** Override the bearer token (tests). Defaults to the env secret. */
  apiKey?: string;
  /** Override the computed per-call timeout (ms). */
  timeoutMs?: number;
  /** Override the retry budget (default 3 retries = up to 4 attempts). */
  maxRetries?: number;
};

export type CallResult = {
  /** Assistant text, joined across text blocks. For structured outputs this is the
   *  schema-conforming JSON STRING (parse + zod-validate it). Null if tool-only. */
  text: string | null;
  /** First tool call the model made, if any. */
  toolUse: { name: string; input: unknown } | null;
  /** Bedrock stop reason: "end_turn" | "tool_use" | "max_tokens" |
   *  "malformed_model_output" | "model_context_window_exceeded" | ... */
  stopReason: string;
  /** Full Converse response - escape hatch for usage stats / debugging. */
  raw: unknown;
};

// Runtime-neutral secret read: works in Deno (Edge Function) and Node (Next.js),
// so the same helper serves both homes. The token is the only per-runtime
// difference - see DECISIONS.md.
function resolveApiKey(override?: string): string {
  if (override) return override;
  const fromDeno = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
    .Deno?.env.get("AWS_BEARER_TOKEN_BEDROCK");
  const fromNode = (globalThis as { process?: { env: Record<string, string | undefined> } })
    .process?.env?.AWS_BEARER_TOKEN_BEDROCK;
  const key = fromDeno ?? fromNode;
  if (!key) throw new Error("AWS_BEARER_TOKEN_BEDROCK is not set");
  return key;
}

/** A Bedrock failure tagged so the retry loop can tell transient from terminal. */
type BedrockError = Error & { status?: number; retryable: boolean; body?: string };

function bedrockError(message: string, status: number | undefined, body: string | undefined): BedrockError {
  const err = new Error(message) as BedrockError;
  err.status = status;
  // No status = abort/network error → transient. Otherwise by the status set.
  err.retryable = status === undefined ? true : RETRYABLE_STATUS.has(status);
  err.body = body;
  return err;
}

/** Sleep that works in Deno + Node (no import). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Full-jitter backoff so concurrent callers don't retry in lockstep. */
function backoffMs(attempt: number): number {
  const ceiling = Math.min(RETRY_CEILING_MS, RETRY_BASE_MS * 2 ** attempt);
  return Math.round(Math.random() * ceiling); // jitter (not security-sensitive)
}

/**
 * POST the Converse body once, bounded by an AbortController timeout. Throws a
 * tagged BedrockError: timeouts + network drops are transient; HTTP status decides
 * the rest. A 2xx body is JSON-parsed and returned untyped (the caller narrows).
 */
async function postOnce(
  url: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const name = (e as Error)?.name;
    const reason =
      name === "AbortError"
        ? `timeout after ${timeoutMs}ms`
        : `network error: ${(e as Error)?.message ?? "unknown"}`;
    throw bedrockError(`Bedrock ${reason}`, undefined, undefined);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) throw bedrockError(`Bedrock ${res.status} for the call: ${text}`, res.status, text);
  return JSON.parse(text) as unknown;
}

/** postOnce wrapped in the retry budget (transient failures only). */
async function callConverse(input: CallInput, body: unknown, apiKey: string, url: string): Promise<unknown> {
  const maxRetries = input.maxRetries ?? DEFAULT_MAX_RETRIES;
  const maxTokens = input.maxTokens ?? 1024;
  const timeoutMs =
    input.timeoutMs ?? Math.min(TIMEOUT_CEILING_MS, TIMEOUT_BASE_MS + maxTokens * TIMEOUT_PER_TOKEN_MS);

  let lastErr: BedrockError | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await postOnce(url, apiKey, body, timeoutMs);
    } catch (e) {
      const err = e as BedrockError;
      lastErr = err;
      if (!err.retryable || attempt === maxRetries) throw err;
      await sleep(backoffMs(attempt));
    }
  }
  // Unreachable (the loop either returns or throws), but keeps the type honest.
  throw lastErr ?? new Error("Bedrock: exhausted retries");
}

/**
 * Call Claude on Bedrock (EU) once (with bounded retries) and return a normalized
 * result. Single-shot - no agentic loop (every MVP Sella task is one call; DEV-11).
 */
export async function callBedrock(input: CallInput): Promise<CallResult> {
  const apiKey = resolveApiKey(input.apiKey);
  const url = `https://bedrock-runtime.${REGION}.amazonaws.com/model/${input.model}/converse`;

  const body: Record<string, unknown> = {
    messages: input.messages.map((m) => ({ role: m.role, content: [{ text: m.text }] })),
    inferenceConfig: {
      maxTokens: input.maxTokens ?? 1024,
      temperature: input.temperature ?? 0,
    },
  };
  if (input.system) body.system = [{ text: input.system }];
  if (input.tools?.length) {
    body.toolConfig = {
      tools: input.tools.map((t) => ({
        toolSpec: {
          name: t.name,
          description: t.description,
          inputSchema: { json: t.inputSchema }, // tool schema = OBJECT (cf. structured = string)
        },
      })),
      ...(input.forceTool ? { toolChoice: { tool: { name: input.forceTool } } } : {}),
    };
  }
  if (input.jsonSchema) {
    // Structured outputs: grammar-constrain the response to our JSON schema. The
    // schema MUST be stringified inside structure.jsonSchema (AWS Converse shape).
    body.outputConfig = {
      textFormat: {
        type: "json_schema",
        structure: {
          jsonSchema: {
            name: input.jsonSchema.name,
            ...(input.jsonSchema.description ? { description: input.jsonSchema.description } : {}),
            schema: JSON.stringify(input.jsonSchema.schema),
          },
        },
      },
    };
  }

  const data = (await callConverse(input, body, apiKey, url)) as {
    output?: { message?: { content?: Array<Record<string, unknown>> } };
    stopReason?: string;
  };

  const content = data?.output?.message?.content ?? [];
  const textBlocks = content
    .filter((b) => typeof b.text === "string")
    .map((b) => b.text as string);
  const toolBlock = content.find((b) => b.toolUse) as
    | { toolUse: { name: string; input: unknown } }
    | undefined;

  return {
    text: textBlocks.length ? textBlocks.join("") : null,
    toolUse: toolBlock ? { name: toolBlock.toolUse.name, input: toolBlock.toolUse.input } : null,
    stopReason: data?.stopReason ?? "unknown",
    raw: data,
  };
}
