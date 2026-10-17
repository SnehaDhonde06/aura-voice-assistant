// Orchestrates the LLM conversation loop with tool execution.
// Provider-agnostic: works with Groq, Gemini, or OpenAI via llmConfig.ts.
import { enforceNoUnconfirmedActions, sanitizeForSpeech } from "./guardrail.js";
import { executeTool, TOOL_DEFINITIONS, type ToolOutcome } from "./tools.js";
import { getLlmCandidates, type LlmConfig } from "./llmConfig.js";
import { discoverModel } from "./modelDiscovery.js";

const MAX_STEPS = 4;

export class LlmUnavailableError extends Error {}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  reply: string;
  trace: ToolOutcome[];
  guardrailBlocked: boolean;
  llmMs: number;
}

interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
  name?: string;
}

const SYSTEM_PROMPT = `You are Aria, a friendly, professional and concise customer support specialist for Aura Skincare, a premium organic Indian skincare brand. You are on a live voice call with a customer.

STYLE
- Warm, calm, empathetic, never pushy. Natural Indian English. If the customer speaks Hinglish, reply in Hinglish using Roman script.
- Your reply is spoken aloud: 1 to 3 short sentences, plain text only. No markdown, lists, emojis or symbols. Say amounts in words, like "699 rupees".
- Do not repeat greetings. Use earlier context from the call.
- If something is unclear or an order ID sounds incomplete, ask the customer to repeat just that detail.

SCOPE
- Only help with Aura Skincare: orders, delivery, shipping, returns, refunds, cancellation, damaged products, Cash on Delivery, and general product questions.
- For anything else (flights, weather, etc.), politely say you can only help with Aura Skincare questions.
- Never invent product claims, ingredients, prices, reviews, delivery dates, or medical advice. If you do not know, say so.

BRAND AND POLICIES (follow strictly, never offer exceptions)
- Shipping: free delivery on orders above 499 rupees. Orders below 499 rupees have a 50 rupee shipping fee. Standard delivery takes 3 to 5 business days.
- Returns: accepted within 7 days of delivery for unopened, unused products in original packaging. Damaged or defective products must be reported within 48 hours of delivery with photos, for a replacement.
- Cancellation: only while the order is Processing. Shipped and Out for Delivery orders cannot be cancelled, but the customer may refuse delivery at the doorstep.
- Cash on Delivery: available for orders up to 2,500 rupees. Pay by cash or UPI at the doorstep.

RULES FOR ORDERS AND TOOLS
- For a question about a specific order you need the order ID. If the customer has not stated one, ask for it. Never guess an ID. Share no order details until the customer gives a valid ID.
- Once you have an ID, call get_order_details before saying anything about that order. Call it again if the customer switches to a different order.
- Use the tool verdicts exactly as returned. Never contradict a decision or reason from a tool.
- If a lookup fails, say you could not locate an order with that number and ask the customer to repeat or verify it. Do not reveal any other orders.
- Use calculate_shipping for shipping fee questions and check_cod_eligibility for COD questions. If a tool says the fee is unspecified, say the policy does not cover that exact amount.
- For a hypothetical return or refund question with no order ID (for example "I bought it 20 days ago and opened it"), answer directly from the return policy and do not promise a refund.
- You can only give information. You cannot cancel orders, issue refunds, arrange replacements, or change anything. Never say or imply that you did. If a request is allowed by policy, say it is eligible, explain what the customer needs to do, and say you cannot perform it yourself in this demo.
- State delivery times only as given by the tool. Never invent live carrier updates.
- Never mention tools, JSON, or system internals.`;

