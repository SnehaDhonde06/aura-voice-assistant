import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchSummary, sendChat } from "../api";
import { MicMeter } from "../voice/mic";
import { BrowserStt } from "../voice/stt";
import { createTts } from "../voice/tts";
import type { CallState, InputMode, MicStatus, Phase, Role, SummaryState, Turn, TurnTrace } from "../types";

const GREETING = "Namaste! I'm Aria from Aura Skincare. How can I help you today?";
const PERMISSION_MSG =
  "Microphone access is blocked. Click the lock icon in your browser's address bar, allow the microphone, and start a new call. You can also type to Aria below.";

const stt = new BrowserStt();
const tts = createTts();
const meter = new MicMeter();

function sttMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return PERMISSION_MSG;
    case "network":
      return "Speech recognition couldn't reach its service. Check your internet connection (some browsers such as Brave block it), or type to Aria instead.";
    case "audio-capture":
      return "No working microphone was found. You can type to Aria instead.";
    default:
      return `Voice input stopped working (${code}). You can type to Aria instead.`;
  }
}

export type CallApi = ReturnType<typeof useCall>;

export function useCall() {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [callState, setCallState] = useState<CallState>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [traces, setTraces] = useState<TurnTrace[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [mic, setMic] = useState<MicStatus>("off");
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [online, setOnline] = useState(true);
  const [summary, setSummary] = useState<SummaryState>({ status: "idle" });

  const levelRef = useRef(0);
  const active = useRef(false);
  const busy = useRef(false);
  const epoch = useRef(0);
  const modeRef = useRef<InputMode>("voice");
  const turnsRef = useRef<Turn[]>([]);
  const fns = useRef<{ listen: () => void; handle: (text: string) => Promise<void> }>({
    listen: () => undefined,
    handle: async () => undefined,
  });

  useEffect(() => {
    if (phase !== "call") return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      active.current = false;
      stt.stop();
      tts.cancel();
      meter.stop();
    };
  }, []);

  const pushTurn = useCallback((role: Role, text: string) => {
    turnsRef.current = [...turnsRef.current, { role, text, ts: new Date().toISOString() }];
    setTurns(turnsRef.current);
  }, []);

  const popTurn = useCallback(() => {
    turnsRef.current = turnsRef.current.slice(0, -1);
    setTurns(turnsRef.current);
  }, []);

      const speak = useCallback(async (text: string, myEpoch: number) => {
    setCallState("speaking");

    // Start a VAD loop: if the customer speaks while Aria is talking, interrupt.
    let bargedIn = false;
    const SILENCE_THRESHOLD = 0.04;
    let loudFrames = 0;
    const FRAMES_TO_TRIGGER = 8; // ~130 ms of audio above threshold
    const vadId = window.setInterval(() => {
      if (epoch.current !== myEpoch || !active.current) {
        window.clearInterval(vadId);
        return;
      }
      if (levelRef.current > SILENCE_THRESHOLD) {
        loudFrames++;
        if (loudFrames >= FRAMES_TO_TRIGGER && !bargedIn) {
          bargedIn = true;
          window.clearInterval(vadId);
          tts.cancel();
        }
      } else {
        loudFrames = 0;
      }
    }, 16);

    try {
      await tts.speak(text);
    } catch {
      if (epoch.current === myEpoch) {
        setError("Aria's voice couldn't be played. You can still read her reply on screen.");
      }
    } finally {
      window.clearInterval(vadId);
    }
  }, []);

  const afterTurn = useCallback(() => {
    if (!active.current) return;
    if (modeRef.current === "voice") fns.current.listen();
    else setCallState("idle");
  }, []);

  const fallbackToText = useCallback((message: string) => {
    modeRef.current = "text";
    setInputMode("text");
    stt.stop();
    setError(message);
    if (active.current && !busy.current) setCallState("idle");
  }, []);

  const listen = useCallback(() => {
    if (!active.current) return;
    const myEpoch = epoch.current;
    setCallState("listening");
    setInterim("");
    stt.start({
      onInterim: (t) => {
        if (epoch.current === myEpoch) setInterim(t);
      },
      onFinal: (t) => {
        if (epoch.current === myEpoch) void fns.current.handle(t);
      },
      onError: (code) => {
        if (epoch.current !== myEpoch) return;
        if (code === "no-speech" || code === "aborted") return; // onEnd restarts listening
        if (code === "not-allowed" || code === "service-not-allowed") setMic("denied");
        fallbackToText(sttMessage(code));
      },
      onEnd: () => {
        if (epoch.current !== myEpoch || !active.current || busy.current || modeRef.current !== "voice") return;
        window.setTimeout(() => {
          if (epoch.current === myEpoch && active.current && !busy.current && modeRef.current === "voice") {
            fns.current.listen();
          }
        }, 300);
      },
    });
  }, [fallbackToText]);

  const handleUtterance = useCallback(
    async (text: string) => {
      if (!active.current || busy.current || !text.trim()) return;
      busy.current = true;
      const myEpoch = epoch.current;
      stt.stop();
      setInterim("");
      setError(null);
      pushTurn("user", text);
      setCallState("thinking");
      try {
        const history = turnsRef.current.map((t) => ({ role: t.role, content: t.text }));
        const res = await sendChat(history);
        if (epoch.current !== myEpoch) return;
        setOnline(true);
        pushTurn("assistant", res.reply);
        setTraces((prev) => [
          ...prev,
          { id: prev.length + 1, userText: text, tools: res.trace, totalMs: res.totalMs, guardrailBlocked: res.guardrailBlocked },
        ]);
        await speak(res.reply, myEpoch);
      } catch (e) {
        if (epoch.current !== myEpoch) return;
        popTurn();
        if (e instanceof ApiError && e.status === 0) setOnline(false);
        setError(
          `${e instanceof ApiError ? e.message : "Something went wrong."} I couldn't answer "${text}". Please try again.`,
        );
      } finally {
        if (epoch.current === myEpoch) {
          busy.current = false;
          afterTurn();
        }
      }
    },
    [afterTurn, popTurn, pushTurn, speak],
  );

    useEffect(() => {
    fns.current.listen = listen;
    fns.current.handle = handleUtterance;
  }, [listen, handleUtterance]);

  const startCall = useCallback(async () => {
    tts.prime?.();
    const myEpoch = ++epoch.current;
    active.current = true;
    busy.current = false;
    turnsRef.current = [];
    setTurns([]);
    setTraces([]);
    setSeconds(0);
    setError(null);
    setNotice(null);
    setInterim("");
    setSummary({ status: "idle" });
    setPhase("call");
    setCallState("idle");

    let mode: InputMode = "voice";
    if (!stt.isSupported()) {
      mode = "text";
      setNotice("Voice input isn't supported in this browser, so you can type to Aria instead. For voice, try Chrome or Edge.");
    } else {
      setMic("requesting");
      try {
        await meter.start((v) => {
          levelRef.current = v;
        });
        if (epoch.current !== myEpoch) {
          meter.stop();
          return;
        }
        setMic("on");
      } catch (e) {
        if (epoch.current !== myEpoch) return;
        mode = "text";
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setMic(denied ? "denied" : "unavailable");
        setError(denied ? PERMISSION_MSG : "No working microphone was found, so you can type to Aria instead.");
      }
    }
    modeRef.current = mode;
    setInputMode(mode);

    pushTurn("assistant", GREETING);
    busy.current = true;
    await speak(GREETING, myEpoch);
    if (epoch.current !== myEpoch) return;
    busy.current = false;
    afterTurn();
  }, [afterTurn, pushTurn, speak]);

  const loadSummary = useCallback(async () => {
    setSummary({ status: "loading" });
    try {
      const data = await fetchSummary(turnsRef.current);
      setSummary({ status: "ready", data });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) setSummary({ status: "empty" });
      else setSummary({ status: "error", message: e instanceof ApiError ? e.message : "The summary could not be generated." });
    }
  }, []);

  const endCall = useCallback(async () => {
    epoch.current++;
    active.current = false;
    busy.current = false;
    stt.stop();
    tts.cancel();
    meter.stop();
    levelRef.current = 0;
    setCallState("idle");
    setInterim("");
    setMic("off");
    setPhase("summary");
    if (!turnsRef.current.some((t) => t.role === "user")) {
      setSummary({ status: "empty" });
      return;
    }
    await loadSummary();
  }, [loadSummary]);

  const submitText = useCallback((text: string) => {
    const t = text.trim().slice(0, 500);
    if (!t || !active.current || busy.current) return;
    void fns.current.handle(t);
  }, []);

  const interrupt = useCallback(() => tts.cancel(), []);

  const reset = useCallback(() => {
    turnsRef.current = [];
    setTurns([]);
    setTraces([]);
    setSummary({ status: "idle" });
    setError(null);
    setNotice(null);
    setSeconds(0);
    setPhase("welcome");
  }, []);

  return {
    phase, callState, turns, interim, error, notice, traces, seconds, mic, inputMode, online, summary,
    levelRef, startCall, endCall, submitText, interrupt, reset, retrySummary: loadSummary,
  };
}