// The one helper every Sella task uses to call Claude on Amazon Bedrock (EU).
//
// Contract: callers pass a plain { system, messages, tools } shape and get back
// a normalized { text, toolUse } — they never touch the Bedrock Converse wire
// format, the EU endpoint, or the bearer-token auth. Swapping model/provider or
// the auth method changes only this file.
//
// Auth + transport (verified live 2026-06-08, see DECISIONS.md "Sella 4a"):
//   Bedrock API key (bearer token) in the `AWS_BEARER_TOKEN_BEDROCK` secret +
//   plain fetch to the EU Converse endpoint. No AWS SDK, no SigV4 signing.

const REGION = "eu-central-1";

// Model-per-job. The `eu.` prefix is MANDATORY — EU inference profiles only
// resolve via the cross-region `eu.` ids; bare `anthropic.*` ids fail.
export const MODELS = {
  /** Detection + drafting — needs reasoning. NOTE: id not yet smoke-tested. */
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
  maxTokens?: number;
  temperature?: number;
  /** Override the bearer token (tests). Defaults to the env secret. */
  apiKey?: string;
};

export type CallResult = {
  /** Assistant text, joined across text blocks. Null if the turn was tool-only. */
  text: string | null;
  /** First tool call the model made, if any. */
  toolUse: { name: string; input: unknown } | null;
  /** Bedrock stop reason: "end_turn" | "tool_use" | "max_tokens" | ... */
  stopReason: string;
  /** Full Converse response — escape hatch for usage stats / debugging. */
  raw: unknown;
};

// Runtime-neutral secret read: works in Deno (Edge Function) and Node (Next.js),
// so the same helper serves both homes. The token is the only per-runtime
// difference — see DECISIONS.md.
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

/**
 * Call Claude on Bedrock (EU) once and return a normalized result.
 * Single-shot — no agentic loop (every MVP Sella task is one call; see DEV-11).
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
          inputSchema: { json: t.inputSchema },
        },
      })),
      ...(input.forceTool ? { toolChoice: { tool: { name: input.forceTool } } } : {}),
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Bedrock ${res.status} for ${input.model}: ${text}`);
  }

  const data = JSON.parse(text);
  const content: Array<Record<string, unknown>> = data?.output?.message?.content ?? [];
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
