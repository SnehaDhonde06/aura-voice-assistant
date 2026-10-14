import { useEffect, useState } from "react";
import { fetchHealth } from "../api";
import { Orb } from "../components/Orb";

const NO_LEVEL = { current: 0 };
type Health = "checking" | "ok" | "no-llm" | "offline";

export function Welcome({ onStart }: { onStart: () => Promise<void> }) {
  const [health, setHealth] = useState<Health>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((h) => {
        if (!cancelled) setHealth(h.llmConfigured ? "ok" : "no-llm");
      })
      .catch(() => {
        if (!cancelled) setHealth("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setHealth("checking");
    setAttempt((a) => a + 1);
  };

  return (
    <section className="welcome">
      <Orb state="idle" levelRef={NO_LEVEL} />
      <h1>Meet Aria.</h1>
      <p className="lede">
        Aura Skincare's voice support specialist. Ask about an order, delivery, returns, or our policies, just by speaking.
      </p>

      <button className="btn btn--primary" disabled={health !== "ok"} onClick={() => void onStart()}>
        Start call
      </button>

      <p className="status-line" role="status">
        {health === "checking" && "Checking Aria's connection…"}
        {health === "ok" && "Aria is ready. Your microphone is only used during the call."}
        {health === "no-llm" && "The server is running but no LLM API key is set. Add GEMINI_API_KEY (or GROQ_API_KEY) to server/.env and restart."}
        {health === "offline" && (
          <>
            I can't reach the server. <button className="link" onClick={retry}>Retry</button>
          </>
        )}
      </p>
      <p className="muted small">Voice works best in Chrome or Edge. Other browsers can type to Aria.</p>
    </section>
  );
}