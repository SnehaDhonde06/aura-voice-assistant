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

  isSupported(): boolean {
    return getCtor() !== undefined;
  }

  start(events: SttEvents): void {
    const Ctor = getCtor();
    if (!Ctor) {
      events.onError("not-supported");
      return;
    }
    this.stop();
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      if (this.rec !== rec) return;
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim.trim()) events.onInterim(interim.trim());
      if (final.trim()) events.onFinal(final.trim());
    };
    rec.onerror = (e) => {
      if (this.rec !== rec) return;
      events.onError(e.error);
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      events.onEnd();
    };

    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
      events.onError("start-failed");
    }
  }

  stop(): void {
    const rec = this.rec;
    this.rec = null;
    try {
      rec?.abort();
    } catch {
      /* already stopped */
    }
  }
}