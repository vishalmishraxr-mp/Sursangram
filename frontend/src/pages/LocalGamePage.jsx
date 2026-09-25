import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bot, Mic, Send, Trophy, Share2, Sparkles, ThumbsUp, ThumbsDown, Shuffle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import GlassCard from "../components/GlassCard.jsx";
import Button from "../components/Button.jsx";
import ErrorText from "../components/ErrorText.jsx";
import ConfettiBurst from "../components/ConfettiBurst.jsx";
import VictoryCelebration from "../components/VictoryCelebration.jsx";
import ChallengeBanner from "../components/ChallengeBanner.jsx";
import RoastToast from "../components/RoastToast.jsx";
import { searchSong, generateRoast, getSongStreamUrl, pickAiSong } from "../services/api.js";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition.js";
import * as audioSynth from "../services/audioSynth.js";
import { playSongAudio, stopSongAudio, primeSongAudio } from "../services/songAudio.js";

const CHALLENGES = {
  chaos: [
    { id: "no-repeat-title", title: "No Repeats", description: "Sing your song without saying its title out loud." },
    { id: "dramatic-voice", title: "Dramatic Voice", description: "Perform this turn in the most dramatic voice you can manage." },
    { id: "chorus-only", title: "Chorus Only", description: "Sing only the chorus — skip straight to the best part." },
    { id: "speed-up", title: "Speed Round", description: "Sing it faster than you normally would. No slowing down." },
    { id: "opponent-style", title: "Opponent's Choice", description: "Someone from the opposing team picks the style you perform in." },
    { id: "random-jam-forced", title: "Wildcard Jam", description: "Skip song-matching entirely — this turn is a forced Random Jam." },
  ],
  dare: [
    { id: "dare-lyrics-only", title: "Lyrics Only", description: "No humming or instrumental-only sections — keep the lyrics going." },
    { id: "dare-no-hands", title: "No Hands", description: "Perform the turn without using your hands for dramatic gestures." },
    { id: "dare-team-singalong", title: "Team Singalong", description: "Get at least one teammate to join for the final few seconds." },
    { id: "dare-opponent-pick", title: "Opponent Picks", description: "The opposing team chooses your performance style before you start." },
  ],
};

const ROAST_EVENTS = ["SONG_SUCCESS", "SONG_FAILED", "TIMEOUT", "INVALID_SONG", "RANDOM_JAM", "VALIDATION_FAILURE", "COMEBACK", "REPEATED_FAILURE", "SONG_FINISHED"];

function pickChallenge(mode, previousId) {
  const pool = CHALLENGES[mode] || [];
  const choices = pool.filter(c => c.id !== previousId);
  return (choices.length ? choices : pool)[Math.floor(Math.random() * Math.max(1, choices.length || pool.length))] || null;
}

function initialState(setup) {
  const firstChallenge = (setup.specialChallenges && (setup.gameMode === "chaos" || setup.gameMode === "dare")) ? pickChallenge(setup.gameMode, null) : null;
  return {
    phase: "declaring", round: 1, team: "A", memberIndex: 0, memberIndexes: { A: 0, B: 0 },
    scores: { A: 0, B: 0 }, individual: {}, expectedStartSound: null,
    currentSong: null, currentChallenge: firstChallenge, challengeCompleted: false,
    // 30s to announce/search the song, then the active singing window uses
    // setup.turnSeconds (default 30s).
    turnEndsAt: Date.now() + 30_000, validationEndsAt: null,
    history: [], failures: {}, usedSongIds: [], scoreHistory: [{ A: 0, B: 0 }],
    lastChallengeId: null, finished: false, results: null, setup,
  };
}

