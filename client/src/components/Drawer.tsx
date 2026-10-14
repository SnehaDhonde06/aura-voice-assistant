import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchOrders } from "../api";
import type { PublicOrder, TurnTrace } from "../types";

export function Drawer({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-wrap">
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer__head">
          <h2>{title}</h2>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close panel">✕</button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </div>
  );
}

export function OrdersPanel() {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; label: string; orders: PublicOrder[] }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchOrders()
      .then((r) => !cancelled && setState({ status: "ready", label: r.label, orders: r.orders }))
      .catch((e: Error) => !cancelled && setState({ status: "error", message: e.message }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.status === "loading") return <p className="muted">Loading sample orders…</p>;
  if (state.status === "error") {
    return (
      <div>
        <p role="alert" className="banner banner--error">{state.message}</p>
        <button className="btn btn--ghost" onClick={() => { setState({ status: "loading" }); setAttempt((a) => a + 1); }}>Retry</button>
      </div>
    );
  }
  return (
    <div className="stack">
      <p className="muted">{state.label} Say or type any of these order IDs.</p>
      {state.orders.map((o) => (
        <article key={o.orderId} className="card card--order">
          <div className="row">
            <strong>{o.orderId}</strong>
            <span className="badge">{o.status}</span>
          </div>
          <p>{o.product}</p>
          <p className="muted">₹{o.valueInr} · {o.customerFirstName}</p>
          {o.carrier && <p className="muted">{o.carrier} · {o.trackingId}</p>}
          {o.expectedDelivery && <p className="muted">Expected: {o.expectedDelivery}</p>}
          {o.deliveredDaysAgo !== undefined && <p className="muted">Delivered {o.deliveredDaysAgo} days ago</p>}
          {o.orderedHoursAgo !== undefined && <p className="muted">Ordered {o.orderedHoursAgo} hours ago · eligible for cancellation</p>}
        </article>
      ))}
    </div>
  );
}

const SUGGESTIONS = [
  "Where is order ORD-101?",
  "Can I cancel ORD-103?",
  "I received my sunscreen 14 days ago. Can I return it?",
  "How much is shipping for an order worth ₹400?",
  "Can you book me a flight to Goa?",
  "I need an update on order ORD-999.",
];

export function AskPanel({ enabled, onAsk }: { enabled: boolean; onAsk: (q: string) => void }) {
  return (
    <div className="stack">
      <p className="muted">
        {enabled
          ? "Just say these out loud, or tap one to send it as text."
          : "Start a call first, then say these out loud or tap one to send it."}
      </p>
      {SUGGESTIONS.map((q) => (
        <button key={q} className="chip" disabled={!enabled} onClick={() => onAsk(q)}>{q}</button>
      ))}
    </div>
  );
}

export function TracePanel({ traces }: { traces: TurnTrace[] }) {
  if (traces.length === 0) {
    return <p className="muted">Tool calls, policy verdicts and server reply times appear here once Aria answers something.</p>;
  }
  return (
    <div className="stack">
      {traces.map((t) => (
        <article key={t.id} className="card">
          <p className="muted">You: “{t.userText}”</p>
          <p className="muted">Server reply time: {t.totalMs} ms</p>
          {t.guardrailBlocked && <p className="banner banner--error">Guardrail blocked an unconfirmed action claim.</p>}
          {t.tools.length === 0 && <p>No tools were needed.</p>}
          {t.tools.map((tool, i) => (
            <details key={i}>
              <summary>{tool.name} · {tool.ms} ms</summary>
              <pre>{JSON.stringify({ args: tool.args, result: tool.result }, null, 2)}</pre>
            </details>
          ))}
        </article>
      ))}
    </div>
  );
}