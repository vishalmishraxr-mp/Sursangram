import React, { useMemo } from "react";

const COLORS = ["#ff3ea5", "#8b5cf6", "#22d3ee", "#facc15"];
const PIECE_COUNT = 28;

/**
 * Phase 5 item #7 — "if confetti is added, keep it lightweight." This is
 * pure CSS keyframe animation over a handful of absolutely-positioned divs;
 * no canvas, no animation library, nothing to load. It renders once, plays
 * for ~2.5s, and leaves no persistent DOM cost (it's simple enough to just
 * leave mounted — no timers to clean up).
 */
export default function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 1.8 + Math.random() * 1.2,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
      })),
    []
  );

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-40" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-10px] w-2 h-3 rounded-sm opacity-90"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s 1 forwards`,
          }}
        />
      ))}
    </div>
  );
}
