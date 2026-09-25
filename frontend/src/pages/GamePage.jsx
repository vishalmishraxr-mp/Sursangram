import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Crown, Trophy, ThumbsUp, ThumbsDown, LogOut, Mic, Shuffle, Keyboard, Sparkles, Share2 } from "lucide-react";
import GlassCard from "../components/GlassCard.jsx";
import Button from "../components/Button.jsx";
import ErrorText from "../components/ErrorText.jsx";
import MicWaveform from "../components/MicWaveform.jsx";
import RoastToast from "../components/RoastToast.jsx";
import ChallengeBanner from "../components/ChallengeBanner.jsx";
import ConfettiBurst from "../components/ConfettiBurst.jsx";
import VictoryCelebration from "../components/VictoryCelebration.jsx";
import { getSocket, emitAck } from "../services/socket.js";

import { useSession } from "../context/SessionContext.jsx";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import * as audioSynth from "../services/audioSynth.js";
import { playSongAudio, stopSongAudio, primeSongAudio } from "../services/songAudio.js";
import { getSongStreamUrl } from "../services/api.js";

function useCountdown(endsAt) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) {
      setSecondsLeft(0);
      return;
    }
    const end = new Date(endsAt).getTime();
    function tick() {
      setSecondsLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    }
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [endsAt]);
  return secondsLeft;
}

function SongDeclarationPanel({ isMyTurn, activePlayerName, expectedSound, onSubmit }) {
  const speech = useSpeechRecognition({ lang: "hi-IN" });
  const [manualText, setManualText] = useState("");
  const submittedSpeechRef = useRef("");
  const autoSubmittedTextRef = useRef("");

  useEffect(() => {
    if (speech.transcript) setManualText(speech.transcript);
  }, [speech.transcript]);

  useEffect(() => {
    const transcript = speech.transcript.trim();
    if (!speech.listening && transcript && transcript !== submittedSpeechRef.current) {
      submittedSpeechRef.current = transcript;
      autoSubmittedTextRef.current = transcript;
      onSubmit(transcript);
      speech.reset();
    }
  }, [speech.listening, speech.transcript, speech.reset, onSubmit]);

  // Manual typing auto-submits after a short pause, so the user does not
  // have to press the search button after entering the song title.
  useEffect(() => {
    if (!isMyTurn || speech.listening) return undefined;
    const query = manualText.trim();
    if (!query || query === autoSubmittedTextRef.current) return undefined;

    const timer = setTimeout(() => {
      autoSubmittedTextRef.current = query;
      onSubmit(query);
    }, 1500);

    return () => clearTimeout(timer);
  }, [manualText, isMyTurn, speech.listening, onSubmit]);

  useEffect(() => {
    if (!isMyTurn) {
      setManualText("");
      submittedSpeechRef.current = "";
      autoSubmittedTextRef.current = "";
    }
  }, [isMyTurn]);

  if (!isMyTurn) {
    return (
      <div className="text-center py-6">
        <p className="text-white/60">
          Waiting for <span className="font-semibold">{activePlayerName}</span> to announce a song...
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <p className="text-sm text-white/50 mb-1">Next song must start with</p>
      <p className="text-5xl font-display font-extrabold text-neon-cyan mb-4">
        {expectedSound || "ANY"}
      </p>
      <p className="text-white/70 mb-4">Announce your song</p>

      <button
        onClick={() => {
          audioSynth.unlock();
          primeSongAudio();
          speech.listening ? speech.stop() : speech.start();
        }}
        disabled={!speech.supported}
        className={`mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center transition ${
          speech.listening
            ? "bg-neon-pink shadow-glow animate-pulse"
            : "bg-white/10 hover:bg-white/15"
        } disabled:opacity-30`}
        title={speech.supported ? "Tap to speak" : "Speech recognition not supported in this browser"}
      >
        <Mic className="w-7 h-7" />
      </button>

      {!speech.supported && (
        <p className="text-xs text-white/40 mb-2 flex items-center justify-center gap-1">
          <Keyboard className="w-3.5 h-3.5" /> Speech recognition isn't available here — type it instead.
        </p>
      )}
      {speech.error && <p className="text-xs text-amber-400 mb-2">{speech.error}</p>}

      <input
        value={manualText}
        onChange={(e) => {
          audioSynth.unlock();
          primeSongAudio();
          autoSubmittedTextRef.current = "";
          setManualText(e.target.value);
        }}
        placeholder="e.g. Tum Hi Ho"
        className="w-full max-w-sm mx-auto block rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 text-center outline-none focus:border-neon-cyan mb-4"
      />

      <p className="text-xs text-white/35 mb-3">Type the song title and search starts automatically.</p>

      <div className="flex justify-center gap-3">
        <Button
          disabled={!manualText.trim()}
          onClick={() => {
            audioSynth.unlock();
            primeSongAudio();
            autoSubmittedTextRef.current = manualText.trim();
            onSubmit(manualText.trim());
          }}
        >
          Sing This
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            audioSynth.unlock();
            primeSongAudio();
            onSubmit("");
          }}
        >
          <Shuffle className="inline w-4 h-4 mr-2 -mt-0.5" />
          Surprise Me
        </Button>
      </div>
    </div>
  );
}

