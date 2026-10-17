// Browser speech recognition with dual en-IN + hi-IN recognizers for Hinglish.
// Falls back to text input in browsers that don't support Web Speech API.
export interface SttEvents {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(code: string): void;
  onEnd(): void;
}

export interface SttProvider {
  readonly name: string;
  isSupported(): boolean;
  start(events: SttEvents): void;
  stop(): void;
}

interface RecItem { transcript: string }
interface RecResult { isFinal: boolean; 0: RecItem }
interface RecEvent { resultIndex: number; results: ArrayLike<RecResult> }
interface Rec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecCtor = new () => Rec;

function getCtor(): RecCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

// One utterance per session; the call hook restarts listening after Aria finishes speaking.
// That also stops Aria from hearing herself.
export class BrowserStt implements SttProvider {
  readonly name = "browser-web-speech";
  private rec: Rec | null = null;
  private _recs: Rec[] = [];

  isSupported(): boolean {
    return getCtor() !== undefined;
  }

  isActive(): boolean {
    return this.rec !== null;
  }

    start(events: SttEvents): void {
      
    const Ctor = getCtor();
    if (!Ctor) { events.onError("not-supported"); return; }
    this.stop();

    // Try two recognizers in parallel: one tuned for Indian English and one for Hindi.
    // The first final result wins and aborts the other. Interim text comes from whichever
    // fires first, which gives natural-feeling feedback for both languages.
    const LANGS = ["en-IN", "hi-IN"];
    let settled = false;
    const recs: Rec[] = [];

    const settle = (final: string) => {
      if (settled) return;
      settled = true;
      recs.forEach((r) => { try { r.abort(); } catch { /* already stopped */ } });
      this.rec = null;
      events.onFinal(final);
      events.onEnd();
    };

    for (const lang of LANGS) {
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;

      rec.onresult = (e) => {
        if (settled && !recs.includes(rec as Rec)) return;
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (interim.trim() && !settled) events.onInterim(interim.trim());
        if (final.trim()) settle(final.trim());
      };
      rec.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        // One recognizer erroring is not fatal if the other is still running.
      };
      rec.onend = () => {
        // If both ended without a final result, emit onEnd so the call hook restarts.
        const allDone = recs.every((r) => r === rec || !this.rec);
        if (allDone && !settled) { settled = true; events.onEnd(); }
      };

      recs.push(rec);
      // Stagger the second one slightly so Chrome doesn't block the second mic request.
      window.setTimeout(() => { try { rec.start(); } catch { /* mic denied */ } }, lang === "hi-IN" ? 80 : 0);
    }

    this.rec = recs[0];
    this._recs = recs;
  }

    stop(): void {
    const recs = [this.rec, ...this._recs].filter(Boolean) as Rec[];
    this.rec = null;
    this._recs = [];
    for (const r of recs) { try { r.abort(); } catch { /* already stopped */ } }
  }
}