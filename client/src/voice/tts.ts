import { API_BASE } from "../api";

export interface TtsProvider {
  readonly name: string;
  isSupported(): boolean;
  prime?(): void;
  speak(text: string): Promise<void>;
  cancel(): void;
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const indian = voices.filter((v) => v.lang.replace("_", "-").toLowerCase() === "en-in");
  return (
    indian.find((v) => /female|heera|neerja|veena|google/i.test(v.name)) ??
    indian[0] ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en"))
  );
}

export class BrowserTts implements TtsProvider {
  readonly name = "browser-speech-synthesis";

  constructor() {
    if (this.isSupported()) window.speechSynthesis.onvoiceschanged = () => undefined;
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  // Some browsers (Safari) only allow speech after a user gesture: call from the click handler.
  prime(): void {
    if (!this.isSupported()) return;
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  speak(text: string): Promise<void> {
    if (!this.isSupported()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = "en-IN";
      }
      u.rate = 1;
      u.pitch = 1.05;
      u.onend = () => resolve();
      u.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") resolve();
        else reject(new Error(e.error));
      };
      window.speechSynthesis.speak(u);
    });
  }

  cancel(): void {
    if (this.isSupported()) window.speechSynthesis.cancel();
  }
}

// Premium voice through the server proxy. The ElevenLabs key never reaches the browser.
export class ElevenLabsTts implements TtsProvider {
  readonly name = "elevenlabs";
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private ctrl: AbortController | null = null;
  private settle: (() => void) | null = null;

  isSupported(): boolean {
    return true;
  }

  async speak(text: string): Promise<void> {
    this.cancel();
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      throw e;
    }
    if (!res.ok) throw new Error(`TTS failed (${res.status})`);
    const blob = await res.blob();
    if (ctrl.signal.aborted) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.audio = audio;
    this.url = url;
    await new Promise<void>((resolve, reject) => {
      this.settle = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed"));
      audio.play().catch(reject);
    });
    this.release();
  }

  cancel(): void {
    this.ctrl?.abort();
    this.ctrl = null;
    this.audio?.pause();
    this.settle?.();
    this.settle = null;
    this.release();
  }

  private release(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.audio = null;
  }
}

// If the primary voice fails, fall back so the call never goes silent.
class FallbackTts implements TtsProvider {
  readonly name: string;
  private primary: TtsProvider;
  private fallback: TtsProvider;

  constructor(primary: TtsProvider, fallback: TtsProvider) {
    this.primary = primary;
    this.fallback = fallback;
    this.name = `${primary.name}+${fallback.name}`;
  }
  isSupported(): boolean {
    return this.primary.isSupported() || this.fallback.isSupported();
  }
  prime(): void {
    this.primary.prime?.();
    this.fallback.prime?.();
  }
  async speak(text: string): Promise<void> {
    try {
      await this.primary.speak(text);
    } catch {
      await this.fallback.speak(text);
    }
  }
  cancel(): void {
    this.primary.cancel();
    this.fallback.cancel();
  }
}

export function createTts(): TtsProvider {
  const browser = new BrowserTts();
  if (import.meta.env.VITE_TTS_PROVIDER === "elevenlabs") return new FallbackTts(new ElevenLabsTts(), browser);
  return browser;
}