import { useCallback, useState } from "react";
import { AskPanel, Drawer, OrdersPanel, TracePanel } from "./components/Drawer";
import { useCall } from "./hooks/useCall";
import { CallScreen } from "./screens/CallScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { Welcome } from "./screens/Welcome";

type DrawerId = "orders" | "ask" | "trace";

export default function App() {
  const call = useCall();
  const [drawer, setDrawer] = useState<DrawerId | null>(null);
  const close = useCallback(() => setDrawer(null), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__leaf" aria-hidden="true">❦</span>
          <span className="brand__name">Aura</span>
          <span className="brand__sub">Voice Studio</span>
        </div>
        <span className="badge badge--gold">Demo data</span>
      </header>

      <main className="stage">
        {call.phase === "welcome" && <Welcome onStart={call.startCall} />}
        {call.phase === "call" && <CallScreen call={call} />}
        {call.phase === "summary" && <SummaryScreen call={call} />}
      </main>

      {call.phase !== "summary" && (
        <nav className="dock" aria-label="Helpers">
          <button className="dock__btn" onClick={() => setDrawer("orders")}>Sample orders</button>
          <button className="dock__btn" onClick={() => setDrawer("ask")}>Try asking</button>
          <button className="dock__btn" onClick={() => setDrawer("trace")}>Under the hood</button>
        </nav>
      )}

      <Drawer title="Sample orders" open={drawer === "orders"} onClose={close}><OrdersPanel /></Drawer>
      <Drawer title="Try asking" open={drawer === "ask"} onClose={close}>
        <AskPanel enabled={call.phase === "call"} onAsk={(q) => { call.submitText(q); close(); }} />
      </Drawer>
      <Drawer title="Under the hood" open={drawer === "trace"} onClose={close}><TracePanel traces={call.traces} /></Drawer>
    </div>
  );
}