export default function GamePage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { session, clearSession } = useSession();

  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(null);
  const bannerTimeout = useRef(null);
  const [roasts, setRoasts] = useState([]);
  const roastTurnRef = useRef(null);

  const consumeRoast = useCallback((id) => {
    setRoasts((prev) => prev.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    if (!session || session.roomCode !== roomCode) {
      navigate("/join");
      return;
    }

    const socket = getSocket();
    if (!socket.connected) socket.connect();

    function onConnect() {
      socket.emit("room:join", { roomCode, playerId: session.playerId }, (res) => {
        if (!res?.success) setError(res?.message || "Could not join room");
        else setRoom(res.room);
      });
    }

    function onRoomState({ room }) {
      setRoom(room);
    }

    function showBanner(text) {
      setBanner(text);
      clearTimeout(bannerTimeout.current);
      bannerTimeout.current = setTimeout(() => setBanner(null), 2200);
    }

    function onSongDetected({ turn }) {
      showBanner(`🎶 Matched: ${turn.song.title}!`);
    }
    function onJamActivated({ turn }) {
      showBanner(`🎲 Jam Mode Activated! (${turn.song.category})`);
    }
    function onTurnFinalized({ turn, letterBonusAwarded }) {
      const label =
        turn.result.outcome === "success"
          ? `+${turn.result.points} points!${letterBonusAwarded ? " (+letter bonus)" : ""}`
          : turn.result.outcome === "timeout"
          ? `Timed out — ${turn.result.points} points`
          : turn.result.outcome === "invalid"
          ? `No match & Random Jam is off — ${turn.result.points} points`
          : `Not valid — ${turn.result.points} points`;
      showBanner(label);
    }

    function onRoast({ id, text, eventType }) {
      setRoasts((prev) => [...prev, { id, text, eventType }]);
    }

    // Phase 6: event-driven game sound cues. These are deliberately client-side
    // effects; gameplay remains fully server-authoritative if audio is blocked.
    function onGameEvent(event) {
      const cueMap = {
        SONG_SUCCESS: "success",
        SONG_FAILED: "failed",
        VALIDATION_FAILURE: "failed",
        TIMEOUT: "timeout",
        COMEBACK: "comeback",
        REPEATED_FAILURE: "failed",
      };
      const cue = cueMap[event?.type];
      if (cue) audioSynth.playCue(cue);
    }

    function onSocketError({ message }) {
      setError(message);
    }

    socket.on("connect", onConnect);
    socket.on("room:state", onRoomState);
    socket.on("turn:song-detected", onSongDetected);
    socket.on("turn:jam-activated", onJamActivated);
    socket.on("turn:finalized", onTurnFinalized);
    socket.on("roast:new", onRoast);
    socket.on("game:event", onGameEvent);
    socket.on("error", onSocketError);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("room:state", onRoomState);
      socket.off("turn:song-detected", onSongDetected);
      socket.off("turn:jam-activated", onJamActivated);
      socket.off("turn:finalized", onTurnFinalized);
      socket.off("roast:new", onRoast);
      socket.off("game:event", onGameEvent);
      socket.off("error", onSocketError);
      clearTimeout(bannerTimeout.current);
    };
  }, [session, roomCode, navigate]);

  const turn = room?.gameState?.currentTurn;
  useEffect(() => {
    const turnId = turn?.turnId;
    if (!turnId) return;
    if (roastTurnRef.current === null) {
      roastTurnRef.current = turnId;
      return;
    }
    if (roastTurnRef.current !== turnId) {
      roastTurnRef.current = turnId;
      setRoasts([]);
    }
  }, [turn?.turnId]);
  const secondsLeft = useCountdown((turn?.status === "declaring" || turn?.status === "active") ? turn.endsAt : null);

  // Active song turns play the submitted song preview. When a synced lyric timestamp
  // falls inside the 30s Apple preview, playback starts from that matched lyric.
  // Random Jam keeps the dedicated instrumental Antakshari BGM.
  useEffect(() => {
    if (turn?.status !== "active") {
      stopSongAudio();
      audioSynth.stop();
      return undefined;
    }

    stopSongAudio();
    if (turn.song?.mode === "random-jam") {
      audioSynth.play(turn.song?.profile || "antakshari-bgm");
    } else {
      const previewUrl = getSongStreamUrl(turn.song);
      if (previewUrl) {
        const lyricStartSeconds = Number(turn.song?.lyricMatch?.startSeconds);
        playSongAudio(previewUrl, {
          startAtSeconds: turn?.song?.playbackSeekable !== false && Number.isFinite(lyricStartSeconds) && lyricStartSeconds > 0 && lyricStartSeconds < 29.5 ? lyricStartSeconds : 0,
          onEnded: () => {
            // Only the active player's browser reports the media completion.
            // The server deduplicates this event, so the Roast Host produces
            // one post-song line for the whole room.
            if (session.playerId === turn?.playerId) {
              emitAck("turn:audio-finished").catch(() => {});
            }
          },
        });
      } else {
        audioSynth.play("antakshari-bgm");
      }
    }

    return () => {
      stopSongAudio();
      audioSynth.stop();
    };
  }, [session.playerId, turn?.status, turn?.turnId, turn?.playerId, turn?.song?.mode, turn?.song?.profile, turn?.song?.title, turn?.song?.lastSound, turn?.song?.endLetter, turn?.song?.audioUrl, turn?.song?.lyricMatch?.startSeconds, turn?.song?.playbackSeekable]);

  const handleAnnounce = useCallback(async (songText) => {
    try {
      await emitAck("turn:announce-song", { songText });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleChallengeDone = useCallback(async () => {
    try {
      await emitAck("turn:challenge-complete");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleDone = useCallback(async () => {
    try {
      await emitAck("turn:confirm-success");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleValidate = useCallback(async (approve) => {
    try {
      await emitAck("turn:validate", { approve });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleEndEarly = useCallback(async () => {
    try {
      await emitAck("game:end");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  async function handleExit() {
    stopSongAudio();
    audioSynth.stop();
    getSocket().disconnect();
    clearSession();
    navigate("/");
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">{error || "Loading game..."}</p>
      </div>
    );
  }

  const isHost = room.hostPlayerId === session.playerId;
  const me = room.players.find((p) => p.playerId === session.playerId);

  async function handleShareResult() {
    const results = room.results;
    if (!results) return;
    const summary = results.summary || {};
    const winner = results.isDraw ? "It's a draw" : `${room.teams[results.winnerTeamId]?.name || "A team"} wins`;
    const text = [
      `Sursangram — ${winner}`,
      `${room.teams.A.name}: ${results.teamAScore} | ${room.teams.B.name}: ${results.teamBScore}`,
      `Songs landed: ${summary.successfulSongs ?? 0} | Random Jams: ${summary.randomJams ?? 0}`,
      summary.bestPerformer ? `Standout: ${summary.bestPerformer.displayName} (${summary.bestPerformer.individualScore} pts)` : null,
    ].filter(Boolean).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Sursangram Result", text });
      } else {
        await navigator.clipboard.writeText(text);
        setBanner("Result copied to clipboard!");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError("Could not share the result");
    }
  }

  if (room.gameStatus === "finished") {
    const { results } = room;
    const winnerName = results.isDraw ? null : room.teams[results.winnerTeamId]?.name;
    const summary = results.summary || {};
    const bestPerformer = summary.bestPerformer;
    const comeback = summary.biggestComeback;
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        {!results.isDraw && <><ConfettiBurst /><VictoryCelebration winner={winnerName} /></>}
        <GlassCard className="max-w-lg w-full text-center">
          <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <p className="text-xs uppercase tracking-[0.3em] text-neon-cyan/70 mb-2">Sursangram Finale</p>
          <h1 className="text-2xl font-display font-black mb-1">
            {results.isDraw ? "It's a Draw!" : `${winnerName} Wins!`}
          </h1>
          {results.endedEarly && (
            <p className="text-xs text-white/40 mb-4">Game ended early by host</p>
          )}
          <div className="grid grid-cols-2 gap-4 my-6">
            <div className="bg-white/5 rounded-xl py-4">
              <p className="text-white/50 text-sm">{room.teams.A.name}</p>
              <p className="text-3xl font-bold">{results.teamAScore}</p>
            </div>
            <div className="bg-white/5 rounded-xl py-4">
              <p className="text-white/50 text-sm">{room.teams.B.name}</p>
              <p className="text-3xl font-bold">{results.teamBScore}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-6 text-center">
            <div className="bg-white/5 rounded-lg py-2.5">
              <p className="text-xl font-bold text-emerald-300">{summary.successfulSongs ?? 0}</p>
              <p className="text-[11px] text-white/40">Songs landed</p>
            </div>
            <div className="bg-white/5 rounded-lg py-2.5">
              <p className="text-xl font-bold text-red-300">
                {(summary.failedTurns ?? 0) + (summary.timeouts ?? 0)}
              </p>
              <p className="text-[11px] text-white/40">Failed turns</p>
            </div>
            <div className="bg-white/5 rounded-lg py-2.5">
              <p className="text-xl font-bold text-neon-cyan">{summary.randomJams ?? 0}</p>
              <p className="text-[11px] text-white/40">Random Jams</p>
            </div>
          </div>

          {(bestPerformer || comeback) && (
            <div className="space-y-2 mb-6 text-left">
              {bestPerformer && (
                <div className="flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/20 rounded-lg px-3 py-2">
                  <Sparkles className="w-4 h-4 text-yellow-300 shrink-0" />
                  <p className="text-sm text-white/80">
                    <span className="font-semibold">{bestPerformer.displayName}</span> was the
                    standout performer with {bestPerformer.individualScore} pts.
                  </p>
                </div>
              )}
              {comeback && (
                <div className="flex items-center gap-2 bg-neon-violet/10 border border-neon-violet/20 rounded-lg px-3 py-2">
                  <Sparkles className="w-4 h-4 text-neon-violet shrink-0" />
                  <p className="text-sm text-white/80">
                    Biggest comeback: <span className="font-semibold">{room.teams[comeback.teamId]?.name}</span>{" "}
                    swung the match by {comeback.margin} pts.
                  </p>
                </div>
              )}
            </div>
          )}

          <h2 className="text-sm text-white/60 mb-2">Player rankings</h2>
          <ul className="text-left space-y-1 mb-6">
            {[...room.players]
              .sort((a, b) => b.individualScore - a.individualScore)
              .map((p, i) => (
                <li key={p.playerId} className="flex justify-between text-sm">
                  <span>
                    {i + 1}. {p.displayName}
                  </span>
                  <span className="text-white/60">{p.individualScore} pts</span>
                </li>
              ))}
          </ul>
          <div className="space-y-2">
            <Button className="w-full" onClick={handleShareResult}>
              <Share2 className="inline w-4 h-4 mr-2 -mt-0.5" /> Share Result
            </Button>
            <Button variant="secondary" className="w-full" onClick={handleExit}>
              Back to Home
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  const activePlayer = room.players.find((p) => p.playerId === turn?.playerId);
  const isMyTurn = turn?.playerId === session.playerId;
  const canValidate =
    turn?.status === "awaiting-validation" &&
    (room.hostPlayerId === session.playerId || (me?.teamId && me.teamId !== turn.teamId));
  const expectedSound =
    room.settings.gameMode === "classic" ? room.gameState.expectedStartSound : null;

  return (
    <div className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <RoastToast resetKey={turn?.turnId} roasts={roasts} onConsume={consumeRoast} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-display font-bold">Round {turn?.roundNumber || 1}</h1>
        {isHost && (
          <button
            onClick={handleEndEarly}
            className="text-xs text-white/40 hover:text-red-400 flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> End game
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <GlassCard className={turn?.teamId === "A" ? "ring-2 ring-neon-pink" : ""}>
          <p className="text-white/50 text-xs">{room.teams.A.name}</p>
          <p className="text-2xl font-bold">{room.teams.A.score}</p>
        </GlassCard>
        <GlassCard className={turn?.teamId === "B" ? "ring-2 ring-neon-cyan" : ""}>
          <p className="text-white/50 text-xs">{room.teams.B.name}</p>
          <p className="text-2xl font-bold">{room.teams.B.score}</p>
        </GlassCard>
      </div>

      {(turn?.status === "declaring" || turn?.status === "active") && (
        <ChallengeBanner
        challenge={room.gameState?.currentChallenge}
        mode={room.settings.gameMode}
        completed={Boolean(turn?.challengeCompleted)}
      />
      )}

      <GlassCard className="text-center py-8 mb-6">
        {banner && (
          <p className="text-neon-cyan font-semibold mb-3 animate-pulse">{banner}</p>
        )}
        <p className="text-white/50 text-sm mb-1">Current turn</p>
        <p className="text-2xl font-display font-bold mb-1 flex items-center justify-center gap-2">
          {activePlayer?.isHost && <Crown className="w-5 h-5 text-yellow-400" />}
          {activePlayer?.displayName || "..."}
        </p>
        <p className="text-white/40 text-sm mb-4">
          Team {turn?.teamId} · {room.teams[turn?.teamId]?.name}
        </p>

        {turn?.status === "declaring" && (
          <SongDeclarationPanel
            isMyTurn={isMyTurn}
            activePlayerName={activePlayer?.displayName}
            expectedSound={expectedSound}
            onSubmit={handleAnnounce}
          />
        )}

        {turn?.status === "active" && (
          <>
            <p className="text-sm text-white/60 mb-2">
              {turn.song?.mode === "karaoke" ? (
                <>🎵 Apple song preview playing · {turn.song.title}</>
              ) : (
                <>🎲 Jam BGM — {turn.song?.category}</>
              )}
            </p>
            {room.settings.gameMode === "classic" && turn.song?.mode === "karaoke" && (turn.song?.endLetter || turn.song?.lastSound) && (
              <div className="mx-auto mb-4 max-w-xs rounded-xl border border-neon-pink/30 bg-neon-pink/10 px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/50">Next turn starts with</p>
                <p className="text-4xl font-display font-extrabold text-neon-pink">
                  {turn.song.endLetter || turn.song.lastSound}
                </p>
              </div>
            )}
            <MicWaveform active={isMyTurn} />
            <p className="text-6xl font-display font-extrabold my-4 tabular-nums">
              {secondsLeft}
            </p>
            {isMyTurn ? (
              <div className="flex flex-col items-center gap-2">
                {room.gameState?.currentChallenge && !turn.challengeCompleted && (
                  <Button variant="secondary" onClick={handleChallengeDone}>
                    Challenge Done
                  </Button>
                )}
                {turn.challengeCompleted && (
                  <p className="text-xs text-emerald-300">Challenge marked complete</p>
                )}
                <Button onClick={handleDone}>I'm Done Singing</Button>
              </div>
            ) : (
              <p className="text-white/50 text-sm">Waiting for {activePlayer?.displayName}...</p>
            )}
          </>
        )}

        {turn?.status === "awaiting-validation" && (
          <>
            {room.settings.gameMode === "classic" && turn.song?.mode === "karaoke" && (turn.song?.endLetter || turn.song?.lastSound) && (
              <div className="mx-auto mb-4 max-w-xs rounded-xl border border-neon-pink/30 bg-neon-pink/10 px-5 py-3">
                <p className="text-[11px] uppercase tracking-wider text-white/50">Next turn starts with</p>
                <p className="text-4xl font-display font-extrabold text-neon-pink">
                  {turn.song.endLetter || turn.song.lastSound}
                </p>
              </div>
            )}
            <p className="text-white/70 mb-4">Was that a valid turn?</p>
            {canValidate ? (
              <div className="flex justify-center gap-4">
                <Button variant="secondary" onClick={() => handleValidate(true)}>
                  <ThumbsUp className="inline w-4 h-4 mr-2 -mt-0.5" /> Valid
                </Button>
                <Button variant="secondary" onClick={() => handleValidate(false)}>
                  <ThumbsDown className="inline w-4 h-4 mr-2 -mt-0.5" /> Invalid
                </Button>
              </div>
            ) : (
              <p className="text-white/50 text-sm">
                Waiting for the opposing team to confirm...
              </p>
            )}
          </>
        )}
      </GlassCard>

      <ErrorText>{error}</ErrorText>
    </div>
  );
}
