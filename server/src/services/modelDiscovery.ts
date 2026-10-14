import type { LlmConfig, LlmProvider } from "./llmConfig.js";

const MODELS_URL: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/models",
};

// Models that cannot do text chat with tools.
const EXCLUDE = /(embed|whisper|tts|speech|audio|image|imagen|veo|guard|moderation|live|transcri|dall|realtime|aqa|robotics|computer-use)/i;

const PREFERRED: Partial<Record<LlmProvider, RegExp[]>> = {
  groq: [/llama-3\.3-70b/, /gpt-oss-120b/, /gpt-oss-20b/, /qwen3-32b/, /llama-4/, /llama-3\.1-8b/],
  openai: [/^gpt-4o-mini$/, /^gpt-4\.1-mini$/, /^gpt-5-mini$/],
};

const cache = new Map<LlmProvider, { at: number; ids: string[] }>();

export async function listModels(cfg: LlmConfig): Promise<string[]> {
  const hit = cache.get(cfg.provider);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ids;
  try {
    const res = await fetch(MODELS_URL[cfg.provider], {
      headers: { Authorization: `Bearer ${cfg.key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id?: string }[] };
    const ids = (data.data ?? []).map((m) => (m.id ?? "").replace(/^models\//, "")).filter(Boolean);
    cache.set(cfg.provider, { at: Date.now(), ids });
    return ids;
  } catch {
    return [];
  }
}

export function pickModel(provider: LlmProvider, ids: string[]): string | null {
  const usable = ids.filter((id) => !EXCLUDE.test(id));

  if (provider === "gemini") {
    const rx = /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-preview[\w.-]*)?$/;
    const found: { id: string; v: number; lite: boolean; preview: boolean }[] = [];
    for (const id of usable) {
      const m = rx.exec(id);
      if (m) found.push({ id, v: parseFloat(m[1]), lite: Boolean(m[2]), preview: Boolean(m[3]) });
    }
    found.sort((a, b) => b.v - a.v || Number(a.lite) - Number(b.lite) || Number(a.preview) - Number(b.preview));
    return found[0]?.id ?? null;
  }

  for (const pattern of PREFERRED[provider] ?? []) {
    const match = usable.find((id) => pattern.test(id));
    if (match) return match;
  }
  return null;
}

export async function discoverModel(cfg: LlmConfig): Promise<string | null> {
  return pickModel(cfg.provider, await listModels(cfg));
}