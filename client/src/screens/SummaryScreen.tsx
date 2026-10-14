import { useState } from "react";
import type { CallApi } from "../hooks/useCall";
import { fmtTime } from "../utils";


const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function SummaryScreen({ call }: { call: CallApi }) {
  const s = call.summary;
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (s.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(s.data, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: user can select the JSON manually */
    }
  };

  return (
    <section className="summary">
      <header>
        <h1>Call summary</h1>
        <p className="muted">{fmtTime(call.seconds)} · {call.turns.length} messages</p>
      </header>

      <div className="summary__grid">
        <article className="card">
          <h2>Outcome</h2>
          {s.status === "loading" && <p className="muted">Preparing your summary…</p>}
          {s.status === "empty" && <p className="muted">No customer speech was recorded, so no summary was generated.</p>}
          {s.status === "error" && (
            <div>
              <p className="banner banner--error" role="alert">{s.message}</p>
              <button className="btn btn--ghost" onClick={() => void call.retrySummary()}>Retry</button>
            </div>
          )}
          {s.status === "ready" && (
            <>
              <dl className="facts">
                <div><dt>Intent</dt><dd>{pretty(s.data.customer_intent)}</dd></div>
                <div><dt>Order ID</dt><dd>{s.data.order_id ?? "None given"}</dd></div>
                <div><dt>Status</dt><dd><span className="badge badge--gold">{pretty(s.data.resolution_status)}</span></dd></div>
              </dl>
              <p>{s.data.call_summary}</p>
              {s.data.extracted_facts.length > 0 && (
                <>
                  <h3>Facts used</h3>
                  <ul>{s.data.extracted_facts.map((f) => <li key={f}>{f}</li>)}</ul>
                </>
              )}
              <h3>Actions completed</h3>
              <p className="muted">{s.data.actions_completed.length === 0 ? "None. No account changes were made." : s.data.actions_completed.join("; ")}</p>
              {s.data.unresolved_questions.length > 0 && (
                <>
                  <h3>Unresolved</h3>
                  <ul>{s.data.unresolved_questions.map((q) => <li key={q}>{q}</li>)}</ul>
                </>
              )}
              <div className="row">
                <button className="btn btn--ghost" onClick={() => setShowJson((v) => !v)} aria-expanded={showJson}>
                  {showJson ? "Hide JSON" : "View JSON"}
                </button>
                <button className="btn btn--ghost" onClick={() => void copy()}>{copied ? "Copied" : "Copy JSON"}</button>
              </div>
              {showJson && <pre>{JSON.stringify(s.data, null, 2)}</pre>}
            </>
          )}
        </article>

        <article className="card">
          <h2>Transcript</h2>
          {call.turns.length === 0 ? (
            <p className="muted">No conversation took place.</p>
          ) : (
            <ol className="transcript">
              {call.turns.map((t, i) => (
                <li key={i} className={t.role === "user" ? "turn turn--user" : "turn"}>
                  <span className="turn__who">{t.role === "user" ? "Customer" : "Aria"}</span>
                  <time className="muted small">{new Date(t.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                  <p>{t.text}</p>
                </li>
              ))}
            </ol>
          )}
        </article>
      </div>

      <button className="btn btn--primary" onClick={call.reset}>Start a new call</button>
    </section>
  );
}