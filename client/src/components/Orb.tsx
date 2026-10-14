import { useEffect, useRef } from "react";
import type { CallState } from "../types";

export function Orb({ state, levelRef }: { state: CallState; levelRef: { current: number } }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const target = state === "listening" ? levelRef.current : 0;
      smooth += (target - smooth) * 0.2;
      ref.current?.style.setProperty("--level", smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [state, levelRef]);

  return (
    <div ref={ref} className={`orb orb--${state}`} role="img" aria-label={`Aria is ${state}`}>
      <span className="orb__ring orb__ring--2" />
      <span className="orb__ring orb__ring--1" />
      <span className="orb__core" />
    </div>
  );
}