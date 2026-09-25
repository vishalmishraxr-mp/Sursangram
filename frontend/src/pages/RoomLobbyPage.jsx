import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Copy, Check, Crown, Shuffle, WifiOff } from "lucide-react";
import GlassCard from "../components/GlassCard.jsx";
import Button from "../components/Button.jsx";
import ErrorText from "../components/ErrorText.jsx";
import { getSocket, emitAck } from "../services/socket.js";
import { useSession } from "../context/SessionContext.jsx";

function TeamPanel({
  teamId,
  team,
  players,
  isHost,
  myPlayerId,
  onRename,
  onSelfJoin,
  onHostAssign,
}) {
  const [nameDraft, setNameDraft] = useState(team.name);

  useEffect(() => setNameDraft(team.name), [team.name]);

  return (
    <GlassCard className="flex-1">
      {isHost ? (
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && onRename(teamId, nameDraft.trim())}
          maxLength={24}
          className="w-full bg-transparent border-b border-white/15 pb-1 mb-4 font-semibold text-lg outline-none focus:border-neon-cyan"
        />
      ) : (
        <h3 className="font-semibold text-lg mb-4">{team.name}</h3>
      )}

      <ul className="space-y-2 mb-4 min-h-[3rem]">
        {players.length === 0 && (
          <li className="text-white/40 text-sm italic">No players yet</li>
        )}
        {players.map((p) => (
          <li
            key={p.playerId}
            className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
          >
            <span className="flex items-center gap-2 text-sm">
              {p.isHost && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
              {p.connectionStatus === "disconnected" && (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )}
              {p.displayName}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                p.isReady || p.isHost
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-white/10 text-white/50"
              }`}
            >
              {p.isHost ? "Host" : p.isReady ? "Ready" : "Not ready"}
            </span>
            {isHost && p.playerId !== myPlayerId && (
              <button
                onClick={() => onHostAssign(p.playerId, teamId === "A" ? "B" : "A")}
                className="text-xs text-neon-cyan hover:underline ml-2"
              >
                Move
              </button>
            )}
          </li>
        ))}
      </ul>

      {!players.some((p) => p.playerId === myPlayerId) && (
        <Button variant="secondary" className="w-full text-sm py-2" onClick={() => onSelfJoin(teamId)}>
          Join {team.name}
        </Button>
      )}
    </GlassCard>
  );
}

export default function RoomLobbyPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { session, clearSession } = useSession();

  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [connError, setConnError] = useState("");
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!session || session.roomCode !== roomCode) {
      navigate("/join");
      return;
    }

    const socket = getSocket();
    socket.connect();

    function onConnect() {
      setConnError("");
      socket.emit(
        "room:join",
        { roomCode, playerId: session.playerId },
        (response) => {
          if (!response?.success) {
            setError(response?.message || "Could not join room");
          } else {
            setRoom(response.room);
          }
        }
      );
    }

    function onRoomState({ room }) {
      setRoom(room);
      if (room.gameStatus !== "lobby") {
        navigate(`/game/${roomCode}`);
      }
    }

    function onSocketError({ message }) {
      setConnError(message);
    }

    function onDisconnect() {
      setConnError("Reconnecting...");
    }

    function onGameStarted() {
      // Phase 3 will render the actual turn engine here.
    }

    socket.on("connect", onConnect);
    socket.on("room:state", onRoomState);
    socket.on("error", onSocketError);
    socket.on("disconnect", onDisconnect);
    socket.on("game:started", onGameStarted);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("room:state", onRoomState);
      socket.off("error", onSocketError);
      socket.off("disconnect", onDisconnect);
      socket.off("game:started", onGameStarted);
    };
  }, [session, roomCode, navigate]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [roomCode]);

  async function handleLeave() {
    try {
      await emitAck("room:leave");
    } catch {
      // leave anyway — don't block the user on a stale ack
    } finally {
      getSocket().disconnect();
      clearSession();
      navigate("/");
    }
  }

  async function handleSelfJoin(teamId) {
    try {
      await emitAck("team:request-join", { teamId });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleHostAssign(targetPlayerId, teamId) {
    try {
      await emitAck("team:assign", { targetPlayerId, teamId });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRename(teamId, name) {
    try {
      await emitAck("team:rename", { teamId, name });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleGenerateNames() {
    try {
      await emitAck("team:generate-names");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleReady() {
    const me = room.players.find((p) => p.playerId === session.playerId);
    try {
      await emitAck("room:ready", { isReady: !me.isReady });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStart() {
    setError("");
    setStarting(true);
    try {
      await emitAck("game:start");
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">{error || "Connecting to room..."}</p>
      </div>
    );
  }

  const isHost = room.hostPlayerId === session.playerId;
  const me = room.players.find((p) => p.playerId === session.playerId);
  const unassigned = room.players.filter((p) => !p.teamId);
  const teamA = room.players.filter((p) => p.teamId === "A");
  const teamB = room.players.filter((p) => p.teamId === "B");
  const canStart = teamA.length > 0 && teamB.length > 0;


  return (
    <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-display font-bold">Team Lobby</h1>
        <button
          onClick={copyCode}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/15 hover:bg-white/10 font-mono tracking-widest"
        >
          {roomCode}
          {copied ? <Check className="w-4 h-4 text-neon-cyan" /> : <Copy className="w-4 h-4 text-white/50" />}
        </button>
      </div>
      {connError && <p className="text-xs text-amber-400 mb-4">{connError}</p>}

      {unassigned.length > 0 && (
        <GlassCard className="mb-6">
          <h2 className="text-sm text-white/60 mb-3">
            Unassigned ({unassigned.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <span
                key={p.playerId}
                className="text-sm bg-white/5 border border-white/10 rounded-full px-3 py-1"
              >
                {p.displayName}
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <TeamPanel
          teamId="A"
          team={room.teams.A}
          players={teamA}
          isHost={isHost}
          myPlayerId={session.playerId}
          onRename={handleRename}
          onSelfJoin={handleSelfJoin}
          onHostAssign={handleHostAssign}
        />
        <TeamPanel
          teamId="B"
          team={room.teams.B}
          players={teamB}
          isHost={isHost}
          myPlayerId={session.playerId}
          onRename={handleRename}
          onSelfJoin={handleSelfJoin}
          onHostAssign={handleHostAssign}
        />
      </div>

      {isHost && (
        <Button variant="secondary" className="mb-6 text-sm" onClick={handleGenerateNames}>
          <Shuffle className="inline w-4 h-4 mr-2 -mt-0.5" />
          Randomize Team Names
        </Button>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="flex flex-wrap gap-3 mt-4">
        <Button variant="secondary" onClick={handleLeave}>
          Leave Room
        </Button>
        {me && !me.isHost && (
          <Button variant={me.isReady ? "secondary" : "primary"} onClick={handleToggleReady}>
            {me.isReady ? "Unready" : "I'm Ready"}
          </Button>
        )}
        {isHost && (
          <Button
            disabled={!canStart || starting}
            onClick={handleStart}
            title={!canStart ? "Both teams need at least one player" : ""}
          >
            {starting ? "Starting..." : "Start Battle"}
          </Button>
        )}
      </div>
    </div>
  );
}
