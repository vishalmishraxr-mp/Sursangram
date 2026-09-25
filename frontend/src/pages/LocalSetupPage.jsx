import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Trash2, Play, ArrowLeft, Sparkles, Mic2 } from "lucide-react";
import GlassCard from "../components/GlassCard.jsx";
import Button from "../components/Button.jsx";
import ErrorText from "../components/ErrorText.jsx";

function MemberEditor({ members, setMembers, label }) {
  const [draft, setDraft] = useState("");
  function add() {
    const name = draft.trim();
    if (!name || members.length >= 8) return;
    setMembers([...members, name]);
    setDraft("");
  }
  return (
    <GlassCard className="flex-1">
      <h2 className="font-display font-bold text-xl mb-1">{label}</h2>
      <p className="text-white/50 text-sm mb-4">Add the people sitting on this team.</p>
      <div className="flex gap-2 mb-4">
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} maxLength={24} placeholder="Member name" className="flex-1 rounded-lg bg-white/5 border border-white/15 px-3 py-2 outline-none focus:border-neon-cyan" />
        <Button type="button" className="px-4" onClick={add}><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="space-y-2 min-h-24">
        {members.map((name, i) => <div key={`${name}-${i}`} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2"><span>{name}</span><button onClick={() => setMembers(members.filter((_, j) => j !== i))} className="text-white/40 hover:text-red-300"><Trash2 className="w-4 h-4" /></button></div>)}
        {!members.length && <p className="text-sm text-white/35">No members yet.</p>}
      </div>
    </GlassCard>
  );
}

export default function LocalSetupPage() {
  const navigate = useNavigate();
  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
  const [rounds, setRounds] = useState(10);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [gameMode, setGameMode] = useState("classic");
  const [randomJamMode, setRandomJamMode] = useState(true);
  const [specialChallenges, setSpecialChallenges] = useState(true);
  const [roastHost, setRoastHost] = useState(true);
  const [roastIntensity, setRoastIntensity] = useState("mild");
  const [error, setError] = useState("");

  const canStart = useMemo(() => teamA.length > 0 && teamB.length > 0 && teamAName.trim() && teamBName.trim(), [teamA, teamB, teamAName, teamBName]);

  function start() {
    if (!canStart) return setError("Both teams need a name and at least one member.");
    const setup = {
      teamA: { name: teamAName.trim(), members: teamA },
      teamB: { name: teamBName.trim(), members: teamB },
      rounds: Math.max(1, Number(rounds) || 10),
      turnSeconds: Math.max(10, Number(turnSeconds) || 30),
      gameMode,
      randomJamMode,
      specialChallenges,
      roastHost,
      roastIntensity: roastHost ? roastIntensity : "off",
    };
    sessionStorage.setItem("antakshari_local_setup", JSON.stringify(setup));
    navigate("/local-game");
  }

  return <div className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
    <button onClick={() => navigate("/")} className="text-white/60 hover:text-white flex items-center gap-2 mb-8"><ArrowLeft className="w-4 h-4" /> Back</button>
    <div className="text-center mb-8"><div className="flex justify-center mb-3"><Users className="w-9 h-9 text-neon-cyan" /></div><h1 className="text-4xl font-display font-bold">Play Together</h1><p className="text-white/60 mt-2">The full Antakshari experience on one device. Every game feature is available here too.</p></div>
    <div className="grid md:grid-cols-2 gap-5 mb-6">
      <div><label className="block text-sm text-white/60 mb-1">Team A name</label><input value={teamAName} onChange={e => setTeamAName(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 outline-none focus:border-neon-cyan" /></div>
      <div><label className="block text-sm text-white/60 mb-1">Team B name</label><input value={teamBName} onChange={e => setTeamBName(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5 outline-none focus:border-neon-pink" /></div>
    </div>
    <div className="flex flex-col md:flex-row gap-5"><MemberEditor label={teamAName || "Team A"} members={teamA} setMembers={setTeamA} /><MemberEditor label={teamBName || "Team B"} members={teamB} setMembers={setTeamB} /></div>

    <GlassCard className="mt-5">
      <h2 className="font-display font-bold text-xl mb-4">Game settings</h2>
      <div className="grid md:grid-cols-3 gap-3 mb-5">
        {[['classic','Classic','Letter chain + standard scoring',Mic2],['chaos','Chaos','Random performance challenges',Sparkles],['dare','Dare','Dare-only challenge pool',Sparkles]].map(([value,title,desc,Icon]) => <button key={value} onClick={() => setGameMode(value)} className={`text-left rounded-xl border p-4 transition ${gameMode === value ? 'border-neon-cyan bg-neon-cyan/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}><Icon className="w-5 h-5 mb-2 text-neon-cyan"/><p className="font-semibold">{title}</p><p className="text-xs text-white/50 mt-1">{desc}</p></button>)}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className="block text-sm text-white/60 mb-1">Rounds</label><input type="number" min="1" max="50" value={rounds} onChange={e => setRounds(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5" /></div>
        <div><label className="block text-sm text-white/60 mb-1">Song play time (seconds)</label><input type="number" min="10" max="30" value={turnSeconds} onChange={e => setTurnSeconds(Math.min(30, Math.max(10, Number(e.target.value) || 30)))} className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5" /></div>
        <p className="text-xs text-white/35 sm:col-span-2">30-second turn · song preview plays for the turn</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-5 text-sm">
        <label className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-3"><input type="checkbox" checked={randomJamMode} onChange={e => setRandomJamMode(e.target.checked)} /> Random Jam fallback</label>
        <label className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-3"><input type="checkbox" checked={specialChallenges} onChange={e => setSpecialChallenges(e.target.checked)} disabled={gameMode === 'classic'} /> Special challenges</label>
        <label className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-3"><input type="checkbox" checked={roastHost} onChange={e => setRoastHost(e.target.checked)} /> Roast Host</label>
      </div>
      {roastHost && <div className="mt-3"><label className="block text-sm text-white/60 mb-1">Roast intensity</label><select value={roastIntensity} onChange={e => setRoastIntensity(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 px-4 py-2.5"><option value="mild">Mild</option><option value="savage">Savage</option><option value="full-chaos">Full Chaos</option></select></div>}
      <ErrorText>{error}</ErrorText>
      <Button className="w-full mt-5" disabled={!canStart} onClick={start}><Play className="inline w-4 h-4 mr-2" /> Start Battle</Button>
    </GlassCard>
  </div>;
}
