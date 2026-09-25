import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import GlassCard from "../components/GlassCard.jsx";
import Button from "../components/Button.jsx";
import ErrorText from "../components/ErrorText.jsx";
import { createRoom } from "../services/api.js";
import { useSession } from "../context/SessionContext.jsx";

const intensities = ["mild", "savage", "full-chaos", "off"];
const modes = ["classic", "chaos", "dare", "battle"];

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const { setSession } = useSession();

  const [hostDisplayName, setHostDisplayName] = useState("");
  const [gameMode, setGameMode] = useState("classic");
  const [rounds, setRounds] = useState(10);
  const [turnDurationSeconds, setTurnDurationSeconds] = useState(30);
  const [roastEnabled, setRoastEnabled] = useState(true);
  const [roastIntensity, setRoastIntensity] = useState("mild");
  const [randomJamMode, setRandomJamMode] = useState(true);
  const [specialChallenges, setSpecialChallenges] = useState(true);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!hostDisplayName.trim()) {
      setError("Enter your name first.");
      return;
    }
    setLoading(true);
    try {
      const { room, playerId } = await createRoom({
        hostDisplayName: hostDisplayName.trim(),
        settings: {
          gameMode,
          rounds: Number(rounds),
          turnDurationSeconds: Math.min(30, Math.max(10, Number(turnDurationSeconds) || 30)),
          roastHost: { enabled: roastEnabled, intensity: roastIntensity },
          randomJamMode,
          specialChallenges,
        },
      });
      setSession(room.roomCode, playerId, hostDisplayName.trim());
      navigate(`/lobby/${room.roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <h1 className="text-3xl font-display font-bold mb-6 text-center">
        Create a Room
      </h1>
      <GlassCard>
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="block text-sm text-white/70 mb-1">Your name</label>
            <input
              value={hostDisplayName}
              onChange={(e) => setHostDisplayName(e.target.value)}
              maxLength={24}
              placeholder="e.g. Vishal"
              className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 outline-none focus:border-neon-violet"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1">Game mode</label>
            <div className="grid grid-cols-4 gap-2">
              {modes.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setGameMode(m)}
                  className={`py-2 rounded-lg text-sm capitalize border ${
                    gameMode === m
                      ? "bg-neon-violet/30 border-neon-violet"
                      : "border-white/15 hover:bg-white/5"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">Rounds</label>
              <input
                type="number"
                min={1}
                max={50}
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 outline-none focus:border-neon-violet"
              />
              <p className="text-xs text-white/35 mt-1.5">30-second turn · song preview plays for the turn</p>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">
                Song play time (sec)
              </label>
              <input
                type="number"
                min={10}
                max={30}
                value={turnDurationSeconds}
                onChange={(e) => setTurnDurationSeconds(Math.min(30, Math.max(10, Number(e.target.value) || 30)))}
                className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 outline-none focus:border-neon-violet"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">AI Roast Host</span>
            <button
              type="button"
              onClick={() => setRoastEnabled((v) => !v)}
              className={`w-12 h-6 rounded-full transition ${
                roastEnabled ? "bg-neon-pink" : "bg-white/15"
              }`}
            >
              <span
                className={`block w-5 h-5 bg-white rounded-full transition transform ${
                  roastEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {roastEnabled && (
            <div>
              <label className="block text-sm text-white/70 mb-1">
                Roast intensity
              </label>
              <div className="grid grid-cols-4 gap-2">
                {intensities
                  .filter((i) => i !== "off")
                  .map((i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setRoastIntensity(i)}
                      className={`py-1.5 rounded-lg text-xs capitalize border ${
                        roastIntensity === i
                          ? "bg-neon-pink/30 border-neon-pink"
                          : "border-white/15 hover:bg-white/5"
                      }`}
                    >
                      {i}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">Random Jam Mode</span>
            <button
              type="button"
              onClick={() => setRandomJamMode((v) => !v)}
              className={`w-12 h-6 rounded-full transition ${
                randomJamMode ? "bg-neon-cyan" : "bg-white/15"
              }`}
            >
              <span
                className={`block w-5 h-5 bg-white rounded-full transition transform ${
                  randomJamMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">Special Challenges</span>
            <button
              type="button"
              onClick={() => setSpecialChallenges((v) => !v)}
              className={`w-12 h-6 rounded-full transition ${
                specialChallenges ? "bg-neon-cyan" : "bg-white/15"
              }`}
            >
              <span
                className={`block w-5 h-5 bg-white rounded-full transition transform ${
                  specialChallenges ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <ErrorText>{error}</ErrorText>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating..." : "Create Room"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
