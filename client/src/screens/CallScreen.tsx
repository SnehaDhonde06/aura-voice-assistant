import { useState, type FormEvent } from "react";
import type { CallApi } from "../hooks/useCall";
import { Orb } from "../components/Orb";
import { fmtTime } from "../utils";

const STATE_LABEL = { idle: "Ready", listening: "Listening", thinking: "Thinking", speaking: "Speaking" } as const;

function micLabel(call: CallApi): string {
  if (call.inputMode === "text" && call.mic !== "requesting") return "Typing mode";
  switch (call.mic) {
    case "requesting": return "Waiting for mic permission…";
    case "on": return "Mic on";
    case "denied": return "Mic blocked";
    case "unavailable": return "No mic";
    default: return "Mic off";
  }
}

export function CallScreen({ call }: { call: CallApi }) {
  const [draft, setDraft] = useState("");
  const last = call.turns[call.turns.length - 1];
  const caption = call.interim || last?.text || "";
  const who = call.interim || last?.role === "user" ? "You" : "Aria";
  const canType = call.callState === "idle" || call.callState === "listening";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !canType) return;
    call.submitText(draft);
    setDraft("");
  };

  return (
    <section className="call">
      <div className="statusbar" aria-label="Call status">
        <span className={`dot ${call.online ? "dot--ok" : "dot--bad"}`} aria-hidden="true" />
        <span>{call.online ? "Connected" : "Connection issue"}</span>
        <span className="sep" aria-hidden="true" />
        <time>{fmtTime(call.seconds)}</time>
        <span className="sep" aria-hidden="true" />
        <span>{micLabel(call)}</span>
      </div>

      <Orb state={call.callState} levelRef={call.levelRef} />
      <p className="state" aria-live="polite">{STATE_LABEL[call.callState]}</p>

      <div className="caption" aria-live="polite">
        {caption && (
          <>
            <span className="caption__who">{who}</span>
            <p>{caption}</p>
          </>
        )}
      </div>

      {call.notice && <p className="banner">{call.notice}</p>}
      {call.error && <p className="banner banner--error" role="alert">{call.error}</p>}

      <form className="typebar" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={call.inputMode === "text" ? "Type your message to Aria…" : "Or type here instead of speaking…"}
          aria-label="Type a message to Aria"
          maxLength={500}
          disabled={!canType}
        />
        <button className="btn btn--ghost" type="submit" disabled={!canType || !draft.trim()}>Send</button>
      </form>

      <div className="controls">
        {call.callState === "speaking" && (
          <button className="btn btn--ghost" onClick={call.interrupt}>Skip</button>
        )}
        <button className="btn btn--end" onClick={() => void call.endCall()}>End call</button>
      </div>
    </section>
  );
}