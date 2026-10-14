import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { api } from "./routes.js";
import { getLlmConfig } from "./services/llmConfig.js";

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()) }));
app.use(express.json({ limit: "20kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
app.use("/api", api);

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`Aura Voice server listening on http://localhost:${port}`);
  const cfg = getLlmConfig();
  console.log(cfg ? `LLM: ${cfg.provider} (${cfg.model})` : "No LLM key set. Chat returns 503 until OPENAI_API_KEY or GROQ_API_KEY is set.");
});