import React from "react";
import { Dices } from "lucide-react";

/**
 * Phase 5 items #3/#4 — Chaos Mode challenge display. Purely presentational:
 * it just renders whatever challenge object gameEngine.js already put on
 * `room.gameState.currentChallenge` (broadcast as part of normal room
 * state), so no extra socket wiring was needed on the frontend beyond
 * reading that field.
 */
export default function ChallengeBanner({ challenge, mode = "chaos", completed = false }) {
  if (!challenge) return null;

  return (
    <div className="mb-4 rounded-xl border border-neon-violet/40 bg-neon-violet/10 px-4 py-3 text-left animate-[popIn_0.2s_ease-out]">
      <div className="flex items-center gap-2 mb-1">
        <Dices className="w-4 h-4 text-neon-violet shrink-0" />
        <p className="text-xs uppercase tracking-wide text-neon-violet font-semibold">
          {mode === "dare" ? "Dare Mode" : "Chaos Challenge"} · {challenge.title}
        </p>
      </div>
      <p className="text-sm text-white/70">{challenge.description}</p>
      <p className="text-[11px] mt-2 text-white/45">{completed ? "Challenge marked complete" : "Complete it, then tap Challenge Done"}</p>
    </div>
  );
}