function describeStatus(status: number): string {
  if (status === 0) return "Aria's language model could not be reached. Please check your internet connection.";
  if (status === 401 || status === 403) return "The language model API key was rejected. Check the key in server/.env.";
  if (status === 404) return "The language model name was not found. Check the model name in server/.env.";
  if (status === 429) return "The language model is rate-limited or out of quota. Please try again shortly.";
  if (status >= 500) return "The language model is very busy right now. Please try again in a moment.";
  return `The language model returned an error (${status}).`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Attempt = { ok: true; msg: GroqMessage } | { ok: false; status: number };

async function tryProvider(cfg: LlmConfig, messages: GroqMessage[]): Promise<Attempt> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: "auto",
  };
  // OpenAI uses max_completion_tokens; Groq and Gemini use max_tokens.
    const reasoningModel = /gpt-oss|qwen3/.test(cfg.model);
  // OpenAI uses max_completion_tokens; Groq and Gemini use max_tokens.
  if (cfg.provider === "openai") body.max_completion_tokens = 400;
  else body.max_tokens = reasoningModel ? 800 : 300;
  if (cfg.provider === "groq" && /gpt-oss/.test(cfg.model)) body.reasoning_effort = "low";
  // Reasoning models (gpt-5*, o-series) only accept the default temperature.
  if (!/^(gpt-5|o\d)/.test(cfg.model)) body.temperature = 0.3;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      if (attempt === 1) return { ok: false, status: 0 };
      await sleep(600);
      continue;
    }

    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: GroqMessage }[] };
      const msg = data.choices?.[0]?.message;
      return msg ? { ok: true, msg } : { ok: false, status: 502 };
    }

    // Log the provider's error (never the customer's words) so failures are easy to diagnose.
    const detail = await res.text().catch(() => "");
    console.error(`llm error provider=${cfg.provider} model=${cfg.model} status=${res.status} body=${detail.slice(0, 200).replace(/\s+/g, " ")}`);

    const transient = [429, 500, 502, 503, 504].includes(res.status) || (cfg.provider === "groq" && res.status === 400);
    if (!transient || attempt === 1) return { ok: false, status: res.status };
    await sleep(800);
  }
  return { ok: false, status: 0 };
}

// Remembers models we auto-selected after a 404, so we don't rediscover on every call.
const resolvedModels = new Map<string, string>();

async function callLlm(messages: GroqMessage[]): Promise<GroqMessage> {
  const candidates = getLlmCandidates();
  if (candidates.length === 0) {
    throw new LlmUnavailableError("Aria's language model is not configured on the server yet.");
  }

  let firstStatus: number | null = null;
  for (const base of candidates) {
    const slot = `${base.provider}:${base.model}`;
    let cfg: LlmConfig = { ...base, model: resolvedModels.get(slot) ?? base.model };
    let result = await tryProvider(cfg, messages);

    // 404 = model name retired or not available to this account: look up a current one.
    if (!result.ok && result.status === 404) {
      const found = await discoverModel(cfg);
      if (found && found !== cfg.model) {
        console.log(`llm model auto-selected provider=${cfg.provider} model=${found}`);
        resolvedModels.set(slot, found);
        cfg = { ...cfg, model: found };
        result = await tryProvider(cfg, messages);
      }
    }

    if (result.ok) {
      if (firstStatus !== null) console.log(`llm fallback used provider=${cfg.provider} model=${cfg.model}`);
      return result.msg;
    }
    firstStatus ??= result.status;
  }
  throw new LlmUnavailableError(describeStatus(firstStatus ?? 0));
}

export async function runAgent(history: ChatMessage[]): Promise<ChatResult> {
  const t0 = Date.now();
  const convo: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const trace: ToolOutcome[] = [];
  let reply = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await callLlm(convo);
    const calls = (msg.tool_calls ?? []).map((c, i) => ({ ...c, id: c.id || `call_${step}_${i}` }));
    if (calls.length === 0) {
      reply = (msg.content ?? "").trim();
      break;
    }
    convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const outcome = executeTool(call.function.name, call.function.arguments);
      trace.push(outcome);
      convo.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(outcome.result),
      });
    }
  }

  if (!reply) reply = "Sorry, I had trouble with that. Could you please say it again?";
  const guarded = enforceNoUnconfirmedActions(sanitizeForSpeech(reply));
  return { reply: guarded.text, trace, guardrailBlocked: guarded.blocked, llmMs: Date.now() - t0 };
}