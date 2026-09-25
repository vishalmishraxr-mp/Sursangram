import React, { useMemo, useState } from "react";
import { ArrowLeft, Bot, Mic2, Play, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import GlassCard from "../components/GlassCard.jsx";
import Button from "../components/Button.jsx";
import ErrorText from "../components/ErrorText.jsx";

const modes = [
  ["classic", "Classic", "Letter chain + standard scoring", Mic2],
  ["chaos", "Chaos", "Random performance challenges", Sparkles],
  ["dare", "Dare", "Dare-only challenge pool", Sparkles],
];

export default function AISetupPage() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [rounds, setRounds] = useState(8);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [gameMode, setGameMode] = useState("classic");
  const [randomJamMode, setRandomJamMode] = useState(true);
  const [specialChallenges, setSpecialChallenges] = useState(true);
  const [roastHost, setRoastHost] = useState(true);
  const [roastIntensity, setRoastIntensity] = useState("savage");
  const [error, setError] = useState("");

  const canStart = useMemo(() => playerName.trim().length > 0, [playerName]);

  function start() {
    if (!canStart) {
      setError("Enter your name first.");
      return;
    }

    const setup = {
      vsAI: true,
      teamA: { name: playerName.trim(), members: [playerName.trim()] },
      teamB: { name: "Sursangram", members: ["AI Host"] },
      rounds: Math.max(1, Number(rounds) || 8),
      turnSeconds: Math.min(30, Math.max(10, Number(turnSeconds) || 30)),
      gameMode,
      randomJamMode,
      specialChallenges,
      roastHost,
      roastIntensity: roastHost ? roastIntensity : "off",
    };

    sessionStorage.setItem("antakshari_local_setup", JSON.stringify(setup));
    navigate("/local-game");
  }

  return (
    <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <button
        onClick={() => navigate("/")}
        className="text-white/60 hover:text-white flex items-center gap-2 mb-8"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <div className="rounded-2xl border border-neon-cyan/25 bg-neon-cyan/10 p-3">
            <Bot className="w-9 h-9 text-neon-cyan" />
          </div>
        </div>
        <h1 className="text-4xl font-display font-bold">Play with AI</h1>
        <p className="text-white/60 mt-2 max-w-2xl mx-auto">
          One player, one AI opponent, same Antakshari rules. The AI picks a fresh song,
          follows the letter chain and plays its song preview automatically.
        </p>
      </div>

      <GlassCard className="mb-5">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-neon-cyan/20 bg-neon-cyan/5 px-4 py-4 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-neon-cyan/70">Human player</p>
            <p className="font-display font-bold text-xl mt-1">Your Team</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40">Opponent</p>
            <p className="font-semibold">Sursangram</p>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-sm text-white/70 mb-1">Your name</label>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Vishal"
            className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 outline-none focus:border-neon-cyan"
          />
        </div>

        <div>
          <h2 className="font-display font-bold text-lg mb-3">Game mode</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {modes.map(([value, title, desc, Icon]) => (
              <button
                type="button"
                key={value}
                onClick={() => setGameMode(value)}
                className={`text-left rounded-xl border p-4 transition ${
                  gameMode === value
                    ? "border-neon-cyan bg-neon-cyan/10"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <Icon className="w-5 h-5 mb-2 text-neon-cyan" />
                <p className="font-semibold">{title}</p>
                <p className="text-xs text-white/50 mt-1">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-display font-bold text-xl mb-4">Match settings</h2>
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm text-white/60 mb-1">Rounds</label>
            <input
              type="number"
              min="1"
              max="20"
              value={rounds}
              onChange={(e) => setRounds(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5"
            />
          </div>
          <div>
            <label className="block text-sm text-white/60 mb-1">Song play time</label>
            <div>
              <div className="rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 text-white/80">
                30 seconds
              </div>
              <p className="text-xs text-white/35 mt-1.5">30s turn · song preview plays for the turn</p>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <label className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-3">
            <input
              type="checkbox"
              checked={randomJamMode}
              onChange={(e) => setRandomJamMode(e.target.checked)}
            />
            Random Jam fallback
          </label>
          <label className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-3">
            <input
              type="checkbox"
              checked={specialChallenges}
              onChange={(e) => setSpecialChallenges(e.target.checked)}
              disabled={gameMode === "classic"}
            />
            Special challenges
          </label>
          <label className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-3">
            <input
              type="checkbox"
              checked={roastHost}
              onChange={(e) => setRoastHost(e.target.checked)}
            />
            Roast Host
          </label>
        </div>

        {roastHost && (
          <div className="mt-4">
            <label className="block text-sm text-white/60 mb-1">Roast intensity</label>
            <select
              value={roastIntensity}
              onChange={(e) => setRoastIntensity(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5"
            >
              <option value="mild">Mild</option>
              <option value="savage">Savage</option>
              <option value="full-chaos">Full Chaos</option>
            </select>
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        <Button className="w-full mt-5" disabled={!canStart} onClick={start}>
          <Play className="inline w-4 h-4 mr-2" /> Start vs AI
        </Button>
      </GlassCard>
    </div>
  );
}
