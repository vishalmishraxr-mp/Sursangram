import React, { useEffect, useState, useRef } from "react";
import { Flame, Quote } from "lucide-react";

const DISPLAY_MS = 4000;

/**
 * Phase 5 item #2 — Roast Host UI.
 *
 * Renders as a small fixed banner pinned to the top of the viewport, above
 * the game content but never over the turn controls (which live further
 * down the page). Roasts are queued — if several arrive in a burst (e.g. a
 * validation result immediately followed by a comeback event), they're
 * shown one at a time rather than overlapping or getting lost.
 *
 * `roasts` is expected to be an array the parent only ever appends to
 * (each entry needs a stable `id`); this component manages its own
 * queue/visibility state internally and tells the parent when it has
 * consumed an entry via `onConsume(id)`, so the parent's list doesn't grow
 * forever.
 */
export default function RoastToast({ roasts, onConsume, resetKey }) {
  const [current, setCurrent] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    setCurrent(null);
  }, [resetKey]);

  useEffect(() => {
    if (current || roasts.length === 0) return;
    const next = roasts[0];
    setCurrent(next);
    timeoutRef.current = setTimeout(() => {
      setCurrent(null);
      onConsume(next.id);
    }, DISPLAY_MS);
    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roasts, current]);

  if (!current) return null;

  const isSongFinished = current.eventType === "SONG_FINISHED";

  return (
    <div
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,680px)] pointer-events-none"
      aria-live="polite"
    >
      <div className={`pointer-events-auto w-full min-h-[78px] rounded-2xl backdrop-blur-md shadow-glow border px-4 py-3.5 overflow-visible animate-[popIn_0.22s_ease-out] ${isSongFinished ? "border-neon-pink/55 bg-base-900/95" : "border-neon-pink/40 bg-base-900/90"}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 rounded-full p-2 ${isSongFinished ? "bg-neon-pink/15" : "bg-neon-pink/10"}`}>
            {isSongFinished ? <Quote className="w-4 h-4 text-neon-pink" /> : <Flame className="w-4 h-4 text-neon-pink" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-neon-pink/80 mb-1">Roast Host</p>
            <p className={`${isSongFinished ? "text-base font-semibold" : "text-sm"} text-white/95 leading-relaxed break-words whitespace-normal`}>“{current.text}”</p>
          </div>
        </div>
      </div>
    </div>
  );
}
