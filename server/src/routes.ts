import { Router } from "express";
import { z } from "zod";
import { LlmUnavailableError, runAgent } from "./services/llmService.js";
import { listPublicOrders } from "./services/orderService.js";
import { buildSummary, NoConversationError, TurnSchema } from "./services/summaryService.js";
import { DEMO_DATA_LABEL } from "./data/orders.js";
import { getLlmConfig } from "./services/llmConfig.js";

export const api = Router();

const ChatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(1000) }))
    .min(1)
    .max(40),
});
const SummaryBody = z.object({ turns: z.array(TurnSchema).min(1).max(80) });
const TtsBody = z.object({ text: z.string().min(1).max(500) });

api.get("/health", (_req, res) => {
  const cfg = getLlmConfig();
  res.json({
    ok: true,
    llmConfigured: cfg !== null,
    llmProvider: cfg?.provider ?? null,
    premiumTtsConfigured: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
  });
});

api.get("/orders", (_req, res) => {
  res.json({ label: DEMO_DATA_LABEL, orders: listPublicOrders() });
});

api.post("/chat", async (req, res) => {
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success || parsed.data.messages[parsed.data.messages.length - 1].role !== "user") {
    res.status(400).json({ error: "INVALID_REQUEST", message: "Invalid chat request." });
    return;
  }
  const t0 = Date.now();
  try {
    const result = await runAgent(parsed.data.messages);
    console.log(`chat ok tools=${result.trace.length} blocked=${result.guardrailBlocked} ms=${Date.now() - t0}`);
    res.json({
      reply: result.reply,
      trace: result.trace,
      guardrailBlocked: result.guardrailBlocked,
      totalMs: Date.now() - t0,
    });
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.error("chat llm unavailable");
      res.status(503).json({ error: "LLM_UNAVAILABLE", message: e.message });
      return;
    }
    console.error("chat failed");
    res.status(500).json({ error: "INTERNAL", message: "Something went wrong on the server." });
  }
});

api.post("/summary", (req, res) => {
  const parsed = SummaryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "Invalid summary request." });
    return;
  }
  try {
    res.json(buildSummary(parsed.data.turns));
  } catch (e) {
    if (e instanceof NoConversationError) {
      res.status(422).json({ error: "NO_CONVERSATION", message: e.message });
      return;
    }
    console.error("summary failed");
    res.status(500).json({ error: "SUMMARY_FAILED", message: "The call summary could not be generated." });
  }
});

// Optional premium voice proxy (ElevenLabs). The key stays on the server.
api.post("/tts", async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) {
    res.status(501).json({ error: "TTS_NOT_CONFIGURED", message: "Premium voice is not configured." });
    return;
  }
  const parsed = TtsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "Invalid text." });
    return;
  }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: parsed.data.text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      res.status(502).json({ error: "TTS_FAILED", message: "Premium voice failed." });
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.status(502).json({ error: "TTS_FAILED", message: "Premium voice failed." });
  }
});