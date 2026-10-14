export type LlmProvider = "openai" | "groq" | "gemini";

export interface LlmConfig {
  provider: LlmProvider;
  url: string;
  key: string;
  model: string;
}

// Removes stray whitespace and surrounding quotes that often sneak into .env files.
const clean = (v: string | undefined): string => (v ?? "").trim().replace(/^["']|["']$/g, "");

const PROVIDERS: Record<LlmProvider, { url: string; keyVar: string; modelVar: string; defaultModel: string }> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    keyVar: "OPENAI_API_KEY",
    modelVar: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyVar: "GROQ_API_KEY",
    modelVar: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyVar: "GEMINI_API_KEY",
    modelVar: "GEMINI_MODEL",
    defaultModel: "gemini-flash-latest",
  },
};

const ORDER: LlmProvider[] = ["gemini", "groq", "openai"];

// LLM_PROVIDER picks explicitly. If empty, the first provider that has a key is used.
export function getLlmConfig(): LlmConfig | null {
  const preferred = clean(process.env.LLM_PROVIDER).toLowerCase();
  const provider: LlmProvider | undefined = (ORDER as string[]).includes(preferred)
    ? (preferred as LlmProvider)
    : ORDER.find((p) => clean(process.env[PROVIDERS[p].keyVar]) !== "");
  if (!provider) return null;

  const spec = PROVIDERS[provider];
  const key = clean(process.env[spec.keyVar]);
  if (!key) return null;
  return { provider, url: spec.url, key, model: clean(process.env[spec.modelVar]) || spec.defaultModel };
}

const KEY_PREFIX: Record<LlmProvider, string> = { openai: "sk-", groq: "gsk_", gemini: "AIza" };

// Returns a human-readable warning if the key looks like it belongs to another provider.
export function describeKeyProblem(cfg: LlmConfig): string | null {
  if (cfg.key.startsWith(KEY_PREFIX[cfg.provider])) return null;
  const owner = (Object.keys(KEY_PREFIX) as LlmProvider[]).find((p) => cfg.key.startsWith(KEY_PREFIX[p]));
  return owner
    ? `The ${cfg.provider} key slot holds what looks like a ${owner} key. Put it in ${PROVIDERS[owner].keyVar} and set LLM_PROVIDER=${owner}.`
    : `The ${cfg.provider} key doesn't start with ${KEY_PREFIX[cfg.provider]}. It may be incomplete or wrong.`;
}

const DEFAULT_FALLBACK_MODELS: Record<LlmProvider, string> = {
  gemini: "gemini-3.5-flash-lite",
  groq: "",
  openai: "",
};

// Ordered list to try: primary model, backup models of the same provider,
// then any other provider that has a key. Unknown or retired model names are
// harmless because they fail fast and the next candidate is tried.
export function getLlmCandidates(): LlmConfig[] {
  const primary = getLlmConfig();
  if (!primary) return [];

  const out: LlmConfig[] = [];
  const seen = new Set<string>();
  const add = (c: LlmConfig) => {
    const id = `${c.provider}:${c.model}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(c);
  };

  add(primary);

  const extra = (clean(process.env[`${primary.provider.toUpperCase()}_FALLBACK_MODELS`]) || DEFAULT_FALLBACK_MODELS[primary.provider])
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const model of extra) add({ ...primary, model });

  for (const p of ORDER) {
    if (p === primary.provider) continue;
    const key = clean(process.env[PROVIDERS[p].keyVar]);
    if (!key) continue;
    add({ provider: p, url: PROVIDERS[p].url, key, model: clean(process.env[PROVIDERS[p].modelVar]) || PROVIDERS[p].defaultModel });
  }
  return out;
}