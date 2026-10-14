import { describe, expect, it } from "vitest";
import { pickModel } from "../src/services/modelDiscovery.js";

describe("pickModel", () => {
  it("picks the newest non-lite Gemini flash and skips non-chat models", () => {
    const ids = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash", "text-embedding-004", "gemini-3.8-flash-preview-tts"];
    expect(pickModel("gemini", ids)).toBe("gemini-3.8-flash");
  });

  it("picks a preferred Groq model and ignores audio models", () => {
    expect(pickModel("groq", ["whisper-large-v3", "openai/gpt-oss-20b", "llama-3.1-8b-instant"])).toBe("openai/gpt-oss-20b");
  });

  it("returns null when nothing suitable exists", () => {
    expect(pickModel("groq", ["whisper-large-v3"])).toBeNull();
  });
});