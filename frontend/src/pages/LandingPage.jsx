import React from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Mic2, Users, Zap, Trophy, Sparkles, Music2 } from "lucide-react";
import { motion } from "framer-motion";
import Button from "../components/Button.jsx";
import GlassCard from "../components/GlassCard.jsx";

const modes = [
  {
    title: "Classic Antakshari",
    desc: "The timeless game — sing, chain the letters, score points.",
    icon: Mic2,
  },
  {
    title: "Chaos Mode",
    desc: "Random challenges. Sing like a villain, a news reporter, or worse.",
    icon: Sparkles,
  },
  {
    title: "Battle Mode",
    desc: "Fixed rounds, live scoreboard, winner takes bragging rights.",
    icon: Trophy,
  },
];

const features = [
  { title: "Voice song detection", desc: "Announce your song, we find the track." },
  { title: "Song previews", desc: "The song you announce starts playing instantly." },
  { title: "AI Roast Host", desc: "A savage Bollywood-style commentator." },
  { title: "Real team battles", desc: "Two teams, live scores, real stakes." },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center pt-12 pb-16"
      >
        <div className="mx-auto mb-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 shadow-2xl backdrop-blur-xl">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-cyan-400/20 border border-white/10">
            <Music2 className="w-5 h-5 text-neon-cyan" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">AI powered Antakshri</span>
        </div>
        <h1 className="text-6xl md:text-8xl font-display font-black tracking-[-0.04em] leading-none">
          Sur<span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-pink-300 to-cyan-300">sangram</span>
        </h1>
        <p className="mt-5 text-base md:text-xl font-semibold text-white/80">
          Sursangram is an AI Antakshri.
        </p>
        <p className="mt-2 text-sm md:text-base text-white/45 max-w-xl mx-auto">
          Sing the song. Follow the letter. Roast your friends. Let the best voice survive.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Button onClick={() => navigate("/local-setup")}>
            <Users className="inline w-5 h-5 mr-2 -mt-1" />
            Play Together
          </Button>
          <Button variant="secondary" onClick={() => navigate("/ai-setup")}>
            <Bot className="inline w-5 h-5 mr-2 -mt-1" />
            Play with AI
          </Button>
          <Button variant="secondary" onClick={() => navigate("/create")}>
            <Zap className="inline w-5 h-5 mr-2 -mt-1" />
            Create Online Room
          </Button>
          <Button variant="secondary" onClick={() => navigate("/join")}>
            Join Room
          </Button>
        </div>
      </motion.section>

      <section className="mb-16">
        <h2 className="text-2xl font-display font-bold mb-6 text-center">
          Game Modes
        </h2>
        <div className="grid md:grid-cols-3 gap-5">
          {modes.map((m) => (
            <GlassCard key={m.title} className="hover:shadow-glow transition">
              <m.icon className="w-8 h-8 text-neon-violet mb-3" />
              <h3 className="font-semibold text-lg mb-1">{m.title}</h3>
              <p className="text-white/60 text-sm">{m.desc}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-display font-bold mb-6 text-center">
          How To Play
        </h2>
        <GlassCard>
          <ol className="space-y-3 text-white/80 list-decimal list-inside">
            <li>Play Together: sit around one device and create both teams manually.</li>
            <li>Or create/join an online room and invite friends with a room code.</li>
            <li>On your turn, announce your song into the mic.</li>
            <li>Sing for up to 30 seconds while your selected song preview plays.</li>
            <li>Score points, pass the letter, and watch your team climb.</li>
          </ol>
        </GlassCard>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-display font-bold mb-6 text-center">
          Features
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <GlassCard key={f.title}>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-white/60 text-sm">{f.desc}</p>
            </GlassCard>
          ))}
        </div>
      </section>
    </div>
  );
}
