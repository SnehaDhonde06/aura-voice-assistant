import { afterEach, describe, expect, it, vi } from "vitest";
import { describeKeyProblem, getLlmCandidates, getLlmConfig } from "../src/services/llmConfig.js";

afterEach(() => vi.unstubAllEnvs());

const clearKeys = () => {
  for (const k of ["OPENAI_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "LLM_PROVIDER"]) vi.stubEnv(k, "");
};

describe("getLlmConfig", () => {
  it("returns null when no keys are set", () => {
    clearKeys();
    expect(getLlmConfig()).toBeNull();
  });

  it("uses the first provider that has a key", () => {
    clearKeys();
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    expect(getLlmConfig()?.provider).toBe("groq");
  });

  it("honors LLM_PROVIDER", () => {
    clearKeys();
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GEMINI_API_KEY", "AIza_test");
    vi.stubEnv("LLM_PROVIDER", "gemini");
    expect(getLlmConfig()).toMatchObject({ provider: "gemini", model: "gemini-flash-latest" });
  });

  it("returns null when the chosen provider has no key", () => {
    clearKeys();
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("LLM_PROVIDER", "gemini");
    expect(getLlmConfig()).toBeNull();
  });

  it("trims quotes and spaces from keys", () => {
    clearKeys();
    vi.stubEnv("GEMINI_API_KEY", ' "AIza_test" ');
    expect(getLlmConfig()?.key).toBe("AIza_test");
  });
});

describe("describeKeyProblem", () => {
  it("flags a key placed in the wrong slot", () => {
    clearKeys();
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "gsk_wrongslot");
    const cfg = getLlmConfig();
    expect(cfg && describeKeyProblem(cfg)).toContain("groq");
  });
});

describe("getLlmCandidates", () => {
  it("returns primary, backup models, then other providers with keys", () => {
    clearKeys();
    vi.stubEnv("LLM_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "AIza_test");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    const ids = getLlmCandidates().map((c) => `${c.provider}:${c.model}`);
        expect(ids).toEqual([
      "gemini:gemini-flash-latest",
      "gemini:gemini-3.5-flash-lite",
      "groq:llama-3.3-70b-versatile",
    ]);
  });

  it("is empty when nothing is configured", () => {
    clearKeys();
    expect(getLlmCandidates()).toEqual([]);
  });
});