export default function LocalGamePage() {
  const navigate = useNavigate();
  const [game, setGame] = useState(() => { try { const s = JSON.parse(sessionStorage.getItem("antakshari_local_setup")); return s ? initialState(s) : null; } catch { return null; } });
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [roasts, setRoasts] = useState([]);
  const roastHistoryRef = React.useRef([]);
  const { supported, listening, transcript, start, stop: stopSpeech, reset } = useSpeechRecognition({ lang: "hi-IN" });
  const submittedSpeechRef = React.useRef("");
  const autoSubmittedTextRef = React.useRef("");
  const aiTurnRef = React.useRef(null);
  const roastTurnRef = React.useRef(null);

  useEffect(() => { if (transcript) setText(transcript); }, [transcript]);
  useEffect(() => {
    if (!game) return;
    const turnKey = `${game.round}-${game.team}-${game.memberIndex}`;
    if (roastTurnRef.current === null) {
      roastTurnRef.current = turnKey;
      return;
    }
    if (roastTurnRef.current !== turnKey) {
      roastTurnRef.current = turnKey;
      setRoasts([]);
    }
  }, [game?.round, game?.team, game?.memberIndex]);
  useEffect(() => {
    const spoken = transcript.trim();
    if (!listening && spoken && spoken !== submittedSpeechRef.current && game?.phase === "declaring" && !game?.setup?.vsAI) {
      submittedSpeechRef.current = spoken;
      autoSubmittedTextRef.current = spoken;
      submit(spoken);
      reset();
    }
  }, [listening, transcript, game?.phase]);

  // Manual typing now auto-submits after a short pause, so the user does not
  // have to click the search/send button after entering a song title.
  useEffect(() => {
    if (!game || game.finished || game.phase !== "declaring" || Boolean(game.setup?.vsAI && game.team === "B") || listening || busy) return undefined;
    const query = text.trim();
    if (!query || query === autoSubmittedTextRef.current) return undefined;

    const timer = setTimeout(() => {
      autoSubmittedTextRef.current = query;
      submit(query);
    }, 1500);

    return () => clearTimeout(timer);
  }, [text, game?.phase, game?.round, game?.team, game?.memberIndex, game?.finished, listening, busy]);
  useEffect(() => () => { stopSongAudio(); audioSynth.stop(); }, []);

  const currentTeam = game?.setup[`team${game.team}`];
  const currentMember = currentTeam?.members[game.memberIndex % currentTeam.members.length];
  const opponentTeam = game?.team === "A" ? "B" : "A";
  const secondsLeft = game ? Math.max(0, Math.ceil(((game.phase === "active" ? game.turnEndsAt : game.phase === "validation" ? game.validationEndsAt : game.turnEndsAt) - now) / 1000)) : 0;
  const isChallengeMode = game?.setup.gameMode === "chaos" || game?.setup.gameMode === "dare";
  const isAiTurn = Boolean(game?.setup.vsAI && game?.team === "B");

  useEffect(() => {
    if (!game || game.finished) return;
    const id = setInterval(() => {
      setNow(Date.now());
      setGame(g => {
        if (!g || g.finished) return g;
        const deadline = g.phase === "active" ? g.turnEndsAt : g.phase === "validation" ? g.validationEndsAt : g.turnEndsAt;
        if (Date.now() < deadline) return g;
        if (g.phase === "declaring") return finalize(g, "timeout", 0, "No song announced");
        if (g.phase === "active") {
          if (g.setup.vsAI && g.team === "B") {
            return finalize(g, "success", 50, "AI completed its turn");
          }
          return { ...g, phase: "validation", validationEndsAt: Date.now() + 8000 };
        }
        return finalize(g, "success", 50, "Auto-approved — no vote received in time");
      });
    }, 250);
    return () => clearInterval(id);
  }, [game?.phase, game?.round, game?.team, game?.finished]);

  useEffect(() => {
    if (!game || game.finished || !isAiTurn || game.phase !== "declaring") return undefined;

    const turnKey = `${game.round}-${game.team}-${game.memberIndex}`;
    if (aiTurnRef.current === turnKey) return undefined;
    aiTurnRef.current = turnKey;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      setMessage(`Sursangram is thinking${game.expectedStartSound ? ` of a song starting with “${game.expectedStartSound}”` : ""}…`);
      try {
        const result = await pickAiSong(game.expectedStartSound, game.usedSongIds || []);
        if (cancelled) return;

        if (!result?.song) {
          if (game.setup.randomJamMode) {
            const jam = { mode: "random-jam", title: null, category: "AI Mystery Jam", profile: "lo-fi", startSound: null, lastSound: null };
            audioSynth.playCue("success");
            setGame((g) => ({
              ...g,
              phase: "active",
              currentSong: jam,
              challengeCompleted: Boolean(g.currentChallenge),
              turnEndsAt: Date.now() + g.setup.turnSeconds * 1000,
            }));
            setMessage("AI couldn't find a fresh match — Mystery Jam activated.");
          } else {
            setGame((g) => finalize(g, "timeout", -20, "AI could not find a valid song"));
          }
          return;
        }

        const song = { ...result.song, mode: "karaoke", profile: "itunes-preview" };
        const key = String(song.externalId || song.songId || song.id || song.normalizedTitle || song.title).trim().toLowerCase();
        audioSynth.playCue("success");
        setGame((g) => ({
          ...g,
          phase: "active",
          currentSong: song,
          challengeCompleted: Boolean(g.currentChallenge),
          turnEndsAt: Date.now() + g.setup.turnSeconds * 1000,
          usedSongIds: g.usedSongIds.includes(key) ? g.usedSongIds : [...g.usedSongIds, key],
        }));
        setMessage(`AI picked ${song.title}${song.artist ? ` • ${song.artist}` : ""}`);
      } catch (err) {
        if (!cancelled) setMessage(err?.message || "AI turn failed — try again.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [game?.finished, game?.phase, game?.round, game?.team, game?.memberIndex, game?.expectedStartSound, isAiTurn]);

  useEffect(() => {
    if (!game || game.finished || game.phase !== "active") {
      stopSongAudio();
      audioSynth.stop();
      return;
    }

    // Normal song turns play the submitted song preview. When a synced lyric timestamp
    // falls inside the 30s Apple preview, playback starts from that matched lyric.
    // Random Jam keeps the dedicated Antakshari instrumental BGM.
    stopSongAudio();
    if (game.currentSong?.mode === "random-jam") {
      audioSynth.play(game.currentSong?.profile || "antakshari-bgm");
    } else {
      const previewUrl = getSongStreamUrl(game.currentSong);
      if (previewUrl) {
        const lyricStartSeconds = Number(game.currentSong?.runtime?.lyricMatch?.startSeconds);
        playSongAudio(previewUrl, {
          startAtSeconds: game?.currentSong?.playbackSeekable !== false && Number.isFinite(lyricStartSeconds) && lyricStartSeconds > 0 && lyricStartSeconds < 29.5 ? lyricStartSeconds : 0,
          onEnded: () => {
            if (game?.phase === "active" && game?.currentSong?.mode === "karaoke") {
              // The Apple preview has ended. Do not leave the turn countdown
              // running behind the roast/validation UI. End the active play
              // window immediately, show the roast, and move to validation.
              addRoast("SONG_FINISHED", {
                member: currentMember,
                title: game.currentSong.title,
                source: "preview-ended",
              }, 2);
              if (isAiTurn) {
                setGame((g) => g?.phase === "active" ? finalize(g, "success", 50, "AI preview finished") : g);
              } else {
                doneSinging();
              }
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
  }, [game?.phase, game?.round, game?.team, game?.currentSong?.mode, game?.currentSong?.profile, game?.currentSong?.title, game?.currentSong?.lastSound, game?.currentSong?.runtime?.lyricMatch?.startSeconds, game?.currentSong?.playbackSeekable]);

  async function addRoast(eventType, context = {}, count = 1) {
    if (!game?.setup.roastHost || !ROAST_EVENTS.includes(eventType)) return;
    const intensity = game.setup.roastIntensity || "mild";
    const pending = [];
    const recent = new Set(roastHistoryRef.current.slice(-12));

    for (let i = 0; i < count; i += 1) {
      let picked = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const result = await generateRoast({ eventType, intensity, context });
          const candidate = result?.text?.trim();
          if (candidate && !recent.has(candidate)) {
            picked = candidate;
            break;
          }
        } catch {}
      }
      if (!picked) break;
      recent.add(picked);
      pending.push({ id: `${Date.now()}-${Math.random()}`, text: picked, eventType });
    }

    if (!pending.length) return;
    roastHistoryRef.current = [...roastHistoryRef.current, ...pending.map((r) => r.text)].slice(-24);
    setRoasts((prev) => [...prev, ...pending]);
  }

  function validateChain(song) {
    if (!game.expectedStartSound) return true;
    return song.startSound === game.expectedStartSound;
  }

  async function submit(queryOverride = null) {
    const query = (queryOverride ?? text).trim();
    if (busy || !game || game.phase !== "declaring") return;
    if (!query && game.currentChallenge?.id !== "random-jam-forced" && !game.setup.randomJamMode) return;
    setBusy(true); setMessage("Searching local catalog → MongoDB cache → Apple song metadata…");
    try {
      if (!query || game.currentChallenge?.id === "random-jam-forced") {
        if (!game.setup.randomJamMode && game.currentChallenge?.id !== "random-jam-forced") {
          setMessage("Random Jam is disabled. Announce a song instead.");
          return;
        }
        const jam = { mode: "random-jam", title: null, category: "Mystery Jam", profile: "lo-fi", startSound: null, lastSound: null };
        audioSynth.playCue("success"); addRoast("RANDOM_JAM");
        setGame(g => ({ ...g, phase: "active", currentSong: jam, turnEndsAt: Date.now() + g.setup.turnSeconds * 1000 }));
        setMessage(game.currentChallenge?.id === "random-jam-forced" ? "Wildcard Jam activated." : "Random Jam activated.");
        autoSubmittedTextRef.current = "";
        setText(""); reset(); return;
      }
      let result = await searchSong(query, game.setup.gameMode === "classic" ? game.expectedStartSound : null);
      if (result.letterMismatch) {
        audioSynth.playCue("failed"); addRoast("INVALID_SONG", { query, expected: game.expectedStartSound });
        setMessage(`Invalid chain. This song starts with “${result.song?.startLetter || result.song?.startSound || "?"}”, but “${game.expectedStartSound}” is required.`);
        return;
      }
      if (!result.song) {
        audioSynth.playCue("failed"); addRoast("INVALID_SONG", { query });
        setMessage("Song not found. Try another title.");
        return;
      }
      const song = result.song;
      if (!validateChain(song)) {
        audioSynth.playCue("failed"); addRoast("INVALID_SONG", { query, expected: game.expectedStartSound });
        setMessage(`Invalid chain. This song starts with “${song.startSound || "?"}”, but “${game.expectedStartSound}” is required.`);
        return;
      }
      const songKey = String(song.externalId || song.songId || song.id || song.normalizedTitle || song.title).trim().toLowerCase();
      if (game.usedSongIds.includes(songKey)) {
        audioSynth.playCue("failed");
        addRoast("INVALID_SONG", { query, reason: "duplicate" });
        setMessage(`“${song.title}” has already been used in this game. Pick another song.`);
        return;
      }
      if (game.currentChallenge?.id === "random-jam-forced") {
        setMessage("Wildcard Jam is active — song matching is intentionally skipped.");
        return;
      }
      // Keep the matched song's direct iTunes preview URL so the active turn
      // can play the same song the user announced. The audio is capped by the
      // The Apple preview is used only for this 30-second turn; it is never looped.
      const playable = {
        ...song,
        mode: "karaoke",
        profile: "itunes-preview",
      };
      audioSynth.playCue("success");
      setGame(g => ({
        ...g,
        phase: "active",
        currentSong: playable,
        turnEndsAt: Date.now() + g.setup.turnSeconds * 1000,
        usedSongIds: g.usedSongIds.includes(songKey) ? g.usedSongIds : [...g.usedSongIds, songKey],
      }));
      setMessage(`${song.title} • ${song.artist || "Unknown artist"} • source: ${result.source}`);
      autoSubmittedTextRef.current = "";
      setText(""); reset();
    } catch (e) { setMessage(e.message || "Song search failed"); } finally { setBusy(false); }
  }

  function markChallengeDone() {
    setGame(g => ({ ...g, challengeCompleted: true }));
    setMessage("Challenge marked complete. Finish singing when ready.");
  }

  function doneSinging() {
    if (game.phase !== "active") return;
    stopSongAudio();
    audioSynth.stop();
    setGame(g => ({ ...g, phase: "validation", validationEndsAt: Date.now() + 8000 }));
  }

  function finalize(g, outcome, basePoints, note = "") {
    stopSongAudio();
    audioSynth.stop();
    let points = outcome === "success" && isChallengeMode && g.challengeCompleted ? 50 : basePoints;
    const letterBonus = outcome === "success" && g.setup.gameMode === "classic" && g.currentSong?.mode === "karaoke" && g.expectedStartSound && g.currentSong.startSound === g.expectedStartSound;
    if (letterBonus) points += 20;
    const team = g.team;
    const member = g.setup[`team${team}`].members[g.memberIndex % g.setup[`team${team}`].members.length];
    const individual = { ...g.individual, [member]: (g.individual[member] || 0) + points };
    const scores = { ...g.scores, [team]: g.scores[team] + points };
    const failures = { ...g.failures };
    failures[member] = outcome === "success" ? 0 : (failures[member] || 0) + 1;
    const history = [...g.history, { team, member, outcome, points, title: g.currentSong?.title || "Random Jam", challenge: g.currentChallenge?.title || null }];
    const nextRound = team === "B" ? g.round + 1 : g.round;
    const finished = nextRound > g.setup.rounds;
    const nextTeam = team === "A" ? "B" : "A";
    const memberIndexes = { ...(g.memberIndexes || { A: 0, B: 0 }) };
    const currentMembers = g.setup[`team${team}`]?.members || [];
    if (currentMembers.length) {
      memberIndexes[team] = (g.memberIndex + 1) % currentMembers.length;
    }
    const nextIndex = memberIndexes[nextTeam] || 0;
    const leaderBefore = g.scores.A === g.scores.B ? null : g.scores.A > g.scores.B ? "A" : "B";
    const leaderAfter = scores.A === scores.B ? null : scores.A > scores.B ? "A" : "B";
    if (outcome === "success") audioSynth.playCue("success");
    else if (outcome === "timeout") audioSynth.playCue("timeout");
    else audioSynth.playCue("failed");
    addRoast(outcome === "success" ? "SONG_SUCCESS" : outcome === "timeout" ? "TIMEOUT" : "VALIDATION_FAILURE", { member, points });
    if (failures[member] >= 2) { audioSynth.playCue("failed"); addRoast("REPEATED_FAILURE", { member, streak: failures[member] }); }
    if (leaderBefore && leaderAfter && leaderBefore !== leaderAfter) { audioSynth.playCue("comeback"); addRoast("COMEBACK", { newLeader: leaderAfter }); }
    const scoreHistory = [...g.scoreHistory, scores];
    if (finished) {
      const successfulSongs = history.filter(h => h.outcome === "success").length;
      const timeouts = history.filter(h => h.outcome === "timeout").length;
      const failedTurns = history.filter(h => h.outcome === "failed").length;
      const randomJams = history.filter(h => h.title === "Random Jam").length;
      const best = Object.entries(individual).sort((a,b) => b[1]-a[1])[0];
      const comeback = scoreHistory.slice(1).map((s, i) => ({ ...s, delta: Math.abs((s.A-s.B) - (scoreHistory[i].A-scoreHistory[i].B)) })).sort((a,b) => b.delta-a.delta)[0];
      return { ...g, scores, individual, failures, history, finished: true, phase: "finished", results: { teamAScore: scores.A, teamBScore: scores.B, isDraw: scores.A === scores.B, winner: scores.A === scores.B ? null : scores.A > scores.B ? g.setup.teamA.name : g.setup.teamB.name, successfulSongs, failedTurns, timeouts, randomJams, bestPerformer: best ? { displayName: best[0], individualScore: best[1] } : null, biggestComeback: comeback && comeback.delta > 0 ? comeback.delta : null } };
    }
    const nextChallenge = isChallengeMode && g.setup.specialChallenges ? pickChallenge(g.setup.gameMode, g.lastChallengeId) : null;
    const forcedJam = nextChallenge?.id === "random-jam-forced";
    return { ...g, phase: "declaring", round: nextRound, team: nextTeam, memberIndex: nextIndex, memberIndexes, scores, individual, failures, history, scoreHistory, expectedStartSound: outcome === "success" ? (g.currentSong?.lastSound || null) : g.expectedStartSound, currentSong: null, currentChallenge: nextChallenge, challengeCompleted: false, lastChallengeId: nextChallenge?.id || null, turnEndsAt: Date.now() + 30_000, validationEndsAt: null, forcedJam };
  }

  function validate(approve) {
    if (game.phase !== "validation") return;
    setGame(g => finalize(g, approve ? "success" : "failed", approve ? 50 : -30, approve ? "Valid" : "Rejected"));
    if (!approve) { audioSynth.playCue("failed"); addRoast("VALIDATION_FAILURE"); }
  }

  function restart() { aiTurnRef.current = null; setGame(initialState(game.setup)); setMessage(""); setText(""); setRoasts([]); roastHistoryRef.current = []; audioSynth.stop(); }
  async function shareResult() {
    const r = game.results; if (!r) return;
    const text = [`Sursangram — ${r.isDraw ? "It's a draw" : `${r.winner} wins`}`, `${game.setup.teamA.name}: ${r.teamAScore} | ${game.setup.teamB.name}: ${r.teamBScore}`, `Songs landed: ${r.successfulSongs} | Random Jams: ${r.randomJams}`].join("\n");
    try { if (navigator.share) await navigator.share({ title: "Sursangram Result", text }); else { await navigator.clipboard.writeText(text); setMessage("Result copied to clipboard!"); } } catch (e) { if (e?.name !== "AbortError") setMessage("Could not share result"); }
  }

  if (!game) return <div className="min-h-screen flex items-center justify-center"><GlassCard><p>Local game setup not found.</p><Button className="mt-4" onClick={() => navigate("/local-setup")}>Set up teams</Button></GlassCard></div>;
  if (game.finished) return <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">{!game.results.isDraw && <><ConfettiBurst /><VictoryCelebration winner={game.results.winner} /></>}<GlassCard className="text-center py-10"><Trophy className="w-12 h-12 mx-auto text-yellow-300 mb-4"/><p className="text-xs uppercase tracking-[0.3em] text-neon-cyan/70 mb-2">Sursangram Finale</p><h1 className="text-4xl font-display font-black">{game.results.isDraw ? "It's a Draw!" : `${game.results.winner} Wins!`}</h1><p className="text-white/60 mt-2">{game.setup.teamA.name} {game.results.teamAScore} — {game.results.teamBScore} {game.setup.teamB.name}</p><div className="grid grid-cols-3 gap-2 my-7"><div className="bg-white/5 rounded-lg py-3"><b>{game.results.successfulSongs}</b><p className="text-xs text-white/40">Songs landed</p></div><div className="bg-white/5 rounded-lg py-3"><b>{game.results.failedTurns + game.results.timeouts}</b><p className="text-xs text-white/40">Failed turns</p></div><div className="bg-white/5 rounded-lg py-3"><b>{game.results.randomJams}</b><p className="text-xs text-white/40">Random Jams</p></div></div>{game.results.bestPerformer && <p className="text-sm mb-2"><Sparkles className="inline w-4 h-4 text-yellow-300"/> Standout: <b>{game.results.bestPerformer.displayName}</b> ({game.results.bestPerformer.individualScore} pts)</p>}{game.results.biggestComeback && <p className="text-sm text-white/70 mb-6">Biggest comeback swing: {game.results.biggestComeback} pts</p>}<div className="flex justify-center gap-3"><Button onClick={shareResult}><Share2 className="inline w-4 h-4 mr-2"/> Share Result</Button><Button variant="secondary" onClick={restart}>Play Again</Button><Button variant="secondary" onClick={() => navigate("/")}>Home</Button></div></GlassCard></div>;

  return <div className="min-h-screen px-6 py-8 max-w-5xl mx-auto"><RoastToast resetKey={`${game?.round}-${game?.team}-${game?.memberIndex}`} roasts={roasts} onConsume={id => setRoasts(p => p.filter(r => r.id !== id))}/><button onClick={() => { audioSynth.stop(); navigate("/"); }} className="text-white/60 hover:text-white flex items-center gap-2 mb-6"><ArrowLeft className="w-4 h-4"/> Exit</button>
    <div className="grid md:grid-cols-3 gap-4 mb-5"><GlassCard><p className="text-white/50 text-sm">{game.setup.teamA.name}</p><p className="text-3xl font-bold">{game.scores.A}</p></GlassCard><GlassCard className="text-center"><p className="text-white/50 text-sm">Round</p><p className="text-2xl font-bold">{game.round} / {game.setup.rounds}</p><p className="text-neon-cyan mt-1">{secondsLeft}s</p></GlassCard><GlassCard><p className="text-white/50 text-sm">{game.setup.teamB.name}</p><p className="text-3xl font-bold">{game.scores.B}</p></GlassCard></div>
    {game.currentChallenge && game.phase !== "finished" && <ChallengeBanner challenge={game.currentChallenge} mode={game.setup.gameMode} completed={game.challengeCompleted}/>} 
    <GlassCard className="mb-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-white/50">Current turn</p><div className="flex items-center gap-2"><h1 className="text-3xl font-display font-bold">{currentTeam.name}</h1>{isAiTurn && <span className="inline-flex items-center gap-1 rounded-full border border-neon-cyan/25 bg-neon-cyan/10 px-2.5 py-1 text-[11px] font-semibold text-neon-cyan"><Bot className="w-3.5 h-3.5"/> AI</span>}</div><p className="text-white/70">{currentMember}'s turn</p></div><div className="text-right min-w-52"><p className="text-sm text-white/50">This turn starts with</p><p className="text-2xl font-bold text-neon-cyan">{game.expectedStartSound || "Any letter"}</p>{game.setup.gameMode === "classic" && game.phase !== "declaring" && game.currentSong?.mode === "karaoke" && game.currentSong?.lastSound && <div className="mt-3 rounded-xl border border-neon-pink/30 bg-neon-pink/10 px-4 py-2"><p className="text-[11px] uppercase tracking-wider text-white/50">Next turn starts with</p><p className="text-3xl font-display font-extrabold text-neon-pink">{game.currentSong.lastSound}</p></div>}</div></div></GlassCard>
    <GlassCard><div className="text-center">
      {game.phase === "declaring" && (isAiTurn ? <div className="py-6"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-neon-cyan/30 bg-neon-cyan/10"><Bot className="w-8 h-8 text-neon-cyan animate-pulse"/></div><p className="text-xl font-display font-bold">Sursangram is thinking...</p><p className="text-white/50 mt-2">{game.expectedStartSound ? `Finding a song starting with “${game.expectedStartSound}”` : "Choosing the opening song"}</p><p className="text-xs text-white/35 mt-4">The AI will play its Apple song preview automatically.</p><ErrorText>{message}</ErrorText></div> : <><label className="block text-sm text-white/60 mb-2">Announce the song</label><div className="flex gap-2 max-w-2xl mx-auto"><input value={text} onChange={e => { audioSynth.unlock(); primeSongAudio(); autoSubmittedTextRef.current = ""; setText(e.target.value); }} onKeyDown={e => e.key === "Enter" && submit()} placeholder="Type song title or use the mic" className="flex-1 rounded-lg bg-white/5 border border-white/15 px-4 py-3 outline-none focus:border-neon-cyan"/><Button variant="secondary" onClick={() => { audioSynth.unlock(); listening ? stopSpeech() : start(); }}><Mic className="w-5 h-5"/></Button><Button variant="secondary" onClick={() => { audioSynth.unlock(); primeSongAudio(); submit(""); }}><Shuffle className="w-5 h-5"/></Button><Button disabled={busy || !text.trim()} onClick={() => { audioSynth.unlock(); primeSongAudio(); submit(); }}><Send className="w-5 h-5"/></Button></div><p className="text-xs text-white/40 mt-2">{listening ? "Listening…" : "Type the song and search starts automatically."}</p>{supported && <p className="text-[11px] text-white/30 mt-1">Mic supports Hindi/English speech on compatible browsers.</p>}<ErrorText>{message}</ErrorText></>)}
      {game.phase === "active" && <><p className="text-white/60">{game.currentSong?.mode === "random-jam" ? `🎲 ${game.currentSong.category} BGM` : `🎵 Apple song preview · ${game.currentSong?.title}`}</p>{game.currentSong?.mode === "karaoke" && game.setup.gameMode === "classic" && game.currentSong?.lastSound && <div className="mx-auto mt-3 mb-2 max-w-sm rounded-xl border border-neon-pink/25 bg-neon-pink/10 px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-white/45">Next turn starts with</p><p className="text-4xl font-display font-extrabold text-neon-pink">{game.currentSong.lastSound}</p></div>}<p className="text-6xl font-display font-extrabold my-5 tabular-nums">{secondsLeft}</p><div className="flex justify-center gap-3">{game.currentChallenge && !game.challengeCompleted && <Button variant="secondary" onClick={markChallengeDone}>Challenge Done</Button>}<Button onClick={doneSinging}>I'm Done Singing</Button></div></>}
      {game.phase === "validation" && <><p className="text-white/70 mb-4">Was that a valid turn?</p><div className="flex justify-center gap-4"><Button variant="secondary" onClick={() => validate(true)}><ThumbsUp className="inline w-4 h-4 mr-2"/> Valid</Button><Button variant="secondary" onClick={() => validate(false)}><ThumbsDown className="inline w-4 h-4 mr-2"/> Invalid</Button></div></>}
    </div></GlassCard>
    <ErrorText>{message}</ErrorText>
    <div className="mt-5 space-y-2">{game.history.slice(-6).reverse().map((h,i)=><div key={i} className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 flex justify-between text-sm"><span>{h.member} · {h.title}{h.challenge ? ` · ${h.challenge}` : ""}</span><span className={h.points >= 0 ? "text-neon-cyan" : "text-red-300"}>{h.points > 0 ? `+${h.points}` : h.points}</span></div>)}</div>
  </div>;
}
