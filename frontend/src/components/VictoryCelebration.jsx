import React, { useEffect, useMemo, useState } from "react";
import { Bomb, Crown, Sparkles } from "lucide-react";

const PIECES = 54;

export default function VictoryCelebration({ winner }) {
  const [visible, setVisible] = useState(true);
  const pieces = useMemo(
    () => Array.from({ length: PIECES }, (_, i) => ({
      id: i,
      left: `${8 + Math.random() * 84}%`,
      delay: `${Math.random() * 0.45}s`,
      duration: `${1.7 + Math.random() * 1.5}s`,
      rotate: `${Math.random() * 280 - 140}deg`,
      x: `${Math.random() * 180 - 90}px`,
    })),
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-white/0 animate-[victoryFlash_0.7s_ease-out_1]" />
      <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-yellow-300/90 animate-[shockwave_1.25s_ease-out_1]" />
      <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 animate-[victoryBoom_0.85s_cubic-bezier(.2,.9,.2,1)_1]">
        <div className="flex flex-col items-center">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/20 bg-gradient-to-br from-fuchsia-500/80 via-pink-500/70 to-orange-400/70 shadow-[0_0_80px_rgba(255,62,165,.5)] backdrop-blur-xl">
            <Bomb className="h-14 w-14 text-white drop-shadow-lg" />
            <Sparkles className="absolute -right-2 -top-2 h-8 w-8 text-yellow-200 animate-pulse" />
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-full border border-yellow-300/30 bg-black/50 px-5 py-2 backdrop-blur-xl">
            <Crown className="h-5 w-5 text-yellow-300" />
            <span className="text-sm font-black uppercase tracking-[0.2em] text-yellow-100">BOOM! {winner} WINS</span>
          </div>
        </div>
      </div>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[42%] h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-yellow-200 via-fuchsia-400 to-cyan-300 opacity-0"
          style={{
            left: p.left,
            animation: `victoryPiece ${p.duration} cubic-bezier(.12,.76,.26,1) ${p.delay} 1 forwards`,
            '--vx': p.x,
            transform: `rotate(${p.rotate})`,
          }}
        />
      ))}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 backdrop-blur-xl">
        Match complete · mic officially conquered
      </div>
    </div>
  );
}
