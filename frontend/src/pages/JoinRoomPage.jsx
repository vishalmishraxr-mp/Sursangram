import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import GlassCard from "../components/GlassCard.jsx";
import Button from "../components/Button.jsx";
import ErrorText from "../components/ErrorText.jsx";
import { joinRoom } from "../services/api.js";
import { useSession } from "../context/SessionContext.jsx";

export default function JoinRoomPage() {
  const navigate = useNavigate();
  const { setSession } = useSession();

  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleJoin(e) {
    e.preventDefault();
    setError("");
    if (!roomCode.trim() || !displayName.trim()) {
      setError("Enter both a room code and your name.");
      return;
    }
    setLoading(true);
    try {
      const code = roomCode.trim().toUpperCase();
      const { room, playerId } = await joinRoom(code, {
        displayName: displayName.trim(),
      });
      setSession(room.roomCode, playerId, displayName.trim());
      navigate(`/lobby/${room.roomCode}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10 max-w-md mx-auto flex items-center">
      <GlassCard className="w-full">
        <h1 className="text-2xl font-display font-bold mb-6 text-center">
          Join a Room
        </h1>
        <form onSubmit={handleJoin} className="space-y-5">
          <div>
            <label className="block text-sm text-white/70 mb-1">Room code</label>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ANTA72KQ"
              maxLength={8}
              className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 tracking-widest uppercase outline-none focus:border-neon-cyan"
            />
          </div>
          <div>
            <label className="block text-sm text-white/70 mb-1">Your name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={24}
              placeholder="e.g. Rahul"
              className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 outline-none focus:border-neon-cyan"
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Joining..." : "Join Room"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
